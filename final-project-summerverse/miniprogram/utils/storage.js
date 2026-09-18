const { scopedKey } = require('./account-scope');
function get(key, fallback = null) {
  try {
    const value = wx.getStorageSync(scopedKey(key));
    return value === '' || value === undefined ? fallback : value;
  } catch (error) {
    console.warn('[storage:get]', key, error);
    return fallback;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(scopedKey(key), value);
    return true;
  } catch (error) {
    console.warn('[storage:set]', key, error);
    return false;
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(scopedKey(key));
  } catch (error) {
    console.warn('[storage:remove]', key, error);
  }
}

function clearNamespace(prefix = 'summerverse.') {
  try {
    const { keys = [] } = wx.getStorageInfoSync();
    keys.filter((key) => key.startsWith(scopedKey(prefix))).forEach((key) => wx.removeStorageSync(key));
  } catch (error) {
    console.warn('[storage:clearNamespace]', error);
  }
}

module.exports = { get, set, remove, clearNamespace };
