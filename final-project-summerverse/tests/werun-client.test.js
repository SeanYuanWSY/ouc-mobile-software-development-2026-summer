const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
function load(options = {}) {
  const file = path.resolve(__dirname, '../miniprogram/services/wechat-data.js');
  const localRequire = createRequire(file);
  const saved = []; let calls = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, Number, Date, Error,
    wx: { cloud: { CloudID: value => value }, getDeviceInfo: () => ({ platform: options.platform || 'ios' }) },
    require(name) {
      if (name === './cloud') return { waitForCloudReady: async () => true, callFunction: async () => { calls++; return options.response; } };
      if (name === './repository') return { saveStepSnapshot: async s => saved.push(s) };
      if (name === '../utils/promisify') return { wxp: async method => {
        if (method === 'getSetting') return { authSetting: { 'scope.werun': true } };
        if (method === 'getWeRunData') { if (options.failure) throw options.failure; return { cloudID: 'test-only-id' }; }
        if (method === 'login') return {};
        throw new Error('Unexpected API '+method);
      } };
      return localRequire(name);
    }
  });
  return { sync: module.exports.syncWeRun, saved, calls: () => calls };
}
test('Mac 微信读取失败解释客户端阶段且不调用云函数、不覆盖步数', async () => {
  const run = load({ platform: 'mac', failure: { errMsg: 'getWeRunData:fail' } });
  await assert.rejects(run.sync, e => e.code === 'WERUN_CLIENT_FAILED' && e.message.includes('手机微信') && e.message.includes('getWeRunData'));
  assert.equal(run.calls(), 0); assert.equal(run.saved.length, 0);
});
test('手机读取失败不误诊为电脑端限制', async () => {
  const run = load({ failure: { errMsg: 'getWeRunData:fail', errCode: 123 } });
  await assert.rejects(run.sync, e => !e.message.includes('电脑端') && e.message.includes('123'));
  assert.equal(run.calls(), 0);
});
test('无效服务响应不能变成已同步0步', async () => {
  for (const response of [{ ok: true }, { data: { todaySteps: -1 } }]) {
    const run = load({ response });
    await assert.rejects(run.sync, /未返回有效数据/); assert.equal(run.saved.length, 0);
  }
});
test('微信实际返回的0步是有效数据并保留日期', async () => {
  const run = load({ response: { data: { todaySteps: 0, todayDate: '2026-09-06', history: [{ date: '2026-09-06', steps: 0 }] } } });
  const snapshot = await run.sync();
  assert.equal(snapshot.steps, 0); assert.equal(snapshot.date, '2026-09-06'); assert.equal(run.saved.length, 1);
});

test('授权状态刷新保留同步结果，并发点击只发起一次读取', async () => {
  const file = path.resolve(__dirname, '../miniprogram/pages/settings/index.js');
  const localRequire = createRequire(file); let page, resolveSync, calls = 0;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; },
    require(name) {
      if (name === '../../services/wechat-data') return { syncWeRun: () => { calls++; return new Promise(resolve => { resolveSync = resolve; }); } };
      return localRequire(name);
    },
    wx: { showLoading() {}, hideLoading() {}, showToast() {}, showModal() {}, getSetting(o) { o.success({ authSetting: { 'scope.werun': true } }); } }
  });
  page.setData = function(value) { Object.assign(this.data, value); };
  await page.refreshPermissionStatus(); assert.equal(page.data.stepStatus, '已授权，待同步');
  const first = page.authorizeStep(); await page.authorizeStep(); assert.equal(calls, 1);
  resolveSync({ steps: 123, date: '2026-09-06' }); await first;
  assert.equal(page.data.stepStatus, '已同步 2026-09-06 · 123 步'); assert.equal(page.data.syncingStep, false);
});
