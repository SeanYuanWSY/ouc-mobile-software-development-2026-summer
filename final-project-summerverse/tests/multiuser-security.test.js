const test = require('node:test');
const assert = require('node:assert/strict');
const { database } = require('./helpers/account-db');
const { createVault } = require('../cloudfunctions/deepseekProxy/credential-vault');
const { createInbox } = require('../cloudfunctions/assistantInbox/service');
const { createGateway } = require('../cloudfunctions/assistantGateway/service');
const { hash } = require('../cloudfunctions/assistantGateway/policy');
const env = { AI_VAULT_KEY: Buffer.alloc(32, 7).toString('base64') }; // Synthetic test secret, never a deployed key.
const config = { provider: 'deepseek', apiKeyOverride: 'synthetic-test-key' };
test('vault encrypts at rest, isolates owners, pins destination, and never returns key in status', async () => {
  const db = database(), vault = createVault(db, env);
  const a = await vault.manage('alice', 'app', { action: 'credential.save', expectedVersion: 0, config });
  assert(!JSON.stringify(db.snapshot()).includes(config.apiKeyOverride));
  assert(!JSON.stringify(a).includes(config.apiKeyOverride));
  assert.equal((await vault.manage('bob', 'app', { action: 'credential.status' })).credential, null);
  const request = { config: { credentialId: a.credential.id, credentialVersion: 1 } };
  assert.equal((await vault.resolve('alice', 'app', request)).apiKey, config.apiKeyOverride);
  await assert.rejects(vault.resolve('bob', 'app', request), { code: 'AI_KEY_MISSING' });
  await assert.rejects(vault.resolve('alice', 'other-app', request), { code: 'AI_KEY_MISSING' });
  await assert.rejects(vault.resolve('alice', 'app', { config: { ...request.config, endpoint: 'https://other.example/v1' } }), { code: 'BAD_REQUEST' });
  await vault.manage('alice', 'app', { action: 'credential.delete', expectedVersion: 1 });
  await assert.rejects(vault.resolve('alice', 'app', request), { code: 'AI_KEY_MISSING' });
  assert(!JSON.stringify(db.snapshot()).includes('ciphertext'));
});
test('vault rejects concurrent overwrite, unavailable key, ciphertext and metadata tampering', async () => {
  const db = database(), vault = createVault(db, env);
  const input = { action: 'credential.save', expectedVersion: 0, config };
  const outcomes = await Promise.allSettled([vault.manage('alice', 'app', input), vault.manage('alice', 'app', input)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const row = outcomes.find(r => r.status === 'fulfilled').value.credential;
  await assert.rejects(createVault(database(), {}).manage('alice', 'app', input), { code: 'AI_VAULT_UNAVAILABLE' });
  const ref = db.collection('ai_credentials').doc(row.id);
  await ref.update({ data: { endpoint: 'https://attacker.example/chat/completions' } });
  await assert.rejects(vault.resolve('alice', 'app', { config: { credentialId: row.id, credentialVersion: 1 } }), { code: 'AI_VAULT_UNAVAILABLE' });
});
async function libraryFixture(scopes) {
  const db = database(), inbox = createInbox(db), gateway = createGateway(db);
  const { token, connection } = await inbox('alice', { action: 'connect', name: 'My Kimi', readRecent: false, scopes });
  for (const owner of ['alice', 'bob']) {
    await db.collection('material_workspaces').doc(hash(`${owner}:$index`)).set({ data: { _openid: owner, ids: ['course'] } });
    await db.collection('material_workspaces').doc(hash(`${owner}:course`)).set({ data: {
      _openid: owner, id: 'course', title: owner, revision: 1, updatedAt: '2026-09-19', tasks: [{ id: 't1', title: 'Write report', done: false }],
      sources: [{ id: 's1', name: 'Assignment', kind: 'text', chunks: [{ id: 'c1', text: owner + 'x'.repeat(7000) }] }]
    } });
  }
  return { db, inbox, gateway, token, connection };
}
test('personal MCP reads without dispatch, A/B isolation, explicit scopes and revoked cursors', async () => {
  const f = await libraryFixture(['tasks.read', 'materials.read', 'results.submit']);
  assert.equal((await f.gateway(f.token, { action: 'library.list' })).data.workspaces[0].title, 'alice');
  await assert.rejects(f.gateway(f.token, { action: 'library.list', _openid: 'bob' }), { code: 'BAD_REQUEST' });
  const read = { action: 'library.source', id: 'course', sourceId: 's1' };
  const first = (await f.gateway(f.token, read)).data;
  assert(first.text.includes('alice')); assert(!first.text.includes('bob')); assert(first.nextCursor);
  assert.equal((await f.gateway(f.token, { ...read, cursor: first.nextCursor })).data.nextCursor, null);
  const second = await f.inbox('alice', { action: 'connect', name: 'Other Kimi', readRecent: false, scopes: ['tasks.read', 'materials.read'] });
  await assert.rejects(f.gateway(second.token, { ...read, cursor: first.nextCursor }), { code: 'CONFLICT' });
  await f.inbox('alice', { action: 'revoke', id: f.connection.id });
  await assert.rejects(f.gateway(f.token, { ...read, cursor: first.nextCursor }), { code: 'UNAUTHORIZED' });
});
test('legacy grants never expand; read-only workspace grant cannot write or read sources', async () => {
  const f = await libraryFixture(['tasks.read']);
  assert.equal((await f.gateway(f.token, { action: 'library.workspace', id: 'course' })).data.sources.length, 0);
  await assert.rejects(f.gateway(f.token, { action: 'library.source', id: 'course', sourceId: 's1' }), { code: 'FORBIDDEN' });
  await assert.rejects(f.gateway(f.token, { action: 'draft.submit', requestId: 'r1', draft: { kind: 'memory', title: 'test', content: '', date: '2026-09-19' } }), { code: 'FORBIDDEN' });
  const old = await f.inbox('alice', { action: 'connect', name: 'Legacy', readRecent: true, workJobs: true });
  await assert.rejects(f.gateway(old.token, { action: 'library.list' }), { code: 'FORBIDDEN' });
});
test('account local state and in-flight responses do not cross subjects', async () => {
  const app = { globalData: { accountSubject: 'a'.repeat(64), accountEpoch: 1, cloudReady: true } };
  const values = new Map(); let reply;
  global.getApp = () => app;
  global.wx = { getStorageSync: k => values.get(k), setStorageSync: (k, v) => values.set(k, v), cloud: { callFunction: ({ success }) => { reply = success; } } };
  try {
    const storage = require('../miniprogram/utils/storage');
    storage.set('private', 'alice');
    const cloud = require('../miniprogram/services/cloud');
    const pending = cloud.callFunction('dataService');
    await new Promise(resolve => setImmediate(resolve));
    app.globalData.accountSubject = 'b'.repeat(64); app.globalData.accountEpoch++;
    assert.equal(storage.get('private'), null);
    reply({ result: { ok: true, data: 'alice' } });
    await assert.rejects(pending, { code: 'ACCOUNT_CHANGED' });
    app.globalData.accountSubject = 'a'.repeat(64);
    assert.equal(storage.get('private'), 'alice');
  } finally { delete global.wx; delete global.getApp; }
});
test('account switch while waiting for connection never dispatches the old payload', async () => {
  let ready; let sent = 0;
  const app = { globalData: { accountSubject: 'a'.repeat(64), accountEpoch: 1 }, awaitCloudReady: () => new Promise(r => { ready = r; }) };
  global.getApp = () => app; global.wx = { cloud: { callFunction() { sent++; } } };
  try {
    const pending = require('../miniprogram/services/cloud').callFunction('dataService', { action: 'memory.add', payload: { title: 'alice-private' } });
    app.globalData.accountSubject = 'b'.repeat(64); app.globalData.accountEpoch++;
    ready(true);
    await assert.rejects(pending, { code: 'ACCOUNT_CHANGED' }); assert.equal(sent, 0);
  } finally { delete global.wx; delete global.getApp; }
});
test('v2 connection effective job permission comes only from explicit scope', async () => {
  const db = database(), inbox = createInbox(db), gateway = createGateway(db);
  const c = await inbox('alice', { action: 'connect', name: 'reader', readRecent: false, workJobs: true, scopes: ['tasks.read'] });
  assert.equal(c.connection.workJobs, false);
  await assert.rejects(gateway(c.token, { action: 'job.list' }), { code: 'FORBIDDEN' });
  const jobOnly = await inbox('alice', { action: 'connect', name: 'specific jobs', readRecent: false, scopes: ['jobs.execute'] });
  assert.equal(jobOnly.connection.workJobs, true);
  await assert.rejects(gateway(jobOnly.token, { action: 'library.list' }), { code: 'FORBIDDEN' });
});
test('workspace outcome closes on phone without manufacturing a factual memory or completion', async () => {
  const f = await libraryFixture(['tasks.read', 'results.submit']);
  const draft = { kind: 'result', title: 'Assignment outline', content: 'AI-generated draft for review' };
  await f.gateway(f.token, { action: 'draft.submit', requestId: 'outcome1', draft });
  const id = (await f.inbox('alice', { action: 'list' })).drafts[0].id;
  await assert.rejects(f.inbox('bob', { action: 'accept', id, draft }), { code: 'NOT_FOUND' });
  await f.inbox('alice', { action: 'accept', id, draft });
  const next = await f.inbox('alice', { action: 'list' });
  assert.equal(next.results[0].draft.content, draft.content);
  assert.equal(f.db.snapshot().memories, undefined); assert.equal(f.db.snapshot().goals, undefined);
  assert.equal((await f.gateway(f.token, { action: 'library.workspace', id: 'course' })).data.tasks[0].done, false);
});
test('credential refresh changes consent with destination and keeps session destination consistent', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const replies = []; let app;
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/app'), 'utf8'), {
    App: value => { app = value; },
    require: name => name === './services/cloud' ? { callFunction: () => new Promise(resolve => replies.push(resolve)) } : {},
    wx: {}, setTimeout, clearTimeout
  });
  Object.assign(app.globalData, { accountSubject: 'a'.repeat(64), accountEpoch: 1, aiConfigRevision: 1, aiConsent: { text: true }, aiProvider: 'custom', aiEndpoint: 'https://session.example/v1', aiSessionKey: 'synthetic-session-key' });
  const stored = { id: 'vault1', version: 1, provider: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'test', visionModel: '' };
  const refresh = app.refreshCredential(); replies.shift()({ data: { configured: true, version: 1, credential: stored } }); await refresh;
  assert.equal(app.globalData.aiCredential, null); assert.equal(app.globalData.aiEndpoint, 'https://session.example/v1');
  app.clearTemporaryApiKey(); assert.equal(app.globalData.aiCredential, null);
  const next = app.refreshCredential(); replies.shift()({ data: { configured: true, version: 1, credential: stored } }); await next;
  assert.equal(app.globalData.aiEndpoint, stored.endpoint); assert.equal(app.globalData.aiCredential.id, stored.id);
  assert.equal(app.globalData.aiConsent.text, undefined);
  const older = app.refreshCredential(), newer = app.refreshCredential();
  replies[1]({ data: { configured: true, version: 2, credential: { ...stored, version: 2 } } }); await newer;
  replies[0]({ data: { configured: true, version: 1, credential: stored } }); await older;
  assert.equal(app.globalData.aiCredential.version, 2);
});
test('personal adapter rejects other-user-readable credentials and symlinks', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { readConfig } = require('../integrations/mcp/personal.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-personal-test-'));
  try {
    const file = path.join(dir, 'connection.json');
    fs.writeFileSync(file, JSON.stringify({ url: 'https://relay.example.test/assistant', token: 'a'.repeat(64) }), { mode: 0o600 });
    assert.equal(typeof readConfig(file), 'function');
    const link = path.join(dir, 'link'); fs.symlinkSync(file, link); assert.throws(() => readConfig(link));
    fs.chmodSync(file, 0o644); if (process.platform !== 'win32') assert.throws(() => readConfig(file));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
