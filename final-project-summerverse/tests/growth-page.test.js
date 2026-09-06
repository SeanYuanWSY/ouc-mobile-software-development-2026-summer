const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../miniprogram/pages/growth/index.js');
function setup(repository) {
  let page;
  const notices = [];
  const realRequire = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(name) { return name === '../../services/repository' ? repository : realRequire(name); },
    Page(value) { page = value; }, console,
    wx: { showLoading() {}, hideLoading() {}, showToast(o) { notices.push(o); },
      showModal(o) { notices.push(o); if (o.success) o.success({ confirm: true }); } }
  });
  page.setData = function(data) { Object.assign(this.data, data); };
  page.refresh = async () => {};
  return { page, notices };
}
test('目标删除失败可见提示且保留目标', async () => {
  const { page, notices } = setup({ deleteGoal: async () => { throw new Error('network unavailable'); } });
  page.data.goals = [{ _id: 'owned-goal' }];
  await page.removeGoal({ currentTarget: { dataset: { id: 'owned-goal' } } });
  assert.equal(page.data.goals.length, 1);
  assert(notices.some(n => n.title === '移除失败'));
});
test('目标保存中的重复点击只创建一次，失败后允许重试', async () => {
  let calls = 0, reject;
  const { page } = setup({ saveGoal() { calls++; return new Promise((_, r) => { reject = r; }); } });
  page.data.goalDraft.title = 'test goal';
  const first = page.saveGoal();
  await page.saveGoal();
  assert.equal(calls, 1);
  reject(new Error('offline'));
  await first;
  assert.equal(page.data.goalDraft.title, 'test goal');
  const retry = page.saveGoal();
  assert.equal(calls, 2);
  reject(new Error('offline'));
  await retry;
});
