const test = require('node:test');
const assert = require('node:assert/strict');

const { waitForCloudReady, callFunction } = require('../miniprogram/services/cloud');

test.afterEach(() => {
  delete global.wx;
  delete global.getApp;
});

test('cloud calls stay local when the startup probe fails', async () => {
  let called = false;
  global.wx = { cloud: { callFunction() { called = true; } } };
  global.getApp = () => ({
    globalData: { cloudReady: false },
    awaitCloudReady: () => Promise.resolve(false)
  });

  assert.equal(await waitForCloudReady(), false);
  await assert.rejects(() => callFunction('dataService'), /CLOUD_NOT_READY/);
  assert.equal(called, false);
});

test('cloud calls wait for the startup probe before dispatching', async () => {
  global.wx = {
    cloud: {
      callFunction(options) {
        options.success({ result: { ok: true, data: 'ready' } });
      }
    }
  };
  global.getApp = () => ({
    globalData: { cloudReady: true },
    awaitCloudReady: () => Promise.resolve(true)
  });

  assert.deepEqual(await callFunction('dataService'), { ok: true, data: 'ready' });
});
