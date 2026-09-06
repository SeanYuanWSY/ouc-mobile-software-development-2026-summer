function getAppSafe() {
  try { return getApp(); } catch (_) { return null; }
}

function isCloudReady() {
  const app = getAppSafe();
  return Boolean(wx.cloud && app?.globalData?.cloudReady);
}

async function waitForCloudReady() {
  const app = getAppSafe();
  if (!wx.cloud || !app) return false;
  if (typeof app.awaitCloudReady === 'function') {
    try { return Boolean(await app.awaitCloudReady()); }
    catch (_) { return false; }
  }
  return Boolean(app.globalData && app.globalData.cloudReady);
}

async function callFunction(name, data = {}, options = {}) {
  if (!(await waitForCloudReady())) throw new Error('CLOUD_NOT_READY');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${name} 云函数调用超时`));
    }, options.timeout || 20000);
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const result = res?.result;
        if (result?.ok === false) {
          const error = new Error(result.error || result.message || '云函数执行失败');
          error.code = result.code;
          error.scope = result.scope;
          error.retryAfterSeconds = result.retryAfterSeconds;
          reject(error);
          return;
        }
        resolve(result);
      },
      fail: (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

module.exports = { isCloudReady, waitForCloudReady, callFunction };
