const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uniqueCloudFileIDs,
  registeredFileIDs,
  deletionOutcome
} = require('../cloudfunctions/dataService/media-policy');

test('云附件清理只保留当前用户已登记的 fileID', () => {
  const requested = uniqueCloudFileIDs(['cloud://mine/a.jpg', 'cloud://other/b.jpg', 'cloud://mine/a.jpg', '/tmp/local.jpg']);
  assert.deepEqual(requested, ['cloud://mine/a.jpg', 'cloud://other/b.jpg']);
  assert.deepEqual(registeredFileIDs(requested, [{ fileID: 'cloud://mine/a.jpg' }]), ['cloud://mine/a.jpg']);
});

test('批量删除只把逐文件 SUCCESS 或文件已不存在视为完成', () => {
  const result = deletionOutcome(['cloud://mine/a.jpg', 'cloud://mine/b.jpg', 'cloud://mine/c.jpg'], {
    fileList: [
      { fileID: 'cloud://mine/a.jpg', status: 0, errMsg: 'deleteFile:ok' },
      { fileID: 'cloud://mine/b.jpg', code: 'STORAGE_FILE_NONEXIST' },
      { fileID: 'cloud://mine/c.jpg', code: 'STORAGE_REQUEST_FAIL' }
    ]
  });
  assert.deepEqual(result.deleted, ['cloud://mine/a.jpg', 'cloud://mine/b.jpg']);
  assert.deepEqual(result.failed, ['cloud://mine/c.jpg']);
});
