const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
const token = (n, at = Date.now()) => `op-${at}-${String(n).padStart(10, '0')}`;

function harness() {
  const tables = new Map(); let owner = 'owner', serial = Promise.resolve(), writes = 0;
  function table(name) { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); }
  function collection(name) {
    const store = table(name); let filter = {}, offset = 0, limit = 100;
    const query = {
      where(value) { filter = value; return query; }, orderBy() { return query; },
      skip(value) { offset = value; return query; }, limit(value) { limit = value; return query; },
      async get() { return { data: [...store.values()].filter((value) => Object.entries(filter).every(([key, expected]) => expected?.not !== undefined ? value[key] !== expected.not : expected?.values ? expected.values.includes(value[key]) : value[key] === expected)).slice(offset, offset + limit).map((row) => structuredClone(row)) }; },
      async remove() { for (const row of (await query.get()).data) store.delete(row._id); },
      async add({ data }) { const id = `auto-${store.size}`; store.set(id, { ...structuredClone(data), _id: id }); return { _id: id }; },
      doc(id) { return {
        async get() { return { data: structuredClone(store.get(id)) }; },
        async set({ data }) { writes++; store.set(id, { ...structuredClone(data), _id: id }); },
        async update({ data }) { writes++; store.set(id, { ...store.get(id), ...structuredClone(data), _id: id }); },
        async remove() { writes++; store.delete(id); }
      }; }
    }; return query;
  }
  const db = { collection, command: { neq: (not) => ({ not }), in: (values) => ({ values }) }, serverDate: () => new Date(),
    runTransaction(task) { const promise = serial.then(() => task(db)); serial = promise.catch(() => {}); return promise; } };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: owner }), async deleteFile({ fileList }) { return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) }; } };
  prepareSubject({
    subject: '../cloudfunctions/dataService/index',
    mocks: [{ spec: 'wx-server-sdk', value: cloud }],
    globals: { console: { error() {}, warn() {} } },
  });
  const service = require('../cloudfunctions/dataService/index');
  return { main: service.main, table, setOwner(value) { owner = value; }, writes: () => writes };
}

test('记忆创建重放返回同一ID且不再触碰媒体引用，同ID不同正文拒绝', async () => {
  const f = harness();
  const fileID = 'cloud://test/image.jpg';
  f.table('media_assets').set('asset', { _id: 'asset', _openid: 'owner', fileID, references: [], status: 'ready' });
  const payload = { title: '第一次', date: '2026-09-12', time: '12:00', requestId: token(1), media: [{ fileID, type: 'image' }] };
  const first = await f.main({ action: 'memory.create', payload }); assert.equal(first.ok, true);
  const writes = f.writes();
  const again = await f.main({ action: 'memory.create', payload });
  assert.equal(again.data._id, first.data._id); assert.equal(f.writes(), writes);
  assert.equal(f.table('media_assets').get('asset').references.length, 1);
  assert.equal((await f.main({ action: 'memory.create', payload: { ...payload, title: '偷换正文' } })).code, 'WRITE_CONFLICT');
  assert.equal(first.data._creation, undefined);
  await f.main({ action: 'memory.delete', payload: { id: first.data._id } });
  const tombstone = f.table('memories').get(first.data._id);
  assert.equal(tombstone._deleted, true); assert.equal(tombstone.title, undefined); assert.equal(tombstone.media, undefined);
  assert.equal((await f.main({ action: 'memory.create', payload })).code, 'WRITE_DELETED');
  assert.equal((await f.main({ action: 'memory.list', payload: { offset: 0 } })).data.length, 0);
  assert.equal((await f.main({ action: 'memory.get', payload: { id: first.data._id } })).ok, false);
});

test('并发创建目标只存一份，进度事务不丢增量且同请求只加一次', async () => {
  const f = harness();
  const payload = { title: '学习', target: 100, requestId: token(2) };
  const [a, b] = await Promise.all([f.main({ action: 'goal.create', payload }), f.main({ action: 'goal.create', payload })]);
  assert(a.ok && b.ok); assert.equal(a.data._id, b.data._id); assert.equal(f.table('goals').size, 1);
  const id = a.data._id;
  const steps = Array.from({ length: 20 }, (_, i) => ({ id, requestId: token(100 + i) }));
  await Promise.all(steps.map((payload) => f.main({ action: 'goal.increment', payload })));
  assert.equal(f.table('goals').get(id).current, 20);
  assert.equal((await f.main({ action: 'goal.increment', payload: steps[0] })).data.current, 20);
  assert.equal((await f.main({ action: 'goal.update', payload: { ...a.data, title: '陈旧编辑', current: 0 } })).code, 'WRITE_CONFLICT');
  f.setOwner('different-owner');
  assert.equal((await f.main({ action: 'goal.increment', payload: steps[0] })).code, 'WRITE_DELETED');
  assert.equal(f.table('goals').get(id).current, 20);
});

test('并发重复删除记忆在媒体变更前识别墓碑，清理不会被重复派发', async () => {
  const f = harness(), fileID = 'cloud://test/delete.jpg';
  f.table('media_assets').set('asset', { _id: 'asset', _openid: 'owner', fileID, references: [], status: 'ready' });
  const created = await f.main({ action: 'memory.create', payload: { title: '待删除', requestId: token(49), media: [{ fileID, type: 'image' }] } });
  const [a, b] = await Promise.all([1, 2].map(() => f.main({ action: 'memory.delete', payload: { id: created.data._id } })));
  assert(a.ok && b.ok);
  assert.equal(f.table('memories').get(created.data._id)._deleted, true);
  assert.equal([a.mediaCleanup, b.mediaCleanup].filter(Boolean).length, 1);
});

test('编辑响应丢失后同请求幂等，其他设备更新后重放旧编辑不会回退正文', async () => {
  const f = harness();
  const created = await f.main({ action: 'memory.create', payload: { title: '初稿', requestId: token(50) } });
  const payloadA = { ...created.data, title: '设备A', requestId: token(51) };
  const a = await f.main({ action: 'memory.update', payload: payloadA }); assert(a.ok);
  const writes = f.writes();
  const replay = await f.main({ action: 'memory.update', payload: payloadA });
  assert(replay.ok); assert.equal(f.writes(), writes);
  const b = await f.main({ action: 'memory.update', payload: { ...a.data, title: '设备B', requestId: token(52) } }); assert(b.ok);
  const stale = await f.main({ action: 'memory.update', payload: payloadA }); assert.equal(stale.code, 'WRITE_CONFLICT');
  const value = await f.main({ action: 'memory.get', payload: { id: created.data._id } });
  assert.equal(value.data.title, '设备B'); assert.equal(value.data._lastWrite, undefined);
});

test('目标删除和reset保留无正文墓碑，任何旧创建请求均不能复活', async () => {
  for (const action of ['goal.delete', 'reset.mine']) {
    const f = harness(), payload = { title: '随后删除', requestId: token(3) };
    const a = await f.main({ action: 'goal.create', payload });
    assert.equal((await f.main({ action, payload: { id: a.data._id } })).ok, true);
    assert.equal((await f.main({ action: 'goal.create', payload })).code, 'WRITE_DELETED');
    assert.equal(f.table('goals').get(a.data._id).title, undefined);
    assert.equal((await f.main({ action: 'goal.list', payload: { offset: 0 } })).data.length, 0);
  }
});

test('超过收据上限明确拒绝，过期请求不能因旧收据清理再计数', async () => {
  const f = harness(), created = await f.main({ action: 'goal.create', payload: { title: '计数', target: 9999, requestId: token(4) } });
  const row = f.table('goals').get(created.data._id);
  row._stepRequests = Array.from({ length: 256 }, (_, i) => ({ value: token(i + 1000), issuedAt: Date.now() }));
  assert.equal((await f.main({ action: 'goal.increment', payload: { id: row._id, requestId: token(9999) } })).code, 'WRITE_LIMIT');
  assert.equal((await f.main({ action: 'goal.increment', payload: { id: row._id, requestId: token(9999, Date.now() - 86400001) } })).code, 'WRITE_EXPIRED');
  assert.equal(row.current, 0); assert.equal(row._stepRequests.length, 256);
});

test('墓碑在查询阶段排除，100个墓碑不挡住后面的真实资料', async () => {
  const f = harness();
  for (let i = 0; i < 100; i++) f.table('goals').set(`dead${i}`, { _id: `dead${i}`, _openid: 'owner', _deleted: true });
  for (let i = 0; i < 101; i++) f.table('goals').set(`live${i}`, { _id: `live${i}`, _openid: 'owner', title: '真实目标' });
  const first = await f.main({ action: 'goal.list', payload: { offset: 0 } });
  assert.equal(first.data.length, 100); assert.equal(first.nextOffset, 100);
  const second = await f.main({ action: 'goal.list', payload: { offset: first.nextOffset } });
  assert.equal(second.data.length, 1); assert.equal(second.data[0]._id, 'live100');
});
