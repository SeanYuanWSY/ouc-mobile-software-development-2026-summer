const test = require('node:test');
const assert = require('node:assert/strict');

function loadRepository({ failWrites = false } = {}) {
  const values = new Map();
  const unlinked = [];
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    getStorageSync(key) { return values.has(key) ? values.get(key) : ''; },
    setStorageSync(key, value) {
      if (failWrites) throw new Error('quota exceeded');
      values.set(key, value);
    },
    removeStorageSync(key) { values.delete(key); },
    getFileSystemManager() {
      return { unlink({ filePath, success }) { unlinked.push(filePath); success(); } };
    }
  };
  delete require.cache[require.resolve('../miniprogram/services/repository')];
  delete require.cache[require.resolve('../miniprogram/services/cloud')];
  return { repository: require('../miniprogram/services/repository'), values, unlinked };
}

test.afterEach(() => {
  delete global.wx;
  delete global.getApp;
  delete require.cache[require.resolve('../miniprogram/services/repository')];
  delete require.cache[require.resolve('../miniprogram/services/cloud')];
});

test('本机目标可创建并更新进度', async () => {
  const { repository } = loadRepository();
  const created = (await repository.saveGoal({ title: '完成真机验收', target: 2, unit: '项' })).data;
  assert.ok(created._id);
  await repository.saveGoal({ ...created, current: 1 });
  const goals = (await repository.listGoals()).data;
  assert.equal(goals.length, 1);
  assert.equal(goals[0].current, 1);
});

test('本机写入失败时不会假装保存成功', async () => {
  const { repository } = loadRepository({ failWrites: true });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(() => repository.saveMemory({ title: '不会丢失的记忆' }), /写入失败/);
  } finally {
    console.warn = originalWarn;
  }
});

test('已进入云模式后读取失败不会混入本机数据', async () => {
  const { repository } = loadRepository();
  global.getApp = () => ({ globalData: { cloudReady: true }, awaitCloudReady: () => Promise.resolve(true) });
  global.wx.cloud = { callFunction({ fail }) { fail(new Error('cloud unavailable')); } };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(() => repository.listMemories(), /cloud unavailable/);
  } finally {
    console.warn = originalWarn;
  }
});

test('删除本机记忆时一并清理其私有附件', async () => {
  const { repository, unlinked } = loadRepository();
  const created = (await repository.saveMemory({
    title: '带照片的记忆',
    media: [{ type: 'image', url: '/device/memory-123-abcde.jpg', localPath: '/device/memory-123-abcde.jpg' }]
  })).data;
  const result = await repository.deleteMemory(created._id);
  assert.equal(result.data.deleted, true);
  assert.deepEqual(result.data.mediaCleanup, { requested: 1, deleted: 1, failed: [], retained: [] });
  assert.deepEqual(unlinked, ['/device/memory-123-abcde.jpg']);
  assert.equal((await repository.listMemories()).data.length, 0);
});

test('多个记忆共用本机附件时保留仍被引用的文件', async () => {
  const { repository, unlinked } = loadRepository();
  const media = [{ type: 'image', url: '/device/memory-123-abcde.jpg', localPath: '/device/memory-123-abcde.jpg' }];
  const first = (await repository.saveMemory({ title: '第一条', media })).data;
  await repository.saveMemory({ title: '第二条', media });
  const result = await repository.deleteMemory(first._id);
  assert.deepEqual(unlinked, []);
  assert.deepEqual(result.data.mediaCleanup.retained, ['/device/memory-123-abcde.jpg']);
});

test('编辑移除最后一个本机附件引用时清理文件', async () => {
  const { repository, unlinked } = loadRepository();
  const created = (await repository.saveMemory({
    title: '编辑前',
    media: [{ type: 'image', url: '/device/memory-456-fghij.jpg', localPath: '/device/memory-456-fghij.jpg' }]
  })).data;
  const updated = await repository.saveMemory({ ...created, title: '编辑后', media: [] });
  assert.deepEqual(unlinked, ['/device/memory-456-fghij.jpg']);
  assert.equal(updated.data._mediaCleanup.deleted, 1);
});

test('重复导入示例保留真实记忆和目标且不重复增加示例', async () => {
  const { repository } = loadRepository();
  const memory = (await repository.saveMemory({ title: '自己的记录', source: 'manual' })).data;
  const goal = (await repository.saveGoal({ title: '自己的目标', target: 2 })).data;
  const first = await repository.importDemoData();
  const second = await repository.importDemoData();
  assert.ok(first.memories > 0);
  assert.equal(second.memories, 0);
  assert.equal(second.goals, 0);
  assert.ok((await repository.listMemories()).data.some((item) => item._id === memory._id));
  assert.ok((await repository.listGoals()).data.some((item) => item._id === goal._id));
  repository.clearDemoData();
  assert.equal((await repository.listMemories()).data.length, 1);
  assert.equal((await repository.listGoals()).data.length, 1);
});
