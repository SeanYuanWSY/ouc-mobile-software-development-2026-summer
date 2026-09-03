const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function dateFromTimestamp(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(date);
}

exports.main = async (event = {}) => {
  try {
    const openData = event.weRunData?.data || event.weRunData;
    const list = Array.isArray(openData?.stepInfoList) ? openData.stepInfoList : [];
    if (!list.length) return { ok: false, error: '没有读取到微信运动开放数据；请确认传入了 wx.cloud.CloudID(res.cloudID)。' };
    const history = list.map((item) => ({ date: dateFromTimestamp(item.timestamp), steps: Number(item.step) || 0 })).sort((a, b) => a.date.localeCompare(b.date));
    const today = history[history.length - 1];
    return { ok: true, data: { todaySteps: today.steps, todayDate: today.date, history } };
  } catch (error) {
    console.error('[weRunData]', error);
    return { ok: false, error: error.message || '微信运动数据解密失败' };
  }
};
