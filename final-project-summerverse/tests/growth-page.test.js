const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
function setup(repository) {
  repository.makeRequestId ||= () => 'op-test-request';
  let page;
  const notices = [];
  prepareSubject({
    subject: '../miniprogram/pages/growth/index',
    mocks: [{ spec: '../../services/repository', value: repository }],
    globals: { Page(value) { page = value; },
      wx: { showLoading() {}, hideLoading() {}, showToast(o) { notices.push(o); },
        showModal(o) { notices.push(o); if (o.success) o.success({ confirm: true }); } } },
  });
  require('../miniprogram/pages/growth/index');
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

test('进度双击只派发一次，网络未知后同一请求重试', async () => {
  let calls = [], release;
  const { page } = setup({ incrementGoal(id, requestId) { calls.push({ id, requestId }); return new Promise((resolve, reject) => { release = { resolve, reject }; }); } });
  page.data.goals = [{ _id: 'goal', current: 0, target: 5 }];
  const event = { currentTarget: { dataset: { id: 'goal' } } };
  const first = page.incrementGoal(event); await page.incrementGoal(event); assert.equal(calls.length, 1);
  release.reject(Object.assign(new Error('network'), { outcomeUnknown: true })); await first;
  const retry = page.incrementGoal(event); assert.equal(calls.length, 2); assert.equal(calls[1].requestId, calls[0].requestId);
  release.reject(Object.assign(new Error('cloud offline'), { code: 'CLOUD_UNAVAILABLE' })); await retry;
  const third = page.incrementGoal(event); assert.equal(calls[2].requestId, calls[0].requestId);
  release.resolve({ current: 1 }); await third;
});

test('待确认目标再次遇到连接失败仍保留原请求，成功前不生成第二份目标', async () => {
  const calls = [];
  const { page } = setup({ makeRequestId: () => `request-${calls.length}`, async saveGoal(input) {
    calls.push(structuredClone(input));
    if (calls.length === 1) throw Object.assign(new Error('response lost'), { outcomeUnknown: true });
    if (calls.length === 2) throw Object.assign(new Error('cloud offline'), { code: 'CLOUD_UNAVAILABLE' });
    return { data: input };
  } });
  page.data.goalDraft.title = '不能重复种下';
  await page.saveGoal(); await page.saveGoal(); assert(page._pendingGoal);
  await page.saveGoal(); assert.equal(page._pendingGoal, null);
  assert.equal(calls.length, 3); assert(calls.every((input) => input.requestId === calls[0].requestId));
});
