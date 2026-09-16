const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { prepareSubject } = require('./helpers/subject-load');
const { createInbox } = require('../cloudfunctions/assistantInbox/service');
const { createGateway } = require('../cloudfunctions/assistantGateway/service');
const { hash } = require('../cloudfunctions/assistantGateway/policy');
const { createProtocol, transport } = require('../integrations/mcp/server.cjs');
// Transactional in-memory fixture models commit/rollback and serial execution, not CloudBase integration.
function database() {
  let state = {}, queue = Promise.resolve();
  const collection = (store, name) => ({
    doc: id => ({
      get: async () => ({ data: store[name]?.[id] ? structuredClone({ ...store[name][id], _id: id }) : null }),
      set: async ({ data }) => { (store[name] ||= {})[id] = structuredClone(data); },
      update: async ({ data }) => { assert(store[name]?.[id]); Object.assign(store[name][id], structuredClone(data)); }
    }),
    where: condition => {
      let limit = 100;
      const q = { orderBy: () => q, limit: n => { limit = n; return q; }, get: async () => ({ data: Object.entries(store[name] || {}).filter(([, v]) => Object.entries(condition).every(([k, x]) => v[k] === x)).slice(0, limit).map(([id, v]) => ({ ...structuredClone(v), _id: id })) }) };
      return q;
    }
  });
  return { collection: name => collection(state, name), snapshot: () => structuredClone(state), runTransaction: fn => {
    const work = queue.then(async () => { const copy = structuredClone(state); const result = await fn({ collection: n => ({ doc: collection(copy, n).doc }) }); state = copy; return result; });
    queue = work.catch(() => {}); return work;
  } };
}
const sample = { kind: 'memory', title: '完成课程页面', content: '整理了页面布局', date: '2026-09-09' };
async function fixture(readRecent = false) {
  const db = database(); let time = 1800000000000;
  const inbox = createInbox(db, () => time), gateway = createGateway(db, () => time);
  const connection = await inbox('alice', { action: 'connect', name: '电脑', readRecent });
  return { db, inbox, gateway, ...connection, advance: () => { time += 31 * 86400000; } };
}
test('assistant policy deployment copies stay identical', () => {
  assert.equal(fs.readFileSync(require.resolve('../cloudfunctions/assistantInbox/policy'), 'utf8'), fs.readFileSync(require.resolve('../cloudfunctions/assistantGateway/policy'), 'utf8'));
});
test('connection secrets only returned once; no token in list or database', async () => {
  const f = await fixture();
  assert.match(f.token, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(f.db.snapshot()).includes(f.token));
  assert(!JSON.stringify(await f.inbox('alice', { action: 'list' })).includes(f.token));
  await assert.rejects(f.inbox('', { action: 'list' }));
  await assert.rejects(f.inbox('alice', { action: 'list', OPENID: 'bob' }));
});
test('default scope denies reads; gateway denies management and owner injection', async () => {
  const f = await fixture();
  await assert.rejects(f.gateway(f.token, { action: 'recent.read' }), { code: 'FORBIDDEN' });
  await assert.rejects(f.gateway(f.token, { action: 'connect' }));
  await assert.rejects(f.gateway(f.token, { action: 'draft.submit', requestId: 'a', draft: sample, _openid: 'bob' }));
  await assert.rejects(f.gateway('bad', { action: 'recent.read' }), { code: 'UNAUTHORIZED' });
  assert.equal(Object.keys(f.db.snapshot().assistant_connections).length, 1);
});
test('submit is idempotent; owner isolated; accept exactly once in concurrent retries', async () => {
  const f = await fixture();
  const request = { action: 'draft.submit', requestId: 'work-1', draft: sample };
  await Promise.all([f.gateway(f.token, request), f.gateway(f.token, request)]);
  assert.equal(Object.keys(f.db.snapshot().assistant_drafts).length, 1);
  assert.equal((await f.inbox('bob', { action: 'list' })).drafts.length, 0);
  const id = (await f.inbox('alice', { action: 'list' })).drafts[0].id;
  await assert.rejects(f.inbox('bob', { action: 'accept', id, draft: sample }));
  await Promise.all([f.inbox('alice', { action: 'accept', id, draft: sample }), f.inbox('alice', { action: 'accept', id, draft: sample })]);
  const records = Object.values(f.db.snapshot().memories);
  assert.equal(records.length, 1); assert.equal(records[0]._openid, 'alice'); assert.equal(records[0].source, 'ai-assisted');
  assert.equal((await f.gateway(f.token, { action: 'draft.status', requestId: 'work-1' })).data.status, 'accepted');
});
test('conflicting retry rejected; invalid dates and extra trusted fields rejected', async () => {
  const f = await fixture();
  await f.gateway(f.token, { action: 'draft.submit', requestId: 'one', draft: sample });
  await assert.rejects(f.gateway(f.token, { action: 'draft.submit', requestId: 'one', draft: { ...sample, title: 'other' } }), { code: 'CONFLICT' });
  for (const draft of [{ ...sample, date: '2026-02-30' }, { ...sample, source: 'manual' }, { ...sample, media: [] }, { ...sample, content: 'x'.repeat(3001) }]) await assert.rejects(f.gateway(f.token, { action: 'draft.submit', requestId: 'two', draft }));
});
test('revoked and expired connections fail; previous draft remains user controlled', async () => {
  const f = await fixture();
  await f.gateway(f.token, { action: 'draft.submit', requestId: 'a', draft: sample });
  await f.inbox('alice', { action: 'revoke', id: f.connection.id });
  await assert.rejects(f.gateway(f.token, { action: 'draft.status', requestId: 'a' }), { code: 'UNAUTHORIZED' });
  assert.equal((await f.inbox('alice', { action: 'list' })).drafts.length, 1);
  const g = await fixture(); g.advance();
  await assert.rejects(g.gateway(g.token, { action: 'recent.read' }), { code: 'UNAUTHORIZED' });
});
test('read output excludes other users, media and profile; quota enforced', async () => {
  const f = await fixture(true);
  await f.db.collection('memories').doc('a').set({ data: { _openid: 'alice', title: 'mine', content: 'text', media: ['private'], secret: 'private' } });
  await f.db.collection('memories').doc('b').set({ data: { _openid: 'bob', title: 'others' } });
  const result = await f.gateway(f.token, { action: 'recent.read' });
  assert.equal(result.data.memories.length, 1); assert(!JSON.stringify(result).includes('private'));
  for (let n = 1; n < 40; n++) await f.gateway(f.token, { action: 'recent.read' });
  await assert.rejects(f.gateway(f.token, { action: 'recent.read' }), { code: 'LIMIT' });
});
test('goal acceptance never completes a goal automatically; dismissal has no factual write', async () => {
  const f = await fixture(); const draft = { kind: 'goal', title: '读书', target: 3, unit: '页' };
  await f.gateway(f.token, { action: 'draft.submit', requestId: 'goal', draft });
  let returned = (await f.inbox('alice', { action: 'list' })).drafts[0];
  let id = returned.id;
  await f.inbox('alice', { action: 'accept', id, draft: returned.draft });
  assert.equal(Object.values(f.db.snapshot().goals)[0].current, 0);
  await f.gateway(f.token, { action: 'draft.submit', requestId: 'other', draft: sample });
  id = (await f.inbox('alice', { action: 'list' })).drafts[0].id;
  await f.inbox('alice', { action: 'dismiss', id });
  assert.equal(f.db.snapshot().memories, undefined);
});
test('MCP handshake, listing, draft and status use real backend contract', async () => {
  const f = await fixture(); const handle = createProtocol(data => f.gateway(f.token, data));
  const call = (method, params) => handle({ jsonrpc: '2.0', id: 1, method, params });
  assert((await call('tools/list')).error);
  assert.equal((await call('initialize', { protocolVersion: '2025-11-25' })).result.protocolVersion, '2025-11-25');
  await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const names = (await call('tools/list')).result.tools.map((tool) => tool.name);
  assert.equal(names.length, 6);
  for (const name of ['summerverse_recent', 'summerverse_submit', 'summerverse_status']) assert(names.includes(name));
  assert.equal((await call('tools/call', { name: 'summerverse_submit', arguments: { requestId: 'mcp', draft: sample } })).result.isError, false);
  assert((await call('tools/call', { name: 'summerverse_status', arguments: { requestId: 'mcp' } })).result.content[0].text.includes('pending'));
  assert((await call('tools/call', { name: 'summerverse_submit', arguments: { token: 'override' } })).error);
});
test('adapter rejects credential-bearing or insecure URLs', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?token=foo', 'https://example.com/#foo']) assert.throws(() => transport({ SUMMERVERSE_URL: url, SUMMERVERSE_TOKEN: 'a'.repeat(64) }));
});
test('actual entry handlers reject forged identity and HTTP management', async () => {
  function load(folder, openid) {
    const sdk = { init() {}, getWXContext: () => ({ OPENID: openid }), database: () => database() };
    const subject = folder === 'assistantInbox' ? '../cloudfunctions/assistantInbox/index' : '../cloudfunctions/assistantGateway/index';
    prepareSubject({ subject, mocks: [{ spec: 'wx-server-sdk', value: sdk }] });
    return subject === '../cloudfunctions/assistantInbox/index'
      ? require('../cloudfunctions/assistantInbox/index').main
      : require('../cloudfunctions/assistantGateway/index').main;
  }
  const inbox = load('assistantInbox', '');
  assert.equal((await inbox({ action: 'list', OPENID: 'alice' })).ok, false);
  assert.equal((await inbox({ action: 'list' })).code, 'UNAUTHORIZED');
  assert.equal((await load('assistantInbox', 'alice')({ httpMethod: 'POST', body: '{}', action: 'list' })).code, 'UNAUTHORIZED');
  const http = load('assistantGateway', 'alice');
  const response = await http({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + 'a'.repeat(64), 'content-type': 'application/json' }, body: JSON.stringify({ action: 'connect', name: 'forged', readRecent: true }) });
  assert.equal(JSON.parse(response.body).ok, false);
});
test('late connection response after hide/show does not restore credential', async () => {
  let page, resolve, selection;
  const api = { request: (action, data) => action === 'connect' ? (selection = data, new Promise(r => { resolve = r; })) : Promise.resolve({ drafts: [], connections: [] }) };
  prepareSubject({
    subject: '../miniprogram/pages/inbox/index',
    mocks: [
      { spec: '../../utils/experience', value: require('../miniprogram/utils/experience') },
      { spec: '../../services/assistant', value: api },
      { spec: '../../utils/navigation', value: {} },
    ],
    globals: { Page: p => { page = p; }, wx: { showModal: options => options.success({ confirm: true }), showToast() {} } },
  });
  require('../miniprogram/pages/inbox/index');
  page.setData = change => Object.assign(page.data, change);
  page.onShow(); page.data.name = 'my laptop';
  const pending = page.connect(); await Promise.resolve(); await Promise.resolve();
  page.data.readRecent = true;
  page.onHide(); page.onShow(); resolve({ token: 'fixture-only' }); await pending;
  assert.equal(page.data.token, ''); assert.equal(selection.readRecent, false);
});
