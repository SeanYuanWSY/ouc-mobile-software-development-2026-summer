const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');

function service() {
  const records = Array.from({ length: 350 }, (_, i) => ({ _id: String(i), title: 'record', _openid: 'owner' }));
  const db = { command: { neq: (value) => ({ $ne: value }) }, collection() {
    let offset = 0, limit = 100;
    const query = {
      where(filter) { assert.equal(filter._openid, 'owner'); return query; },
      orderBy() { return query; }, skip(n) { offset = n; return query; },
      limit(n) { assert.ok(n <= 100); limit = n; return query; },
      async get() { return { data: records.slice(offset, offset + limit) }; }
    };
    return query;
  }};
  const sdk = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'owner' }) };
  prepareSubject({
    subject: '../cloudfunctions/dataService/index',
    mocks: [{ spec: 'wx-server-sdk', value: sdk }],
  });
  return require('../cloudfunctions/dataService/index').main;
}
test('旧客户端保持默认200和显式300条，新客户端每页100条', async () => {
  const main = service();
  assert.equal((await main({ action: 'memory.list', payload: {} })).data.length, 200);
  assert.equal((await main({ action: 'memory.list', payload: { limit: 300 } })).data.length, 300);
  const page = await main({ action: 'memory.list', payload: { offset: 300, limit: 100 } });
  assert.equal(page.data.length, 50);
  assert.equal(page.nextOffset, null);
  assert.equal(page.data[0]._id, '300');
});

test('目标列表保留旧版100条，新版读取第101条以后的目标', async () => {
  const main = service();
  const legacy = await main({ action: 'goal.list', payload: {} });
  assert.equal(legacy.data.length, 100);
  assert.equal(legacy.nextOffset, undefined);
  const page = await main({ action: 'goal.list', payload: { offset: 100 } });
  assert.equal(page.data[0]._id, '100'); assert.equal(page.nextOffset, 200);
  const final = await main({ action: 'goal.list', payload: { offset: 300 } });
  assert.equal(final.data.length, 50); assert.equal(final.nextOffset, null);
});
