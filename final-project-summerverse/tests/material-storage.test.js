const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { prepareSubject, restoreEnv } = require('./helpers/subject-load');
const { downloadUrl, ownedMaterial, validateMaterialFile } = require('../cloudfunctions/deepseekProxy/material-download');
const { createWorkspaces } = require('../cloudfunctions/dataService/material-workspaces');
const { ACTION_CREDITS } = require('../cloudfunctions/deepseekProxy/quota');
const authority = 'cloudbase-fixture.bucket-fixture';
const ownPath = `summerverse/${crypto.createHash('sha256').update('alice').digest('hex').slice(0, 32)}/material/2026-09-11/123456-abcdef.pdf`;
const fileID = `cloud://${authority}/${ownPath}`;
const url = 'https://bucket-fixture.tcb.qcloud.la/fixture.pdf?sign=synthetic';
const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];
function transport({ status = 200, bytes = [Buffer.from('test')], length, stalled = false, aborted = false } = {}) {
  const state = { requests: 0, destroyed: false, pinned: false };
  state.request = (_url, options, callback) => {
    state.requests++; assert.equal(options.headers, undefined); assert.equal(options.servername, 'bucket-fixture.tcb.qcloud.la');
    options.lookup('bucket-fixture.tcb.qcloud.la', {}, (_, address) => { state.pinned = address === '8.8.8.8'; });
    const req = new EventEmitter(), res = new EventEmitter(); res.statusCode = status; res.headers = { 'content-length': length }; res.destroy = () => { state.destroyed = true; };
    req.destroy = () => { state.destroyed = true; }; req.end = () => {
      callback(res); if (state.destroyed || stalled) return;
      bytes.forEach((b) => res.emit('data', b));
      if (!state.destroyed) res.emit(aborted ? 'aborted' : 'end');
    };
    return req;
  }; return state;
}
function dbFixture() {
  let state = {}, queue = Promise.resolve();
  function collection(store, name) { return { doc: (id) => ({
    get: async () => ({ data: store[name]?.[id] ? structuredClone(store[name][id]) : null }),
    set: async ({ data }) => { (store[name] ||= {})[id] = structuredClone(data); },
    remove: async () => { delete store[name]?.[id]; }
  }) }; }
  return { snapshot: () => structuredClone(state), collection: (name) => collection(state, name), runTransaction: (fn) => {
    const task = queue.then(async () => { const copy = structuredClone(state); const result = await fn({ collection: (name) => collection(copy, name) }); state = copy; return result; });
    queue = task.catch(() => {}); return task;
  } };
}
test('删除阻止旧创建和旧编辑复活，删除重试不保留正文', async () => {
  const db = dbFixture(), run = createWorkspaces(db);
  const workspace = { id: 'deleted', title: 'private-title', sources: [] };
  await run('alice', 'material.save', { workspace, revision: 0 });
  await run('alice', 'material.delete', { id: workspace.id, revision: 1 });
  await run('alice', 'material.delete', { id: workspace.id, revision: 1 });
  for (const revision of [0, 1, 2]) await assert.rejects(run('alice', 'material.save', { workspace, revision }), { code: 'MATERIAL_CONFLICT' });
  await assert.rejects(run('alice', 'material.get', { id: workspace.id }));
  assert.deepEqual(await run('alice', 'material.list'), []);
  assert(!JSON.stringify(db.snapshot()).includes('private-title'));
  await run('alice', 'material.delete', { id: 'late-create', revision: 0 });
  await assert.rejects(run('alice', 'material.save', { workspace: { id: 'late-create', title: 'late' }, revision: 0 }), { code: 'MATERIAL_CONFLICT' });
});
test('清空与旧版本写入串行化，保留删除标记且不影响其他用户', async () => {
  for (const resetFirst of [true, false]) {
    const db = dbFixture(), run = createWorkspaces(db), workspace = { id: 'work', title: 'private-title' };
    await run('alice', 'material.save', { workspace, revision: 0 });
    await run('bob', 'material.save', { workspace, revision: 0 });
    const save = () => run('alice', 'material.save', { workspace, revision: 1 });
    await Promise.allSettled(resetFirst ? [run.clear('alice'), save()] : [save(), run.clear('alice')]);
    assert.deepEqual(await run('alice', 'material.list'), []);
    assert.equal((await run('bob', 'material.list')).length, 1);
    for (const revision of [0, 1, 2]) await assert.rejects(run('alice', 'material.save', { workspace, revision }), { code: 'MATERIAL_CONFLICT' });
    await run.clear('alice');
    await assert.rejects(run('alice', 'material.save', { workspace, revision: 0 }), { code: 'MATERIAL_CONFLICT' });
    await run('alice', 'material.save', { workspace: { id: 'new', title: '新资料' }, revision: 0 });
    assert.equal((await run('alice', 'material.list')).length, 1);
  }
});
test('只接受精确环境、当前owner和专用目录的文件ID', () => {
  assert.equal(validateMaterialFile('alice', fileID, authority).cloudPath, ownPath);
  for (const f of [fileID.replace(authority, 'other.bucket'), fileID.replace('/material/', '/memory/'), fileID.replace('/material/', '/material/../material/'), fileID.replace('abcdef.pdf', 'ab%2fcd.pdf'), fileID.replace('abcdef.pdf', 'abcdef.mp3')]) assert.throws(() => validateMaterialFile('alice', f, authority));
  assert.throws(() => validateMaterialFile('bob', fileID, authority));
  assert.throws(() => validateMaterialFile('alice', fileID, ''), { code: 'MATERIAL_NOT_CONFIGURED' });
});
test('SDK签名URL仅可连接公网允许域，固定IP，禁重定向和凭据', async () => {
  for (const bad of ['https://evil.example/file', 'http://bucket-fixture.tcb.qcloud.la/x', 'https://user:pass@bucket-fixture.tcb.qcloud.la/x', 'https://bucket-fixture.tcb.qcloud.la.evil.example/file', 'https://bucket-fixture.tcb.qcloud.la:8443/file']) await assert.rejects(downloadUrl(bad));
  await assert.rejects(downloadUrl(url, { lookup: async () => [{ address: '127.0.0.1', family: 4 }] }));
  const redirect = transport({ status: 302 }); await assert.rejects(downloadUrl(url, { lookup: publicLookup, request: redirect.request })); assert.equal(redirect.requests, 1); assert(redirect.destroyed);
  const ok = transport(); assert.equal((await downloadUrl(url, { lookup: publicLookup, request: ok.request })).toString(), 'test'); assert(ok.pinned);
});
test('不信任Content-Length，流量超限、连接中断和超时均中止请求', async () => {
  for (const config of [{ length: 8 * 1024 * 1024 + 1 }, { length: 1, bytes: [Buffer.alloc(8 * 1024 * 1024), Buffer.alloc(1)] }, { stalled: true }, { aborted: true }]) {
    const t = transport(config); await assert.rejects(downloadUrl(url, { lookup: publicLookup, request: t.request, timeout: 20 })); assert(t.destroyed);
  }
});
test('未登记、其他用户和已清理文件不会申请下载URL', async () => {
  const previous = process.env.MATERIAL_STORAGE_AUTHORITY; process.env.MATERIAL_STORAGE_AUTHORITY = authority;
  let urls = 0;
  try {
    const cloud = { getTempFileURL: async () => { urls++; return { fileList: [] }; } };
    for (const status of ['deleted', 'cleanup_pending', 'missing']) {
      const db = { collection: () => ({ where: (filter) => { assert.equal(filter._openid, 'alice'); return { limit: () => ({ get: async () => ({ data: status === 'missing' ? [] : [{ status, cloudPath: ownPath }] }) }) }; } }) };
      await assert.rejects(ownedMaterial(cloud, db, 'alice', fileID));
    }
    assert.equal(urls, 0);
  } finally { if (previous === undefined) delete process.env.MATERIAL_STORAGE_AUTHORITY; else process.env.MATERIAL_STORAGE_AUTHORITY = previous; }
});
test('资料跨用户隔离、列表不泄漏正文，保存冲突不覆盖，删除需相同版本', async () => {
  const db = dbFixture(), run = createWorkspaces(db); const workspace = { id: 'work', title: '报告', sources: [{ id: 's1', name: '通知', kind: 'text', extraction: 'plain', chunks: [{ id: 'c1', locator: '正文', text: 'private-fixture-text' }] }], tasks: [] };
  await run('alice', 'material.save', { workspace, revision: 0 });
  assert.equal((await run('bob', 'material.list')).length, 0); await assert.rejects(run('bob', 'material.get', { id: 'work' }));
  assert(!JSON.stringify(await run('alice', 'material.list')).includes('private-fixture-text'));
  const writes = await Promise.allSettled([1, 2].map((n) => run('alice', 'material.save', { workspace: { ...workspace, title: `标题${n}` }, revision: 1 })));
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(writes.find((r) => r.status === 'rejected').reason.code, 'MATERIAL_CONFLICT');
  await assert.rejects(run('alice', 'material.delete', { id: 'work', revision: 1 }));
  await assert.rejects(run('alice', 'material.save', { id: 'different', workspace, revision: 0 }));
  await run('alice', 'material.delete', { id: 'work', revision: 2 }); assert.equal((await run('alice', 'material.list')).length, 0);
});
test('并发创建资料也不会超过每用户12份上限', async () => {
  const run = createWorkspaces(dbFixture());
  const results = await Promise.allSettled(Array.from({ length: 15 }, (_, i) => run('alice', 'material.save', { workspace: { id: `w${i}`, title: '资料' }, revision: 0 })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 12);
  assert.equal((await run('alice', 'material.list')).length, 12);
});
test('真实AI入口在解析前扣额度，失败解析也消耗额度，Key不用于解析，伪造HTTP不执行', async () => {
  let attempts = 0, extracts = 0; const logs = [];
  const sdk = { init() {}, database: () => ({}), getWXContext: () => ({ OPENID: 'alice', APPID: 'fixture-app' }) };
  prepareSubject({
    subject: '../cloudfunctions/deepseekProxy/index',
    mocks: [
      { spec: 'wx-server-sdk', value: sdk },
      { spec: './quota', value: { ACTION_CREDITS, reserveAiQuota: async () => { attempts++; if (attempts > 1) throw Object.assign(new Error('quota'), { code: 'AI_RATE_LIMITED' }); } } },
      { spec: './material-ai', value: { validate() {}, extract: async () => { extracts++; throw new Error('private-fixture-text'); } } },
      { spec: './config-policy', value: { configFromEvent: () => { throw Error('解析不能读取模型凭据'); } } },
    ],
    globals: { console: { error: (...v) => logs.push(v) } },
    env: {},
  });
  const proxy = require('../cloudfunctions/deepseekProxy/index');
  await proxy.main({ action: 'materialExtract', payload: { fileID } });
  const limited = await proxy.main({ action: 'materialExtract', payload: { fileID } }); assert.equal(limited.code, 'AI_RATE_LIMITED'); assert.equal(extracts, 1);
  assert.equal((await proxy.main({ action: 'materialExtract', httpMethod: 'POST', payload: { fileID } })).ok, false); assert.equal(attempts, 2);
  assert(!JSON.stringify(logs).includes('private-fixture-text'));
  restoreEnv();
});
test('网页资料先验证身份和额度，再发起读取，并且不接触AI配置', async () => {
  const order = [];
  const sdk = { init() {}, database: () => ({}), getWXContext: () => ({ OPENID: 'alice', APPID: 'fixture-app' }) };
  prepareSubject({
    subject: '../cloudfunctions/deepseekProxy/index',
    mocks: [
      { spec: 'wx-server-sdk', value: sdk },
      { spec: './quota', value: { ACTION_CREDITS, reserveAiQuota: async () => { order.push('quota'); } } },
      { spec: './material-ai', value: { validate: () => { order.push('validate'); }, web: async () => { order.push('web'); return { title: '通知' }; } } },
      { spec: './config-policy', value: { configFromEvent: () => { throw Error('网页读取不能访问AI配置'); } } },
    ],
    globals: { console: { error() {} } },
    env: {},
  });
  const proxy = require('../cloudfunctions/deepseekProxy/index');
  const result = await proxy.main({ action: 'materialWebExtract', payload: { url: 'https://course.example/a' } });
  assert.equal(result.ok, true); assert.deepEqual(order, ['validate', 'quota', 'web']);
  order.length = 0;
  const forged = await proxy.main({ action: 'materialWebExtract', headers: { cookie: 'x' }, payload: { url: 'https://course.example/a' } });
  assert.equal(forged.ok, false); assert.deepEqual(order, []);
  restoreEnv();
});
