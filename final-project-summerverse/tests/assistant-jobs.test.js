const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInbox } = require('../cloudfunctions/assistantInbox/service');
const { createGateway } = require('../cloudfunctions/assistantGateway/service');
const { hash } = require('../cloudfunctions/assistantGateway/policy');
const { LEASE_MS, MAX_CLAIMS } = require('../cloudfunctions/assistantGateway/jobs');
const { transport } = require('../integrations/mcp/server.cjs');
// Models atomic document transactions, not Tencent's deployed database or permissions.
function database(initial = {}) {
  let state = structuredClone(initial), queue = Promise.resolve();
  const collection = (store, name) => ({
    doc: id => ({
      get: async () => ({ data: store[name]?.[id] ? structuredClone({ ...store[name][id], _id: id }) : null }),
      set: async ({ data }) => { (store[name] ||= {})[id] = structuredClone(data); },
      update: async ({ data }) => { if (!store[name]?.[id]) throw new Error('Missing document'); Object.assign(store[name][id], structuredClone(data)); }
    }),
    where: condition => {
      let count = 100;
      const query = { orderBy: () => query, limit: n => { count = n; return query; }, get: async () => ({ data: Object.entries(store[name] || {}).filter(([, item]) => Object.entries(condition).every(([key, value]) => item[key] === value)).slice(0, count).map(([id, item]) => ({ ...structuredClone(item), _id: id })) }) };
      return query;
    }
  });
  const api = { collection: name => collection(state, name), snapshot: () => structuredClone(state), afterCommit: null, runTransaction: fn => {
    const next = queue.then(async () => { const copy = structuredClone(state); const result = await fn({ collection: name => ({ doc: collection(copy, name).doc }) }); state = copy; if (api.afterCommit) await api.afterCommit(); return result; });
    queue = next.catch(() => {}); return next;
  } };
  return api;
}
const materials = [{ id: 'source1', name: '老师要求', kind: 'text', extraction: 'plain', chunks: [{ id: 'chunk1', locator: '第一段', text: '请在周五提交原型和使用说明。' }] }];
const answer = { title: '交付建议', text: '先整理原型，再检查使用说明。请确认周五对应的具体日期。', evidence: [{ sourceId: 'source1', chunkId: 'chunk1', quote: '周五提交原型和使用说明' }] };
async function fixture(workJobs = true, readRecent = false) {
  const db = database(); let time = 1800000000000;
  const inbox = createInbox(db, () => time), gateway = createGateway(db, () => time);
  const connection = await inbox('alice', { action: 'connect', name: '我的电脑', readRecent, ...(workJobs === undefined ? {} : { workJobs }) });
  await db.collection('material_workspaces').doc(hash('alice:workspace1')).set({ data: { _openid: 'alice', id: 'workspace1', title: '课程原型', revision: 3, sources: materials, tasks: [] } });
  const request = { action: 'job.create', requestId: 'request1', connectionId: connection.connection.id, workspaceId: 'workspace1', revision: 3, sourceIds: ['source1'], prompt: '请整理交付顺序' };
  const create = (extra = {}) => inbox('alice', { ...request, ...extra });
  return { db, inbox, gateway, ...connection, request, create, get time() { return time; }, advance: delta => { time += delta; } };
}
test('relay deployment copies match; capabilities and scopes are explicit', async () => {
  for (const name of ['jobs.js', 'policy.js']) assert.equal(fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/assistantGateway', name), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/assistantInbox', name), 'utf8'));
  const f = await fixture(false, true);
  assert.deepEqual(await f.inbox('alice', { action: 'capabilities' }), { jobsProtocol: 'relay-v1' });
  await assert.rejects(f.create(), { code: 'FORBIDDEN' });
  await assert.rejects(f.gateway(f.token, { action: 'job.list' }), { code: 'FORBIDDEN' });
  const old = await f.inbox('alice', { action: 'connect', name: '旧客户端', readRecent: true });
  assert.equal(old.connection.workJobs, false);
  await assert.rejects(f.inbox('', { action: 'capabilities' }), { code: 'UNAUTHORIZED' });
  for (const input of [{ action: 'capabilities', owner: 'bob' }, { action: 'list', id: 'unexpected' }, { action: 'job.list', prompt: 'unexpected' }]) await assert.rejects(f.inbox('alice', input), { code: 'BAD_REQUEST' });
});
test('phone creates immutable selected snapshot; revision, replay and body injection are rejected', async () => {
  const f = await fixture();
  const [first, second] = await Promise.all([f.create(), f.create()]);
  assert.equal(first.job.id, second.job.id); assert.deepEqual(first.job.sources, materials);
  assert.equal(f.db.snapshot().assistant_accounts[hash('alice')].pending, 0);
  assert.equal(f.db.snapshot().assistant_accounts[hash('alice')].jobIds.length, 1);
  const workspace = f.db.collection('material_workspaces').doc(hash('alice:workspace1'));
  await workspace.update({ data: { revision: 4, sources: [{ ...materials[0], chunks: [{ id: 'chunk1', locator: '第一段', text: '新版内容' }] }] } });
  assert.deepEqual((await f.inbox('alice', { action: 'job.get', id: first.job.id })).job.sources, materials);
  assert.equal((await f.create()).job.id, first.job.id);
  await assert.rejects(f.create({ prompt: '不同要求' }), { code: 'CONFLICT' });
  await assert.rejects(f.create({ requestId: 'new' }), { code: 'REVISION_CONFLICT' });
  for (const extra of [{ body: '伪造内容' }, { sources: materials }, { sourceIds: ['source1', 'source1'] }, { sourceIds: ['nonexistent'], revision: 4 }]) await assert.rejects(f.create({ requestId: 'new', ...extra }));
});
test('cross-account and cross-connection job access and legacy draft paths are isolated', async () => {
  const f = await fixture(), { job } = await f.create();
  const other = await f.inbox('alice', { action: 'connect', name: '另一台电脑', readRecent: false, workJobs: true });
  const bob = await f.inbox('bob', { action: 'connect', name: '其他人电脑', readRecent: false, workJobs: true });
  for (const token of [other.token, bob.token]) {
    assert.equal((await f.gateway(token, { action: 'job.list' })).data.jobs.length, 0);
    await assert.rejects(f.gateway(token, { action: 'job.claim', id: job.id, claimId: 'claim1' }), { code: 'NOT_FOUND' });
  }
  for (const action of ['job.get', 'job.accept', 'job.cancel']) await assert.rejects(f.inbox('bob', { action, id: job.id }), { code: 'NOT_FOUND' });
  for (const action of ['accept', 'dismiss']) await assert.rejects(f.inbox('alice', { action, id: job.id }), { code: 'NOT_FOUND' });
  assert.equal((await f.inbox('alice', { action: 'list' })).drafts.length, 0);
  const legacy = hash(hash(f.token) + ':legacy');
  await f.db.collection('assistant_drafts').doc(legacy).set({ data: { type: 'job', _openid: 'alice', connectionId: hash(f.token), status: 'pending' } });
  await assert.rejects(f.gateway(f.token, { action: 'draft.status', requestId: 'legacy' }), { code: 'NOT_FOUND' });
  assert.equal((await f.inbox('alice', { action: 'list' })).drafts.length, 0);
});
test('claim lease is idempotent, expires, and requires a new explicit claim to take over', async () => {
  const f = await fixture(), { job } = await f.create();
  const claim = { action: 'job.claim', id: job.id, claimId: 'claim1' };
  const first = await f.gateway(f.token, claim); f.advance(1000);
  assert.equal((await f.gateway(f.token, claim)).data.job.leaseUntil, first.data.job.leaseUntil);
  await assert.rejects(f.gateway(f.token, { ...claim, claimId: 'claim2' }), { code: 'CONFLICT' });
  f.advance(LEASE_MS);
  await assert.rejects(f.gateway(f.token, claim), { code: 'LEASE_EXPIRED' });
  await assert.rejects(f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'claim1', result: answer }), { code: 'LEASE_EXPIRED' });
  assert.equal((await f.gateway(f.token, { ...claim, claimId: 'claim2' })).data.job.claimId, 'claim2');
  await assert.rejects(f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'claim1', result: answer }), { code: 'CONFLICT' });
});
test('historical claim IDs cannot revive an old completion and claim history is bounded', async () => {
  const f = await fixture(), { job } = await f.create();
  const claim = claimId => f.gateway(f.token, { action: 'job.claim', id: job.id, claimId });
  await claim('A'); f.advance(LEASE_MS + 1);
  await claim('B'); f.advance(LEASE_MS + 1);
  await assert.rejects(claim('A'), { code: 'CLAIM_REUSED' });
  await claim('C');
  await assert.rejects(f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'A', result: answer }), { code: 'CONFLICT' });
  assert.deepEqual(f.db.snapshot().assistant_drafts[job.id].claimIds, ['A', 'B', 'C']);
  const g = await fixture(), second = (await g.create()).job;
  for (let n = 0; n < MAX_CLAIMS; n++) {
    await g.gateway(g.token, { action: 'job.claim', id: second.id, claimId: `c${n}` });
    if (n < MAX_CLAIMS - 1) g.advance(LEASE_MS + 1);
  }
  const current = g.db.snapshot().assistant_drafts[second.id];
  assert.equal((await g.gateway(g.token, { action: 'job.claim', id: second.id, claimId: current.claimId })).data.job.leaseUntil, current.leaseUntil);
  g.advance(LEASE_MS + 1);
  await assert.rejects(g.gateway(g.token, { action: 'job.claim', id: second.id, claimId: 'overflow' }), { code: 'CLAIM_LIMIT' });
  assert.equal(g.db.snapshot().assistant_drafts[second.id].claimIds.length, MAX_CLAIMS);
});
test('result citations are validated and exact result retries do not write real tasks or memories', async () => {
  const f = await fixture(), { job } = await f.create();
  await f.gateway(f.token, { action: 'job.claim', id: job.id, claimId: 'c1' });
  const complete = { action: 'job.complete', id: job.id, claimId: 'c1', result: answer };
  for (const result of [{ ...answer, evidence: [] }, { ...answer, evidence: [{ sourceId: 'source1', chunkId: 'chunk1', quote: '已完成全部工作' }] }, { ...answer, evidence: [{ ...answer.evidence[0], sourceId: 'another' }] }, { ...answer, text: '字'.repeat(3001) }, { ...answer, exec: 'do something' }]) await assert.rejects(f.gateway(f.token, { ...complete, result }));
  const first = await f.gateway(f.token, complete), second = await f.gateway(f.token, complete);
  assert.deepEqual(first, second); assert.equal(first.data.job.status, 'review');
  await assert.rejects(f.gateway(f.token, { ...complete, result: { ...answer, text: '不同结果' } }), { code: 'CONFLICT' });
  assert.equal((await f.inbox('alice', { action: 'job.accept', id: job.id })).job.status, 'accepted');
  assert.equal((await f.inbox('alice', { action: 'job.accept', id: job.id })).job.status, 'accepted');
  const state = f.db.snapshot(); assert.equal(state.memories, undefined); assert.equal(state.goals, undefined);
  assert.deepEqual(state.material_workspaces[hash('alice:workspace1')].tasks, []);
  assert.equal(state.assistant_accounts[hash('alice')].pending, 0);
});
test('cancel removes text and blocks all replays; revocation blocks late snapshot delivery', async () => {
  const f = await fixture(), { job } = await f.create();
  await f.gateway(f.token, { action: 'job.claim', id: job.id, claimId: 'c1' });
  await f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'c1', result: answer });
  await f.inbox('alice', { action: 'job.cancel', id: job.id });
  const cancelled = f.db.snapshot().assistant_drafts[job.id];
  for (const key of ['sources', 'prompt', 'result', 'title', 'workspaceId', 'claimId']) assert.equal(cancelled[key], undefined);
  await assert.rejects(f.create(), { code: 'CANCELLED' });
  await assert.rejects(f.gateway(f.token, { action: 'job.claim', id: job.id, claimId: 'c1' }), { code: 'CANCELLED' });
  await assert.rejects(f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'c1', result: answer }), { code: 'CANCELLED' });
  await assert.rejects(f.inbox('alice', { action: 'job.accept', id: job.id }), { code: 'CANCELLED' });
  const g = await fixture(), next = (await g.create()).job;
  g.db.afterCommit = async () => { g.db.afterCommit = null; await g.db.collection('assistant_connections').doc(hash(g.token)).update({ data: { revoked: true } }); };
  await assert.rejects(g.gateway(g.token, { action: 'job.claim', id: next.id, claimId: 'c1' }), { code: 'UNAUTHORIZED' });
  await assert.rejects(g.create(), { code: 'UNAUTHORIZED' });
});
test('source caps reject rather than truncate, response and request quotas stay bounded', async () => {
  const f = await fixture(), ref = f.db.collection('material_workspaces').doc(hash('alice:workspace1'));
  for (const chunks of [[{ id: 'c', locator: '全文', text: '字'.repeat(12001) }], Array.from({ length: 121 }, (_, i) => ({ id: `c${i}`, locator: '位置', text: '字' }))]) {
    await ref.update({ data: { sources: [{ ...materials[0], chunks }] } });
    await assert.rejects(f.create(), { code: 'SOURCE_LIMIT' });
  }
  await ref.update({ data: { sources: materials } }); const { job } = await f.create();
  for (let n = 1; n < 40; n++) await f.gateway(f.token, { action: 'job.list' });
  await assert.rejects(f.gateway(f.token, { action: 'job.list' }), { code: 'LIMIT' });
  assert.equal((await f.inbox('alice', { action: 'job.cancel', id: job.id })).job.status, 'cancelled');
  const g = await fixture();
  for (let n = 0; n < 20; n++) await g.create({ requestId: `r${n}` });
  await assert.rejects(g.create({ requestId: 'overflow' }), { code: 'JOB_LIMIT' });
  const first = (await g.inbox('alice', { action: 'job.list' })).jobs[0];
  await g.inbox('alice', { action: 'job.cancel', id: first.id });
  await g.create({ requestId: 'replacement' });
  assert.equal(g.db.snapshot().assistant_accounts[hash('alice')].jobIds.length, 20);
});
test('a full index preserves accepted results and retires only cleared cancelled tombstones', async () => {
  const f = await fixture(), { job } = await f.create();
  await f.gateway(f.token, { action: 'job.claim', id: job.id, claimId: 'c1' });
  await f.gateway(f.token, { action: 'job.complete', id: job.id, claimId: 'c1', result: answer });
  await f.inbox('alice', { action: 'job.accept', id: job.id });
  for (let n = 1; n < 20; n++) await f.create({ requestId: `r${n}` });
  await assert.rejects(f.create({ requestId: 'overflow' }), { code: 'JOB_LIMIT' });
  assert.equal((await f.inbox('alice', { action: 'job.list' })).jobs.find(item => item.id === job.id).status, 'accepted');
  assert.deepEqual((await f.inbox('alice', { action: 'job.get', id: job.id })).job.result, answer);
  const otherId = f.db.snapshot().assistant_accounts[hash('alice')].jobIds.find(id => id !== job.id);
  // A status alone is not evidence that stored private text has been cleared.
  await f.db.collection('assistant_drafts').doc(otherId).update({ data: { status: 'cancelled' } });
  await assert.rejects(f.create({ requestId: 'overflow' }), { code: 'JOB_LIMIT' });
  await f.inbox('alice', { action: 'job.cancel', id: otherId });
  await f.create({ requestId: 'replacement' });
  const ids = f.db.snapshot().assistant_accounts[hash('alice')].jobIds;
  assert.equal(ids.length, 20); assert(ids.includes(job.id)); assert(!ids.includes(otherId));
  assert.equal(f.db.snapshot().assistant_drafts[otherId].sources, undefined);
});
test('recent reads exclude deleted memory and goal tombstones', async () => {
  const f = await fixture(false, true);
  for (const collection of ['memories', 'goals']) {
    await f.db.collection(collection).doc('live').set({ data: { _openid: 'alice', title: '保留内容', content: '仍可见', current: 0, target: 1, unit: '次' } });
    await f.db.collection(collection).doc('deleted').set({ data: { _openid: 'alice', _deleted: true, title: '不应出现的删除内容', content: '已删除' } });
    await f.db.collection(collection).doc('empty-tombstone').set({ data: { _openid: 'alice', _deleted: true, _creation: 'marker' } });
  }
  const response = await f.gateway(f.token, { action: 'recent.read' });
  assert.equal(response.data.memories.length, 1); assert.equal(response.data.goals.length, 1);
  assert(!JSON.stringify(response).includes('删除内容'));
  assert.equal(response.data.memories[0].title, '保留内容'); assert.equal(response.data.goals[0].title, '保留内容');
});
test('late cancellation and revoked completion cannot release or re-submit content', async () => {
  const f = await fixture(), { job } = await f.create();
  f.db.afterCommit = async () => {
    f.db.afterCommit = null;
    await f.db.collection('assistant_drafts').doc(job.id).set({ data: { type: 'job', id: job.id, _openid: 'alice', connectionId: hash(f.token), status: 'cancelled', createdAt: f.time, leaseUntil: 0 } });
  };
  await assert.rejects(f.gateway(f.token, { action: 'job.claim', id: job.id, claimId: 'c1' }), { code: 'CANCELLED' });
  const g = await fixture(), second = (await g.create()).job;
  await g.gateway(g.token, { action: 'job.claim', id: second.id, claimId: 'c1' });
  const complete = { action: 'job.complete', id: second.id, claimId: 'c1', result: answer };
  await g.gateway(g.token, complete);
  await g.inbox('alice', { action: 'revoke', id: g.connection.id });
  await assert.rejects(g.gateway(g.token, complete), { code: 'UNAUTHORIZED' });
});
test('account budget, source count and MCP byte caps cannot be bypassed', async () => {
  const f = await fixture();
  await assert.rejects(f.create({ sourceIds: Array.from({ length: 7 }, (_, i) => `s${i}`) }), { code: 'SOURCE_LIMIT' });
  await f.db.collection('assistant_accounts').doc(hash('alice')).update({ data: { pending: 100 } });
  const { job } = await f.create(); // Relay is separate from the legacy pending-draft counter.
  await f.db.collection('assistant_accounts').doc(hash('alice')).update({ data: { day: new Date(f.time).toISOString().slice(0, 10), requests: 80 } });
  await assert.rejects(f.gateway(f.token, { action: 'job.list' }), { code: 'LIMIT' });
  await assert.rejects(f.create({ requestId: 'another' }), { code: 'LIMIT' });
  assert.equal((await f.inbox('alice', { action: 'job.cancel', id: job.id })).job.status, 'cancelled');
  const send = transport({ SUMMERVERSE_URL: 'https://fixture.example.test/relay', SUMMERVERSE_TOKEN: f.token });
  await assert.rejects(send({ action: 'job.complete', id: job.id, claimId: 'c1', result: { text: '字'.repeat(6000) } }), /Too large/);
  const previous = global.fetch;
  try {
    global.fetch = async () => ({ body: (async function* () { yield Buffer.alloc(262145); })() });
    await assert.rejects(send({ action: 'job.list' }), /Response too large/);
  } finally { global.fetch = previous; }
});
test('actual stdio entry runs phone create → tool claim → tool complete → phone accept', async () => {
  const f = await fixture(), { job } = await f.create();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-relay-test-'));
  try {
    const initial = path.join(directory, 'input.json'), output = path.join(directory, 'output.json'), bootstrap = path.join(directory, 'bootstrap.cjs');
    fs.writeFileSync(initial, JSON.stringify(f.db.snapshot()));
    // Synthetic token and database only. Real stdio entry + transport run, with network replaced by the backend service fixture.
    // 引导文件从 argv 取输入、服务与输出路径，require 一律为字面量模块或 createRequire 结果。
    fs.writeFileSync(bootstrap, `const fs=require('node:fs');const database=${database.toString()};const db=database(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));const {createRequire}=require('node:module');const req=createRequire(process.argv[3]);const run=req(process.argv[3]).createGateway(db,()=>${f.time});global.fetch=async(url,options)=>{const data=await run(options.headers.Authorization.slice(7),JSON.parse(options.body));fs.writeFileSync(process.argv[4],JSON.stringify(db.snapshot()));return {body:(async function*(){yield Buffer.from(JSON.stringify(data));})()};};`);
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'summerverse_jobs', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'summerverse_claim_job', arguments: { id: job.id, claimId: 'stdio1' } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'summerverse_complete_job', arguments: { id: job.id, claimId: 'stdio1', result: answer } } }
    ];
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--require', bootstrap, path.resolve(__dirname, '../integrations/mcp/server.cjs'), initial, require.resolve('../cloudfunctions/assistantGateway/service'), output], { env: { SUMMERVERSE_URL: 'https://fixture.example.test/relay', SUMMERVERSE_TOKEN: f.token }, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`)));
      child.stdin.end(messages.map(message => JSON.stringify(message)).join('\n') + '\n');
    });
    const replies = stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(replies.find(reply => reply.id === 2).result.tools.length, 6);
    const claimed = JSON.parse(replies.find(reply => reply.id === 4).result.content[0].text);
    assert.deepEqual(claimed.data.job.sources, materials);
    assert.equal(JSON.parse(replies.find(reply => reply.id === 5).result.content[0].text).data.job.status, 'review');
    assert(!stdout.includes(f.token));
    const acceptedDb = database(JSON.parse(fs.readFileSync(output, 'utf8')));
    assert.equal((await createInbox(acceptedDb, () => f.time)('alice', { action: 'job.accept', id: job.id })).job.status, 'accepted');
    assert.equal(acceptedDb.snapshot().memories, undefined);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
