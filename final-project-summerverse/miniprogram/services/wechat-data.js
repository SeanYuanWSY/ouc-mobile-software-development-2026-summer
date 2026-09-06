const { callFunction, waitForCloudReady } = require('./cloud');
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
        : scope === 'scope.record'
          ? '只有授权麦克风后，才能把你主动录制的语音加入记忆。'
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
  if (!(await waitForCloudReady())) throw new Error('微信运动数据需要先配置微信云开发');
  await wxp('login');
  await ensureScope('scope.werun');
  let result;
  try {
    result = await wxp('getWeRunData');
  } catch (cause) {
    let platform = '';
    try { platform = String(wx.getDeviceInfo?.().platform || '').toLowerCase(); } catch (_) {}
    const desktop = ['mac', 'windows', 'linux'].includes(platform);
    const error = new Error(desktop
      ? '当前电脑端微信未能读取运动步数，请在手机微信中打开本体验版同步。此次失败发生在微信客户端，尚未调用步数解密服务。'
      : '微信客户端未能读取运动步数。请确认手机微信运动已有数据，并允许本小程序访问微信运动；若仍失败，请保留此提示。');
    error.code = 'WERUN_CLIENT_FAILED';
    error.message += '\n错误阶段：getWeRunData';
    if (Number.isFinite(cause?.errCode)) error.message += `（${cause.errCode}）`;
    throw error;
  }
  if (!result.cloudID || !wx.cloud?.CloudID) throw new Error('当前基础库未返回可用于云函数解密的 cloudID');
  const res = await callFunction('weRunData', { weRunData: wx.cloud.CloudID(result.cloudID) });
  if (!res?.data || !Number.isInteger(res.data.todaySteps) || res.data.todaySteps < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(res.data.todayDate || '') || !Array.isArray(res.data.history) || !res.data.history.length) {
    throw new Error('步数服务未返回有效数据，本次未更新步数。');
  }
  const snapshot = {
    steps: res.data.todaySteps,
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
  if (!(await waitForCloudReady())) throw new Error('实时天气需要先配置 weather 云函数');
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
