function backOrHome() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages.length > 1) {
    wx.navigateBack();
    return;
  }
  wx.switchTab({ url: '/pages/island/index' });
}

module.exports = { backOrHome };
