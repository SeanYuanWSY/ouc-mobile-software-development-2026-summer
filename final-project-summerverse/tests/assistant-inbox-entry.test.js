const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
const database = require('../scripts/demo/database.cjs');

function fixture(owner = 'alice') {
  const db = database();
  prepareSubject({ subject: '../cloudfunctions/assistantInbox/index.js', mocks: [{
    spec: 'wx-server-sdk', value: {
      DYNAMIC_CURRENT_ENV: 'test', init() {},
      database(options) { assert.equal(options.throwOnNotFound, false); return db; },
      getWXContext() { return { OPENID: owner }; }
    }
  }] });
  return { main: require('../cloudfunctions/assistantInbox/index.js').main, db };
}

test('SDK metadata does not break capabilities or empty lists', async () => {
  const { main } = fixture();
  for (const metadata of [{}, { userInfo: { openId: 'runtime-user' } }, { tcbContext: {} }, { userInfo: {}, tcbContext: {} }]) {
    assert.deepEqual(await main({ action: 'capabilities', ...metadata }), { ok: true, data: { jobsProtocol: 'relay-v1', libraryProtocol: 'workspace-v1', gatewayUrl: '' } });
    assert.deepEqual(await main({ action: 'list', ...metadata }), { ok: true, data: { connections: [], results: [], drafts: [] } });
    assert.equal((await main({ action: 'job.list', ...metadata })).ok, true);
  }
});

test('SDK identity wins over metadata and connection scopes remain opt-in', async () => {
  const { main, db } = fixture();
  const input = { action: 'connect', name: 'entry-test', readRecent: false, userInfo: { openId: 'bob', workJobs: true }, tcbContext: { OPENID: 'bob', workJobs: true } };
  const result = await main(input);
  assert.equal(result.ok, true);
  assert.equal(result.data.connection.readRecent, false);
  assert.equal(result.data.connection.workJobs, false);
  assert.equal(Object.values(db.snapshot().assistant_connections)[0]._openid, 'alice');
  assert.equal(input.userInfo.openId, 'bob');
  const missing = fixture('');
  assert.equal((await missing.main({ action: 'capabilities', userInfo: { openId: 'alice' }, tcbContext: { OPENID: 'alice' } })).code, 'UNAUTHORIZED');
});

test('entry still rejects unknown fields, malformed events and HTTP envelopes', async () => {
  const { main } = fixture();
  for (const event of [null, [], 'list', 12, { action: 'list', OPENID: 'bob' }, { action: 'list', extra: true, userInfo: {} },
    { action: 'accept', id: 'x', draft: { kind: 'memory', title: 'x', content: 'x', date: '2026-09-19', extra: true } }]) {
    assert.equal((await main(event)).ok, false);
  }
  for (const key of ['httpMethod', 'headers', 'body']) {
    for (const value of ['', null, {}, false]) {
      assert.equal((await main({ action: 'capabilities', [key]: value, userInfo: {} })).code, 'UNAUTHORIZED');
    }
  }
});

test('nested draft schema remains strict after SDK metadata normalization', async () => {
  const { main, db } = fixture();
  const connected = await main({ action: 'connect', name: 'nested-test', readRecent: false });
  const { createGateway } = require('../cloudfunctions/assistantGateway/service');
  const draft = { kind: 'memory', title: 'test', content: 'test', date: '2026-09-19' };
  await createGateway(db)(connected.data.token, { action: 'draft.submit', requestId: 'entry-nested', draft });
  const id = (await main({ action: 'list' })).data.drafts[0].id;
  assert.equal((await main({ action: 'accept', id, draft: { ...draft, extra: true }, userInfo: {} })).code, 'BAD_REQUEST');
  assert.equal((await main({ action: 'list' })).data.drafts.length, 1);
  assert.equal((await main({ action: 'accept', id, draft, userInfo: {} })).ok, true);
});
