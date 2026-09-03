const { isCloudReady } = require('./cloud');

function extension(path, fallback = 'jpg') {
  const match = String(path || '').match(/\.([a-zA-Z0-9]{1,6})(?:\?|$)/);
  return match ? match[1].toLowerCase() : fallback;
}

function uploadFile(tempFilePath, prefix = 'memory') {
  if (!isCloudReady()) return Promise.reject(new Error('CLOUD_NOT_READY'));
  const ext = extension(tempFilePath, prefix === 'voice' ? 'mp3' : 'jpg');
  const cloudPath = `summerverse/${prefix}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  if (item.fileID || (item.url && !item.tempFilePath)) return item;
  const path = item.tempFilePath || item.url;
  if (!path) return item;
  try {
    if (isCloudReady()) {
      const uploaded = await uploadFile(path, item.type === 'audio' ? 'voice' : 'memory');
      return { ...item, ...uploaded, tempFilePath: '' };
    }
  } catch (error) {
    console.warn('[media] cloud upload fallback:', error);
  }
  const local = await persistLocalFile(path, item.type === 'audio' ? 'voice' : 'memory');
  return { ...item, ...local, tempFilePath: '' };
}

async function persistAll(items = [], onProgress = () => {}) {
  const result = [];
  for (let i = 0; i < items.length; i += 1) {
    // Sequential upload keeps memory use and CloudBase concurrency predictable.
    const saved = await persistItem(items[i]);
    result.push(saved);
    onProgress(i + 1, items.length);
  }
  return result;
}

module.exports = { uploadFile, persistLocalFile, resolveUrl, persistItem, persistAll };
