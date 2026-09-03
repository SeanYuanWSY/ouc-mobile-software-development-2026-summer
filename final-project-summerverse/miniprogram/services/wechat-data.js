const { callFunction, isCloudReady } = require('./cloud');
const repository = require('./repository');
const { formatDate } = require('../utils/date');
const { wxp } = require('../utils/promisify');

async function ensureScope(scope) {
  const setting = await wxp('getSetting');
  if (setting.authSetting?.[scope]) return true;
  try {
    await wxp('authorize', { scope });
    return true;
  } catch (error) {
    const modal = await wxp('showModal', {
      title: '需要你的授权',
      content: scope === 'scope.werun'
        ? '只有授权微信运动后，才能显示真实步数；未授权时不会展示模拟数字。'
        : '只有授权位置后，才能记录真实地点并获取本地天气。',
      confirmText: '去设置',
      cancelText: '暂不'
    });
    if (!modal.confirm) throw error;
    const opened = await wxp('openSetting');
    if (!opened.authSetting?.[scope]) throw new Error('用户未授权');
    return true;
  }
}

async function syncWeRun() {
  if (!isCloudReady()) throw new Error('微信运动数据需要先配置微信云开发');
  await wxp('login');
  await ensureScope('scope.werun');
  const result = await wxp('getWeRunData');
  if (!result.cloudID || !wx.cloud?.CloudID) throw new Error('当前基础库未返回可用于云函数解密的 cloudID');
  const res = await callFunction('weRunData', { weRunData: wx.cloud.CloudID(result.cloudID) });
  const snapshot = {
    steps: Number(res.data?.todaySteps) || 0,
    date: res.data?.todayDate || formatDate(),
    history: res.data?.history || [],
    syncedAt: new Date().toISOString(),
    source: 'wechat-werun'
  };
  await repository.saveStepSnapshot(snapshot);
  return snapshot;
}

async function getCurrentLocation(type = 'gcj02') {
  await ensureScope('scope.userLocation');
  const result = await wxp('getLocation', { type, altitude: false, isHighAccuracy: true, highAccuracyExpireTime: 3500 });
  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    accuracy: Number(result.accuracy) || 0
  };
}

async function chooseLocation() {
  await ensureScope('scope.userLocation');
  const result = await wxp('chooseLocation');
  return {
    name: result.name || '选中的地点',
    address: result.address || '',
    latitude: Number(result.latitude),
    longitude: Number(result.longitude)
  };
}

async function syncWeather(location) {
  if (!isCloudReady()) throw new Error('实时天气需要先配置 weather 云函数');
  const point = location || await getCurrentLocation('gcj02');
  const res = await callFunction('weather', point, { timeout: 20000 });
  const snapshot = {
    ...res.data,
    location: point,
    syncedAt: new Date().toISOString(),
    source: 'open-meteo'
  };
  repository.saveWeatherSnapshot(snapshot);
  return snapshot;
}

module.exports = { ensureScope, syncWeRun, getCurrentLocation, chooseLocation, syncWeather };
