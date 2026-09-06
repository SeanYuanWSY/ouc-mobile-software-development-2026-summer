const { callFunction, isCloudReady, waitForCloudReady } = require('./cloud');

function extension(path, fallback = 'jpg') {
  const match = String(path || '').match(/\.([a-zA-Z0-9]{1,6})(?:\?|$)/);
  return match ? match[1].toLowerCase() : fallback;
}

async function uploadFile(tempFilePath, prefix = 'memory') {
  if (!isCloudReady()) return Promise.reject(new Error('CLOUD_NOT_READY'));
  const ext = extension(tempFilePath, prefix === 'voice' ? 'mp3' : 'jpg');
  const prepared = await callFunction('dataService', { action: 'media.prepare', payload: {} });
  const ownerPrefix = prepared && prepared.data && prepared.data.prefix;
  if (!ownerPrefix || !String(ownerPrefix).startsWith('summerverse/')) throw new Error('无法获取安全上传路径');
  const cloudPath = `${ownerPrefix}/${prefix}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: ({ fileID }) => resolve({ fileID, url: fileID, cloudPath }),
      fail: reject
    });
  });
}

function persistLocalFile(tempFilePath, prefix = 'memory') {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const ext = extension(tempFilePath, prefix === 'voice' ? 'mp3' : 'jpg');
    const dest = `${wx.env.USER_DATA_PATH}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    fs.copyFile({
      srcPath: tempFilePath,
      destPath: dest,
      success: () => resolve({ url: dest, localPath: dest }),
      fail: reject
    });
  });
}

async function registerCloudItem(item) {
  if (!item.fileID || !String(item.fileID).startsWith('cloud://')) return item;
  await callFunction('dataService', {
    action: 'media.register',
    payload: { fileID: item.fileID, cloudPath: item.cloudPath, type: item.type, size: item.size }
  });
  return item;
}

function deleteCloudFiles(fileIDs = []) {
  const fileList = fileIDs.filter((value) => String(value || '').startsWith('cloud://'));
  if (!fileList.length) return Promise.resolve({ requested: 0, deleted: 0, failed: [] });
  if (!wx.cloud || !wx.cloud.deleteFile) return Promise.resolve({ requested: fileList.length, deleted: 0, failed: fileList });
  return new Promise((resolve) => wx.cloud.deleteFile({
    fileList,
    success: (result) => {
      const completedCodes = ['SUCCESS', 'STORAGE_FILE_NONEXIST'];
      const deleted = (result.fileList || [])
        .filter((item) => item.status === 0 || completedCodes.includes(item.code))
        .map((item) => item.fileID);
      resolve({ requested: fileList.length, deleted: deleted.length, failed: fileList.filter((fileID) => !deleted.includes(fileID)) });
    },
    fail: () => resolve({ requested: fileList.length, deleted: 0, failed: fileList })
  }));
}

async function deleteLocalFiles(items = []) {
  const root = wx.env && wx.env.USER_DATA_PATH;
  const filePaths = [...new Set(items
    .map((item) => item && (item.localPath || item.url))
    .filter((filePath) => {
      const value = String(filePath || '');
      if (!root || !value.startsWith(`${root}/`) || value.includes('/../')) return false;
      const name = value.slice(root.length + 1);
      return /^(memory|voice)-\d+-[a-z0-9]{5}\.[a-z0-9]{1,6}$/i.test(name);
    }))];
  if (!filePaths.length) return { requested: 0, deleted: 0, failed: [] };
  const fs = wx.getFileSystemManager();
  const results = await Promise.all(filePaths.map((filePath) => new Promise((resolve) => {
    fs.unlink({ filePath, success: () => resolve({ filePath, ok: true }), fail: () => resolve({ filePath, ok: false }) });
  })));
  return {
    requested: filePaths.length,
    deleted: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).map((item) => item.filePath)
  };
}


function resolveUrl(value) {
  if (!String(value || '').startsWith('cloud://') || !wx.cloud) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [value],
      success: ({ fileList }) => resolve(fileList?.[0]?.tempFileURL || value),
      fail: reject
    });
  });
}

async function persistItem(item) {
  if (item.fileID) {
    if (await waitForCloudReady()) await registerCloudItem(item);
    return item;
  }
  if (item.url && !item.tempFilePath) return item;
  const path = item.tempFilePath || item.url;
  if (!path) return item;
  if (await waitForCloudReady()) {
    let uploaded;
    try {
      uploaded = { ...item, ...await uploadFile(path, item.type === 'audio' ? 'voice' : 'memory'), tempFilePath: '' };
      await registerCloudItem(uploaded);
      return { ...uploaded, _newlyPersisted: true };
    } catch (error) {
      const cleanup = uploaded && uploaded.fileID ? await deleteCloudFiles([uploaded.fileID]) : null;
      const cleanupMessage = cleanup && cleanup.failed.length ? '；刚上传的云文件也未能自动清理，请在云开发控制台检查' : '';
      throw new Error(`附件上传云存储失败：${error.errMsg || error.message || '请检查网络和云存储权限'}${cleanupMessage}`);
    }
  }
  const local = await persistLocalFile(path, item.type === 'audio' ? 'voice' : 'memory');
  return { ...item, ...local, tempFilePath: '', _newlyPersisted: true };
}

function stripPersistenceMetadata(item) {
  const clean = { ...item };
  delete clean._newlyPersisted;
  return clean;
}

async function rollbackPersisted(items = []) {
  const created = items.filter((item) => item && item._newlyPersisted);
  const cloudIDs = created.map((item) => item.fileID).filter((fileID) => String(fileID || '').startsWith('cloud://'));
  const localItems = created.filter((item) => !item.fileID);
  let cloudCleanup = { requested: cloudIDs.length, deleted: 0, retained: [], failed: cloudIDs };
  if (cloudIDs.length) {
    try {
      const result = await callFunction('dataService', { action: 'media.cleanup', payload: { fileIDs: cloudIDs } });
      cloudCleanup = result.mediaCleanup || cloudCleanup;
    } catch (_) { /* The caller reports the original save error; failed IDs remain available to cloud audit. */ }
  }
  const localCleanup = await deleteLocalFiles(localItems);
  return {
    requested: cloudCleanup.requested + localCleanup.requested,
    deleted: cloudCleanup.deleted + localCleanup.deleted,
    retained: cloudCleanup.retained || [],
    failed: [...(cloudCleanup.failed || []), ...localCleanup.failed]
  };
}

async function persistAll(items = [], onProgress = () => {}) {
  const result = [];
  try {
    for (let i = 0; i < items.length; i += 1) {
      // Sequential upload keeps memory use and CloudBase concurrency predictable.
      const saved = await persistItem(items[i]);
      result.push(saved);
      onProgress(i + 1, items.length);
    }
    return result;
  } catch (error) {
    const rollback = await rollbackPersisted(result);
    if (rollback.failed.length) {
      throw new Error(`${error.errMsg || error.message || '附件保存失败'}；部分已上传附件未能回滚，请在云开发控制台检查`);
    }
    throw error;
  }
}

module.exports = {
  uploadFile,
  persistLocalFile,
  registerCloudItem,
  deleteCloudFiles,
  deleteLocalFiles,
  resolveUrl,
  persistItem,
  stripPersistenceMetadata,
  rollbackPersisted,
  persistAll
};
