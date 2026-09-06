const test = require('node:test');
const assert = require('node:assert/strict');
const { backOrHome } = require('../miniprogram/utils/navigation');

test.afterEach(() => {
  delete global.wx;
  delete global.getCurrentPages;
});

test('有页面历史时返回上一页', () => {
  let action = '';
  global.getCurrentPages = () => [{}, {}];
  global.wx = { navigateBack() { action = 'back'; }, switchTab() { action = 'home'; } };
  backOrHome();
  assert.equal(action, 'back');
});

test('分享直达页没有历史时回到首页', () => {
  let url = '';
  global.getCurrentPages = () => [{}];
  global.wx = { navigateBack() {}, switchTab(options) { url = options.url; } };
  backOrHome();
  assert.equal(url, '/pages/island/index');
});
