const accountScope = require('../utils/account-scope');
function getAppSafe() {
  try { return getApp(); } catch (_) { return null; }
}

const READ_TTL_MS = 12000;
const readCache = new Map();
const resourceVersions = new Map();
let cacheApp = null;
let cacheScope = '';

function resetReadScope(mode) {
  const app = getAppSafe();
  const scope = `${mode}:${app?.globalData?.cloudGeneration || 0}:${accountScope.stamp()}`;
  if (cacheApp !== app || cacheScope !== scope) {
    readCache.clear(); resourceVersions.clear(); cacheApp = app; cacheScope = scope;
  }
}

function invalidateReads(resource) {
  resourceVersions.set(resource, (resourceVersions.get(resource) || 0) + 1);
  for (const [key, entry] of readCache) if (entry.resource === resource) readCache.delete(key);
}

async function dataMode() {
  const check = accountScope.guard(true);
  const ready = await waitForCloudReady(); check();
  if (ready) return 'cloud';
  const app = getAppSafe();
  if (app?.globalData?.dataMode === 'cloud' || app?.globalData?.cloudIntent === true) {
    const error = new Error('云端暂未连接，请检查网络后在设置中重新连接；内容不会改存本机');
    error.code = 'CLOUD_UNAVAILABLE';
    throw error;
  }
  return 'local';
}

// Only use for read-only, non-credential data. No storage, write or AI retry.
async function cachedRead(resource, key, loader, options = {}) {
  const mode = await dataMode();
  resetReadScope(mode);
  const cacheKey = `${resource}:${key}`;
  const version = resourceVersions.get(resource) || 0;
  const scope = cacheScope, app = cacheApp;
  const contextChanged = () => {
    const current = getAppSafe();
    return current !== app || `${current?.globalData?.dataMode || mode}:${current?.globalData?.cloudGeneration || 0}:${accountScope.stamp()}` !== scope;
  };
  const existing = readCache.get(cacheKey);
  if (existing?.pending) return existing.pending;
  if (!options.forceRefresh && existing && existing.expires > Date.now()) return existing.value;
  const entry = { resource, version, pending: null };
  entry.pending = Promise.resolve().then(loader).then((value) => {
    if (app !== cacheApp || scope !== cacheScope || contextChanged()) {
      if (readCache.get(cacheKey) === entry) readCache.delete(cacheKey);
      throw new Error('连接已变化，请重新打开页面');
    }
    if (version !== (resourceVersions.get(resource) || 0)) {
      return cachedRead(resource, key, loader);
    }
    if (readCache.get(cacheKey) === entry) {
      entry.value = value; entry.expires = Date.now() + READ_TTL_MS; entry.pending = null;
    }
    return value;
  }, (error) => {
    if (readCache.get(cacheKey) === entry) readCache.delete(cacheKey);
    if (contextChanged()) throw new Error('连接已变化，请重新打开页面');
    throw error;
  });
  if (readCache.size >= 32) readCache.delete(readCache.keys().next().value);
  readCache.set(cacheKey, entry);
  return entry.pending;
}

function isCloudReady() {
  const app = getAppSafe();
  return Boolean(wx.cloud && app?.globalData?.cloudReady);
}

async function waitForCloudReady() {
  const app = getAppSafe();
  if (!wx.cloud || !app) return false;
  if (typeof app.awaitCloudReady === 'function') {
    try { return Boolean(await app.awaitCloudReady()); }
    catch (_) { return false; }
  }
  return Boolean(app.globalData && app.globalData.cloudReady);
}

async function callFunction(name, data = {}, options = {}) {
  const accountStamp = accountScope.stamp();
  if (!(await waitForCloudReady())) throw new Error('CLOUD_NOT_READY');
  if (accountStamp !== accountScope.stamp()) throw Object.assign(new Error('账号已变化，请重新操作'), { code: 'ACCOUNT_CHANGED' });
  if (options.beforeDispatch) options.beforeDispatch();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new Error(`${name} 云函数调用超时，结果尚未确认`);
      error.outcomeUnknown = true;
      reject(error);
    }, options.timeout || 20000);
    const onFailure = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const failure = new Error(error?.errMsg || error?.message || '网络请求失败，结果尚未确认');
      failure.code = error?.code || error?.errCode;
      failure.outcomeUnknown = true;
      reject(failure);
    };
    try { wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (accountStamp !== accountScope.stamp()) { reject(Object.assign(new Error('账号已变化，已忽略旧账号的回复'), { code: 'ACCOUNT_CHANGED' })); return; }
        const result = res?.result;
        if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') {
          reject(Object.assign(new Error('云端返回格式不完整，提交结果尚未确认'), { code: 'CLOUD_INVALID_RESPONSE', outcomeUnknown: true }));
          return;
        }
        if (result?.ok === false) {
          const error = new Error(result.error || result.message || '云函数执行失败');
          error.code = result.code;
          error.scope = result.scope;
          error.retryAfterSeconds = result.retryAfterSeconds;
          error.outcomeUnknown = ['SERVER_ERROR', 'MATERIAL_SERVICE_UNAVAILABLE'].includes(result.code);
          reject(error);
          return;
        }
        resolve(result);
      },
      fail: onFailure
    }); } catch (error) { onFailure(error); }
  });
}

module.exports = { isCloudReady, waitForCloudReady, callFunction, dataMode, cachedRead, invalidateReads };
