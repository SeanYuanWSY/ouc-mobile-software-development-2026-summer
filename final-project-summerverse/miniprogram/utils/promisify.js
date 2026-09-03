function wxp(method, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof wx[method] !== 'function') {
      reject(new Error(`当前基础库不支持 wx.${method}`));
      return;
    }
    wx[method]({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { wxp, sleep };
