const test = require('node:test');
const assert = require('node:assert/strict');

test.afterEach(() => {
  delete global.wx;
  delete global.getApp;
  delete require.cache[require.resolve('../miniprogram/services/media')];
});

test('cloud upload errors never fall back to a device-only path', async () => {
  global.getApp = () => ({
    globalData: { cloudReady: true },
    awaitCloudReady: () => Promise.resolve(true)
  });
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {
      callFunction({ success }) { success({ result: { ok: true, data: { prefix: 'summerverse/owner-hash' } } }); },
      uploadFile({ fail }) { fail({ errMsg: 'network unavailable' }); }
    },
    getFileSystemManager() {
      return { copyFile() { throw new Error('local fallback must not run'); } };
    }
  };
  const { persistItem } = require('../miniprogram/services/media');
  await assert.rejects(
    () => persistItem({ type: 'image', tempFilePath: '/tmp/photo.jpg' }),
    /附件上传云存储失败/
  );
});

test('local mode persists temporary files in the user data directory', async () => {
  global.getApp = () => ({
    globalData: { cloudReady: false },
    awaitCloudReady: () => Promise.resolve(false)
  });
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {},
    getFileSystemManager() {
      return { copyFile({ destPath, success }) { success(); assert.match(destPath, /^\/device\/memory-/); } };
    }
  };
  const { persistItem } = require('../miniprogram/services/media');
  const result = await persistItem({ type: 'image', tempFilePath: '/tmp/photo.jpg' });
  assert.match(result.localPath, /^\/device\/memory-/);
});

test('cloud uploads use the owner namespace and register before returning', async () => {
  global.getApp = () => ({ globalData: { cloudReady: true }, awaitCloudReady: () => Promise.resolve(true) });
  const actions = [];
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {
      callFunction({ data, success }) {
        actions.push(data.action);
        const result = data.action === 'media.prepare'
          ? { ok: true, data: { prefix: 'summerverse/owner-hash' } }
          : { ok: true, data: true };
        success({ result });
      },
      uploadFile({ cloudPath, success }) {
        assert.match(cloudPath, /^summerverse\/owner-hash\/memory\//);
        success({ fileID: `cloud://env.${cloudPath}` });
      }
    }
  };
  const { persistItem } = require('../miniprogram/services/media');
  const result = await persistItem({ type: 'image', tempFilePath: '/tmp/photo.jpg', size: 10 });
  assert.match(result.fileID, /^cloud:\/\/env\.summerverse\/owner-hash\//);
  assert.deepEqual(actions, ['media.prepare', 'media.register']);
});

test('registration failure removes the just-uploaded orphan cloud file', async () => {
  global.getApp = () => ({ globalData: { cloudReady: true }, awaitCloudReady: () => Promise.resolve(true) });
  const deleted = [];
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {
      callFunction({ data, success }) {
        if (data.action === 'media.prepare') success({ result: { ok: true, data: { prefix: 'summerverse/owner-hash' } } });
        else success({ result: { ok: false, error: 'registration rejected' } });
      },
      uploadFile({ cloudPath, success }) { success({ fileID: `cloud://env.${cloudPath}` }); },
      deleteFile({ fileList, success }) {
        deleted.push(...fileList);
        success({ fileList: fileList.map((fileID) => ({ fileID, status: 0, errMsg: 'deleteFile:ok' })) });
      }
    }
  };
  const { persistItem } = require('../miniprogram/services/media');
  await assert.rejects(() => persistItem({ type: 'image', tempFilePath: '/tmp/photo.jpg' }), /附件上传云存储失败/);
  assert.equal(deleted.length, 1);
  assert.match(deleted[0], /^cloud:\/\/env\.summerverse\/owner-hash\//);
});

test('local cleanup only removes files inside the Mini Program data directory', async () => {
  const removed = [];
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {},
    getFileSystemManager() {
      return { unlink({ filePath, success }) { removed.push(filePath); success(); } };
    }
  };
  const { deleteLocalFiles } = require('../miniprogram/services/media');
  const result = await deleteLocalFiles([
    { localPath: '/device/memory-123-abcde.jpg' },
    { localPath: '/device/memory-123-abcde.jpg/../../other.jpg' },
    { localPath: '/device/unrelated.txt' },
    { url: '/tmp/unowned.jpg' },
    { url: 'https://example.com/image.jpg' }
  ]);
  assert.deepEqual(removed, ['/device/memory-123-abcde.jpg']);
  assert.deepEqual(result, { requested: 1, deleted: 1, failed: [] });
});

test('multi-attachment failure rolls back files persisted earlier in the batch', async () => {
  global.getApp = () => ({ globalData: { cloudReady: true }, awaitCloudReady: () => Promise.resolve(true) });
  const actions = [];
  let uploads = 0;
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {
      callFunction({ data, success }) {
        actions.push(data.action);
        if (data.action === 'media.prepare') success({ result: { ok: true, data: { prefix: 'summerverse/owner-hash' } } });
        else if (data.action === 'media.cleanup') success({ result: { ok: true, data: true, mediaCleanup: { requested: 1, deleted: 1, retained: [], failed: [] } } });
        else success({ result: { ok: true, data: true } });
      },
      uploadFile({ cloudPath, success, fail }) {
        uploads += 1;
        if (uploads === 1) success({ fileID: `cloud://env.${cloudPath}` });
        else fail({ errMsg: 'second upload failed' });
      }
    }
  };
  const { persistAll } = require('../miniprogram/services/media');
  await assert.rejects(() => persistAll([
    { type: 'image', tempFilePath: '/tmp/one.jpg' },
    { type: 'image', tempFilePath: '/tmp/two.jpg' }
  ]), /附件上传云存储失败/);
  assert.equal(actions.filter((action) => action === 'media.cleanup').length, 1);
});

test('failed rollback is disclosed in the original attachment error', async () => {
  global.getApp = () => ({ globalData: { cloudReady: true }, awaitCloudReady: () => Promise.resolve(true) });
  let uploads = 0;
  global.wx = {
    env: { USER_DATA_PATH: '/device' },
    cloud: {
      callFunction({ data, success, fail }) {
        if (data.action === 'media.prepare') success({ result: { ok: true, data: { prefix: 'summerverse/owner-hash' } } });
        else if (data.action === 'media.cleanup') fail({ errMsg: 'cleanup unavailable' });
        else success({ result: { ok: true, data: true } });
      },
      uploadFile({ cloudPath, success, fail }) {
        uploads += 1;
        if (uploads === 1) success({ fileID: `cloud://env.${cloudPath}` });
        else fail({ errMsg: 'second upload failed' });
      }
    }
  };
  const { persistAll } = require('../miniprogram/services/media');
  await assert.rejects(() => persistAll([
    { type: 'image', tempFilePath: '/tmp/one.jpg' },
    { type: 'image', tempFilePath: '/tmp/two.jpg' }
  ]), /未能回滚/);
});
