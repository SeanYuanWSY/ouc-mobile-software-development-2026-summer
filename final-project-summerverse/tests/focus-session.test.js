const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
const timer = require('../miniprogram/utils/focus-session');

test('专注计时以绝对截止时间恢复，后台经过的时间不依赖interval次数', () => {
  const started = timer.start(timer.create('w1', 't1', 25, 'cloud', 1000), 1000);
  assert.equal(started.deadline, 1501000);
  assert.equal(timer.normalize(started, 601000).remainingMs, 900000);
  assert.equal(timer.display(started, 601000).clock, '15:00');
  const ended = timer.normalize(started, 1601000);
  assert.equal(ended.state, 'finished'); assert.equal(ended.remainingMs, 0);
  assert.equal(ended.done, undefined);
});

test('暂停时间不扣减，再开始使用剩余时间；回拨系统时间不增加时长', () => {
  const initial = timer.start(timer.create('w1', 't1', 10, 'local', 10000), 10000);
  const paused = timer.pause(initial, 70000);
  assert.equal(paused.remainingMs, 540000);
  assert.equal(timer.normalize(paused, 370000).remainingMs, 540000);
  assert.equal(timer.start(paused, 370000).deadline, 910000);
  const backwards = timer.normalize(initial, 9000);
  assert.equal(backwards.state, 'paused'); assert.equal(backwards.remainingMs, 600000);
});

test('本机计时只持久化ID和时间状态，不保存正文、Key或无效状态', () => {
  const original = timer.create('w1', 't1', 45, 'cloud', 1000);
  const normalized = timer.normalize({ ...original, title: 'private title', provenance: 'private evidence', apiKey: 'fixture-key-not-a-secret', done: true }, 1000);
  assert.deepEqual(Object.keys(normalized).sort(), ['version', 'workspaceId', 'taskId', 'minutes', 'storageMode', 'state', 'remainingMs', 'deadline', 'updatedAt'].sort());
  for (const bad of [null, {}, { ...original, minutes: 0 }, { ...original, taskId: '../t' }, { ...original, remainingMs: Infinity }, { ...original, state: 'running', deadline: 999999999 }]) assert.equal(timer.normalize(bad, 1000), null);
});

const savedTask = { id: 't1', title: '解释资料读取范围', detail: '演示项目的边界', done: false, provenance: '任务来自课程说明' };
function harness(overrides = {}, rawTimer = null) {
  let page, stored = rawTimer, intervals = 0, clears = 0, writes = [], updates = [];
  const app = { globalData: { cloudGeneration: 1, dataMode: 'cloud' } };
  const workspace = { id: 'w1', title: '我的项目', revision: 2, sources: [], analysis: null, tasks: [savedTask] };
  const api = { mode: async () => 'cloud', list: async () => [{ id: 'w1', title: '我的项目', taskCount: 1 }], get: async () => structuredClone(workspace), save: async (input, revision, guard) => { guard(); writes.push({ input: structuredClone(input), revision }); return { revision: revision + 1 }; }, ...overrides };
  const wx = { getStorageSync: () => stored, setStorageSync: (_, value) => { stored = structuredClone(value); }, navigateTo() {} };
  prepareSubject({
    subject: '../miniprogram/pages/focus/index',
    mocks: [
      { spec: '../../services/materials', value: api },
      { spec: '../../utils/experience', value: { withExperience: (value) => value } },
      { spec: '../../utils/navigation', value: { backOrHome() {} } },
    ],
    globals: { Page: (value) => { page = value; }, getApp: () => app, wx,
      setInterval: () => { intervals++; return intervals; }, clearInterval: () => { clears++; } },
  });
  require('../miniprogram/pages/focus/index');
  page.setData = (value) => { updates.push(value); Object.assign(page.data, value); };
  page.onLoad({ workspaceId: 'w1', taskId: 't1' });
  return { page, app, workspace, writes, api, updates, stored: () => stored, intervals: () => intervals, clears: () => clears };
}

test('页面恢复会重新按当前身份读任务，计时完成不自动保存任务', async () => {
  const now = Date.now();
  const stored = timer.start(timer.create('w1', 't1', 10, 'cloud', now - 700000), now - 700000);
  const f = harness({}, stored); await f.page.onShow();
  assert.equal(f.page.data.task.title, savedTask.title);
  assert.equal(f.page.data.sessionState, 'finished');
  assert.equal(f.writes.length, 0); assert.equal(f.page.data.task.done, false);
  f.page.onHide(); assert.equal(f.page.data.task, null);
});

test('隐藏与卸载清理interval和私密回显，迟到读取不能更新页面', async () => {
  const f = harness(); await f.page.onShow(); f.page.toggleTimer();
  assert.equal(f.intervals(), 1);
  f.page.onHide(); assert.equal(f.clears(), 1); assert.equal(f.page.data.task, null);
  assert(!JSON.stringify(f.stored()).includes(savedTask.title));
  let resolve;
  const g = harness({ get: () => new Promise((r) => { resolve = r; }) });
  const pending = g.page.onShow(); while (!resolve) await Promise.resolve();
  g.page.onUnload(); const count = g.updates.length; resolve(g.workspace); await pending;
  assert.equal(g.updates.length, count);
});

test('手动完成重新读取最新版本，只修改目标任务，重复点击不重复写', async () => {
  let calls = 0;
  const f = harness({ get: async () => { calls++; return { ...f.workspace, revision: calls === 1 ? 2 : 9, title: calls === 1 ? '我的项目' : '另一页更新了标题', tasks: [savedTask, { ...savedTask, id: 't2', title: '其他任务' }] }; } });
  await f.page.onShow();
  await Promise.all([f.page.completeTask(), f.page.completeTask()]);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].revision, 9);
  assert.equal(f.writes[0].input.title, '另一页更新了标题');
  assert.equal(f.writes[0].input.tasks[0].done, true); assert.equal(f.writes[0].input.tasks[1].done, false);
  assert.equal(f.page.data.task.done, true);
});

test('任务删除、版本冲突和不确定结果不冒充完成', async () => {
  const removed = harness(); await removed.page.onShow(); removed.api.get = async () => ({ ...removed.workspace, tasks: [] });
  await removed.page.completeTask(); assert.equal(removed.writes.length, 0); assert.equal(removed.page.data.task.done, false); assert.match(removed.page.data.error, /删除/);
  for (const error of [Object.assign(Error('资料已更新'), { code: 'MATERIAL_CONFLICT' }), Object.assign(Error('请求超时'), { outcomeUnknown: true })]) {
    const f = harness({ save: async () => { throw error; } }); await f.page.onShow(); await f.page.completeTask();
    assert.equal(f.page.data.task.done, false); assert(f.page.data.error);
  }
});

test('连接代次变化后拒绝旧任务回显或保存，重新读取失败也没有旧正文', async () => {
  const f = harness(); await f.page.onShow(); f.app.globalData.cloudGeneration++;
  await f.page.completeTask(); assert.equal(f.writes.length, 0); assert.equal(f.page.data.task, null);
  const g = harness(); await g.page.onShow(); g.page.onHide();
  g.api.get = async () => { throw Error('资料不存在或已删除'); }; await g.page.onShow();
  assert.equal(g.page.data.task, null); assert(!JSON.stringify(g.page.data).includes(savedTask.provenance));
});
