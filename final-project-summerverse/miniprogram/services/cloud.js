function getAppSafe() {
  try { return getApp(); } catch (_) { return null; }
}

function isCloudReady() {
  const app = getAppSafe();
  return Boolean(wx.cloud && app?.globalData?.cloudReady);
}

function callFunction(name, data = {}, options = {}) {
  if (!isCloudReady()) {
    return Promise.reject(new Error('CLOUD_NOT_READY'));
  }
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
          reject(new Error(result.error || result.message || '云函数执行失败'));
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

module.exports = { isCloudReady, callFunction };
