const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { prepareSubject } = require('./helpers/subject-load');

function cloudHarness(ready = true) {
  const app = { globalData: { cloudReady: ready, cloudIntent: true, dataMode: 'cloud', cloudGeneration: 1 }, awaitCloudReady: async () => ready };
  global.getApp = () => app;
  global.wx = { cloud: {} };
  delete require.cache[require.resolve('../miniprogram/services/cloud')];
  return { app, service: require('../miniprogram/services/cloud') };
}
const realTimers = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
test.afterEach(() => { delete global.getApp; delete global.wx; global.setTimeout = realTimers.setTimeout; global.clearTimeout = realTimers.clearTimeout; });

test('云启动失败保持云意图，读写均不得静默切到本机', async () => {
  cloudHarness(false);
  let localWrites = 0;
  global.wx.setStorageSync = () => { localWrites++; };
  delete require.cache[require.resolve('../miniprogram/services/repository')];
  const repository = require('../miniprogram/services/repository');
  await assert.rejects(repository.listMemories(), { code: 'CLOUD_UNAVAILABLE' });
  await assert.rejects(repository.saveMemory({ title: '仍属云账号' }), { code: 'CLOUD_UNAVAILABLE' });
  assert.equal(localWrites, 0);
});

test('同资源读取合并，写入失效后迟到结果不覆盖新代，手动刷新不返回旧缓存', async () => {
  const { service } = cloudHarness();
  let reads = 0, release;
  const loader = () => { reads++; return reads === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({ version: reads }); };
  const first = service.cachedRead('memories', 'all', loader);
  const duplicate = service.cachedRead('memories', 'all', loader);
  while (!release) await Promise.resolve();
  assert.equal(reads, 1);
  service.invalidateReads('memories');
  const fresh = await service.cachedRead('memories', 'all', loader);
  release({ version: 1 });
  assert.deepEqual(await first, fresh);
  assert.deepEqual(await duplicate, fresh);
  assert.equal(reads, 2);
  assert.deepEqual(await service.cachedRead('memories', 'all', loader), fresh);
  assert.equal(reads, 2);
  assert.equal((await service.cachedRead('memories', 'all', loader, { forceRefresh: true })).version, 3);
});

test('失败读取不缓存，重连接代次变化清空旧缓存', async () => {
  const { service, app } = cloudHarness();
  let calls = 0;
  const loader = async () => { calls++; if (calls === 1) throw new Error('offline'); return calls; };
  await assert.rejects(service.cachedRead('goals', 'all', loader), /offline/);
  assert.equal(await service.cachedRead('goals', 'all', loader), 2);
  app.globalData.cloudGeneration++;
  assert.equal(await service.cachedRead('goals', 'all', loader), 3);
});

test('没有其他读取时重连也阻止旧代成功或错误更新', async () => {
  for (const fail of [false, true]) {
    const { service, app } = cloudHarness(); let done;
    const request = service.cachedRead('profile', 'get', () => new Promise((resolve, reject) => { done = fail ? reject : resolve; }));
    while (!done) await Promise.resolve();
    app.globalData.cloudGeneration++;
    done(fail ? new Error('old failure') : { nickname: 'old value' });
    await assert.rejects(request, /连接已变化/);
  }
});

test('云写返回缺少data为协议失败，不能落本机补写', async () => {
  cloudHarness(); let writes = 0;
  global.wx.cloud.callFunction = ({ success }) => success({ result: { ok: true } });
  global.wx.setStorageSync = () => { writes++; };
  delete require.cache[require.resolve('../miniprogram/services/repository')];
  const repo = require('../miniprogram/services/repository');
  await assert.rejects(repo.saveMemory({ title: '原本的云记录' }), /不完整的数据/);
  assert.equal(writes, 0);
});

test('云调用和保存拒绝畸形成功结果并标记提交未知', async () => {
  const { service } = cloudHarness();
  for (const result of [undefined, null, [], 'success', {}, { data: {} }]) {
    global.wx.cloud.callFunction = ({ success }) => success({ result });
    await assert.rejects(service.callFunction('dataService'), { code: 'CLOUD_INVALID_RESPONSE', outcomeUnknown: true });
  }
  delete require.cache[require.resolve('../miniprogram/services/repository')];
  const repository = require('../miniprogram/services/repository');
  const warn = console.warn; console.warn = () => {};
  try {
    for (const data of [null, {}, [], { _id: '' }]) {
      global.wx.cloud.callFunction = ({ success }) => success({ result: { ok: true, data } });
      for (const save of [() => repository.saveMemory({ title: 'memory' }), () => repository.saveGoal({ title: 'goal' }), () => repository.saveProfile({ nickname: 'me' })]) {
        await assert.rejects(save(), { code: 'CLOUD_INVALID_RESPONSE', outcomeUnknown: true });
      }
    }
  } finally { console.warn = warn; }
});

test('重连只合并健康检查，超时回调不会覆盖下一次成功', async () => {
  let app, timer;
  const requests = [];
  prepareSubject({
    subject: '../miniprogram/app',
    mocks: [{ spec: './config/env', value: { ENABLE_CLOUD: true } }, { spec: './services/ai-preferences', value: { ENABLE_CLOUD: true } }],
    globals: { App(value) { app = value; },
      wx: { cloud: { init() {}, callFunction(args) { requests.push(args); } } },
      setTimeout(fn) { timer = fn; return 1; }, clearTimeout() {} },
  });
  require('../miniprogram/app');
  const first = app.reconnectCloud(), same = app.reconnectCloud();
  assert.equal(requests.length, 1);
  assert.equal(first, same);
  timer(); assert.equal(await first, false);
  assert.equal(app.globalData.dataMode, 'cloud');
  const next = app.reconnectCloud();
  requests[1].success({ result: { ok: true } });
  assert.equal(await next, true);
  requests[0].fail({ errMsg: 'late error' });
  assert.equal(app.globalData.cloudReady, true);
  assert(requests.every((r) => r.data.action === 'system.ping'));
});

test('SDK同步异常及时结束连接状态，写入仍保守标记为结果未知', async () => {
  const { service } = cloudHarness();
  global.wx.cloud.callFunction = () => { throw new Error('SDK unavailable'); };
  await assert.rejects(service.callFunction('dataService'), { outcomeUnknown: true });
  let app;
  prepareSubject({
    subject: '../miniprogram/app',
    mocks: [{ spec: './config/env', value: { ENABLE_CLOUD: true } }, { spec: './services/ai-preferences', value: { ENABLE_CLOUD: true } }],
    globals: { App(value) { app = value; },
      wx: { cloud: { init() {}, callFunction() { throw new Error('SDK unavailable'); } } } },
  });
  require('../miniprogram/app');
  assert.equal(await app.reconnectCloud(), false);
  assert.equal(app.globalData.cloudStatus, 'unavailable');
  assert.equal(app.globalData.dataMode, 'cloud');
  assert.equal(app._cloudConnecting, false);
});

function timelineHarness(records) {
  let page, reads = 0, rows = records;
  const updates = [];
  prepareSubject({
    subject: '../miniprogram/pages/timeline/index',
    mocks: [{ spec: '../../services/repository', value: { listMemories: async () => { reads++; return { data: rows }; } } }],
    globals: { Page(value) { page = value; }, getApp: () => ({ globalData: {} }), wx: { showToast() {} } },
  });
  require('../miniprogram/pages/timeline/index');
  page.setData = (value) => { updates.push(value); Object.assign(page.data, value); };
  return { page, updates, reads: () => reads, replace(value) { rows = value; } };
}

test('时间轴返回时读取最新数据，千条正文只渲染40条且仍可搜索旧记录', async () => {
  const records = Array.from({ length: 1000 }, (_, i) => ({ _id: String(i), date: '2024-01-01', time: '12:00', title: `记录${i}`, content: '字'.repeat(1200), source: 'manual', category: 'life', media: [] }));
  const { page, updates, replace, reads } = timelineHarness(records);
  page.onLoad(); await page._readPromise;
  assert.equal(page.data.resultCount, 1000);
  assert.equal(page.data.visibleCount, 40);
  assert.equal(page.data.heatmap.length, 28);
  assert.equal(page.data.heatmap.at(-1).date, require('../miniprogram/utils/date').formatDate());
  assert(!('allMemories' in page.data));
  assert(Math.max(...updates.map((value) => Buffer.byteLength(JSON.stringify(value)))) < 100000);
  page.onReachBottom(); assert.equal(page.data.visibleCount, 80);
  page.data.keyword = '记录999'; page.applyFilters(); assert.equal(page.data.resultCount, 1);
  replace([...records, { ...records[0], _id: 'added', title: '新增记录' }]);
  page.onShow(); await page._readPromise;
  assert.equal(reads(), 2);
  page.data.keyword = ''; page.applyFilters(); assert.equal(page.data.resultCount, 1001);
});

test('离开时间轴后迟到读取不setData', async () => {
  const { page, updates } = timelineHarness([]);
  page.onLoad(); const pending = page._readPromise;
  page.onUnload(); const before = updates.length;
  await pending;
  assert.equal(updates.length, before);
});
