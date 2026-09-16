const test = require('node:test');
const assert = require('node:assert/strict');
const experience = require('../miniprogram/utils/experience');
test.afterEach(() => { delete global.wx; });
test('体验偏好只保留白名单，损坏存储不影响业务模式', () => {
  assert.deepEqual(experience.normalize({ mode: 'focus', dataMode: 'local', apiKey: 'ignored', reduceMotion: 1 }), { mode: 'focus', reduceMotion: false });
  global.wx = { getStorageSync() { throw Error('unavailable'); } };
  assert.equal(experience.read().mode, 'minimal');
});
test('页面包装保留生命周期参数this返回值和错误，同时读取最新偏好', () => {
  let saved = { mode: 'journal' };
  global.wx = { getStorageSync: () => saved, setStorageSync: (_, v) => { saved = v; } };
  const wrapped = experience.withExperience({ data: { dataMode: 'cloud', value: 4 }, onLoad(arg) { assert.equal(this.data.value, 4); return arg; }, onShow() { throw Error('original failure'); } });
  const page = { ...wrapped, data: { ...wrapped.data }, setData(v) { Object.assign(this.data, v); } };
  assert.equal(page.onLoad(17), 17);
  assert.equal(page.data.experienceMode, 'journal');
  page.setExperienceOptions({ mode: 'focus' });
  assert.equal(page.data.dataMode, 'cloud');
  assert.equal(page.data.experienceMode, 'focus');
  assert.throws(() => page.onShow(), /original failure/);
});
test('偏好保存失败不得显示为已保留', () => {
  global.wx = { setStorageSync() { throw Error('quota'); } };
  assert.throws(() => experience.write({ mode: 'focus' }), /未能保存/);
});
