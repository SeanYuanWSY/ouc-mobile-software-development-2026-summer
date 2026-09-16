// Presentation preferences only: never select a storage backend or carry AI config.
const KEY = 'summerverse.experience.v1';
const MODES = [
  { id: 'minimal', label: '简洁', description: '资料与行动，清楚就好' },
  { id: 'journal', label: '记录', description: '保留小岛和手绘日常' },
  { id: 'focus', label: '专注', description: '此刻只做一件重要的事' }
];
function normalize(value) {
  return { mode: MODES.some((item) => item.id === value?.mode) ? value.mode : 'minimal', reduceMotion: value?.reduceMotion === true };
}
function read() { try { return normalize(wx.getStorageSync(KEY)); } catch (_) { return normalize(null); } }
function write(value) {
  const next = normalize(value);
  try { wx.setStorageSync(KEY, next); } catch (_) { throw new Error('偏好未能保存，请检查本机空间'); }
  return next;
}
function view(preferences = read()) {
  const value = normalize(preferences);
  return { experienceMode: value.mode, reduceMotion: value.reduceMotion,
    experienceClass: `experience-${value.mode}${value.reduceMotion ? ' reduce-motion' : ''}`, experienceModes: MODES };
}
function apply(page) {
  const next = view();
  if (page.data.experienceClass !== next.experienceClass) page.setData(next);
  return next;
}
function withExperience(config) {
  const result = { ...config, data: { ...view(normalize(null)), ...config.data } };
  for (const lifecycle of ['onLoad', 'onShow']) {
    const original = config[lifecycle];
    result[lifecycle] = function (...args) { apply(this); return original?.apply(this, args); };
  }
  result.setExperienceOptions = function (change) {
    const next = write({ ...read(), ...change });
    this.setData(view(next));
    this.getTabBar?.()?.refreshExperience?.();
    return next;
  };
  return result;
}
module.exports = { KEY, MODES, normalize, read, write, view, apply, withExperience };
