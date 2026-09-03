const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });


async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

exports.main = async (event = {}) => {
  try {
    const latitude = Number(event.latitude);
    const longitude = Number(event.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, error: '经纬度格式不正确' };
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      timezone: 'auto'
    });
    const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) throw new Error(`天气服务 HTTP ${response.status}`);
    const body = await response.json();
    const current = body.current || {};
    if (!Number.isFinite(Number(current.temperature_2m)) || !Number.isFinite(Number(current.weather_code))) throw new Error('天气服务返回字段不完整');
    return {
      ok: true,
      data: {
        temperature: Math.round(Number(current.temperature_2m)),
        apparentTemperature: Math.round(Number(current.apparent_temperature)),
        weatherCode: Number(current.weather_code),
        windSpeed: Math.round(Number(current.wind_speed_10m)),
        isDay: Number(current.is_day) === 1,
        timezone: body.timezone || '',
        observedAt: current.time || new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[weather]', error);
    return { ok: false, error: error.message || '实时天气获取失败' };
  }
};
