const { scopedKey, guard: accountGuard } = require('../utils/account-scope');
const policy = require('../utils/material-policy');
const { callFunction, waitForCloudReady, dataMode: resolveMode, cachedRead = (resource, key, loader) => loader(), invalidateReads = () => {} } = require('./cloud');
const media = require('./media');
const ai = require('./ai');
const LOCAL_KEY = 'summerverse.material-workspaces.v1';
function makeId(prefix = 's') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
async function mode() { const check = accountGuard(); const result = resolveMode ? await resolveMode() : await waitForCloudReady() ? 'cloud' : 'local'; check(); return result; }
async function capability() {
  return cachedRead('material-capability', 'protocol', async () => {
    const res = await callFunction('dataService', { action: 'material.capabilities' });
    if (res?.data?.protocol !== 'materials-v1') throw new Error('云端资料服务需要更新，请联系开发者');
    return res.data;
  });
}
function locals() { const value = wx.getStorageSync(scopedKey(LOCAL_KEY)); return Object.assign(Object.create(null), value && typeof value === 'object' && !Array.isArray(value) ? value : {}); }
function agreeCloudStorage() { getApp().globalData.materialStorageConsent = true; }
async function ensureCloudStorageConsent(guard) {
  guard();
  if (getApp().globalData.materialStorageConsent) return;
  const response = await new Promise((resolve) => wx.showModal({
    title: '保存资料到你的云端？',
    content: '本次使用期间导入的资料文字、后续分析和任务将保存在腾讯云的你的账号下，方便以后继续使用；可在资料库删除。不会读取整个群聊。发送给AI服务商时会另外征求同意。',
    confirmText: '同意保存', success: resolve, fail: () => resolve({ confirm: false })
  }));
  if (!response.confirm) throw new Error('尚未同意云端保存，内容仍在当前页面；可稍后点击保存');
  guard();
  agreeCloudStorage();
}
function list(options = {}) { return cachedRead('materials', 'list', readList, options); }
async function readList() {
  if (await mode() === 'cloud') { await capability(); return (await callFunction('dataService', { action: 'material.list' })).data; }
  return Object.values(locals()).filter(w => !w._deleted).map((w) => ({ id: w.id, title: w.title, revision: w.revision, updatedAt: w.updatedAt, sourceCount: w.sources.length, taskCount: w.tasks.length })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function get(id) {
  if (await mode() === 'cloud') return (await callFunction('dataService', { action: 'material.get', payload: { id } })).data;
  const found = locals()[id]; if (!found || found._deleted) throw new Error('资料已删除'); return found;
}
async function save(input, revision, guard = () => {}) {
  const originalGuard = guard, check = accountGuard(); guard = () => { check(); originalGuard(); };
  invalidateReads('materials');
  try { return await saveWorkspace(input, revision, guard); }
  finally { invalidateReads('materials'); }
}
async function saveWorkspace(input, revision, guard) {
  const workspace = policy.workspace(input);
  if (await mode() === 'cloud') {
    await ensureCloudStorageConsent(guard); guard();
    return (await callFunction('dataService', { action: 'material.save', payload: { workspace, revision } }, { beforeDispatch: guard })).data;
  }
  guard();
  const all = locals();
  if (all[workspace.id]?._deleted || (all[workspace.id]?.revision || 0) !== revision) throw new Error('资料已更新或删除，请重新打开后修改');
  if (!all[workspace.id] && Object.values(all).filter(w => !w._deleted).length >= policy.LIMITS.workspaces) throw new Error('最多保存12份资料，请先删除不用的工作台');
  const next = { ...workspace, revision: revision + 1, updatedAt: new Date().toISOString() };
  all[workspace.id] = next; wx.setStorageSync(scopedKey(LOCAL_KEY), all);
  return { revision: next.revision, updatedAt: next.updatedAt };
}
async function remove(id, revision) {
  invalidateReads('materials');
  try { return await removeWorkspace(id, revision); }
  finally { invalidateReads('materials'); }
}
async function removeWorkspace(id, revision) {
  if (await mode() === 'cloud') return callFunction('dataService', { action: 'material.delete', payload: { id, revision } });
  const all = locals(); if ((all[id]?.revision || 0) !== revision) throw new Error('资料已更新，请刷新');
  if (!all[id]?._deleted) all[id] = { id, revision, _deleted: true };
  wx.setStorageSync(scopedKey(LOCAL_KEY), all);
}
function textSource(name, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > policy.LIMITS.characters) throw new Error('请提供1到40000字的文字');
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push({ id: `c${chunks.length + 1}`, locator: `文字 · 片段${chunks.length + 1}`, text: text.slice(i, i + 2000) });
  return policy.sources([{ id: makeId(), name, kind: 'text', extraction: 'plain', chunks, warnings: [] }])[0];
}
const SENSITIVE_QUERY_NAMES = new Set(['access_token', 'token', 'auth', 'authorization', 'api_key', 'apikey', 'key', 'password', 'passwd', 'secret', 'session', 'sessionid', 'cookie', 'signature', 'sig', 'x-amz-signature', 'x-amz-security-token', 'x-goog-signature', 'key-pair-id', 'policy']);
function normalizeWebUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 1500 || /[\x00-\x20\x7f\\]/.test(value) || !/^https?:\/\//i.test(value)) throw new Error('请粘贴完整的 http 或 https 公开网页地址');
  const match = value.match(/^(https?):\/\/([^/?#]+)([^#]*)?(?:#.*)?$/i);
  if (!match || match[2].includes('@')) throw new Error('网页地址不能包含账号或密码');
  const authority = match[2];
  const hostname = authority.replace(/^\[|\](?::\d+)?$/g, '').replace(/:\d+$/, '');
  const port = (authority.match(/:(\d+)$/) || [])[1];
  if (!hostname || /^(?:localhost|[^.]+\.local)$/i.test(hostname) || (port && !((match[1].toLowerCase() === 'http' && port === '80') || (match[1].toLowerCase() === 'https' && port === '443')))) throw new Error('请使用标准端口的公网网页地址');
  const query = (match[3] || '').split('?')[1] || '';
  for (const pair of query.split('&')) {
    if (!pair) continue;
    let name;
    try { name = decodeURIComponent(pair.split('=')[0].replace(/\+/g, ' ')).toLowerCase(); } catch (_) { throw new Error('网页地址格式不正确'); }
    if (SENSITIVE_QUERY_NAMES.has(name)) throw new Error('链接含登录或密钥参数，请改用不含敏感参数的公开地址');
  }
  return `${match[1].toLowerCase()}://${authority}${match[3] || ''}`;
}
function webMeta(material) {
  const path = material && (material.path || material.url);
  if (!material || String(material.type || '').toLowerCase() !== 'text/html' || !/^https?:\/\//i.test(String(path || ''))) return null;
  return { url: normalizeWebUrl(path) };
}
async function importWeb(raw, { guard = () => {}, onProgress = () => {} } = {}) {
  const url = normalizeWebUrl(raw);
  guard();
  if (await mode() !== 'cloud') throw new Error('网页读取需要连接腾讯云；也可以复制网页文字后粘贴');
  const proxy = await callFunction('deepseekProxy', { action: 'capabilities' });
  if (proxy?.data?.materialsProtocol !== 'materials-v1' || proxy.data.webMaterials !== true) throw new Error('云端网页读取服务尚未更新；可以先粘贴网页文字');
  guard(); onProgress('读取公开网页');
  const value = (await callFunction('deepseekProxy', { action: 'materialWebExtract', payload: { url } }, { timeout: 18000, beforeDispatch: guard })).data;
  guard();
  const source = policy.sources([{ id: makeId(), name: value.title || value.domain, kind: 'web', domain: value.domain, extraction: value.extraction, chunks: value.chunks, warnings: value.warnings }])[0];
  return { source, cleanupWarning: '' };
}
function localPath(path) {
  return typeof path === 'string' && path.length < 1500 && !/[\x00-\x1f\\]/.test(path) && !/(?:^|\/)\.\.(?:\/|$)/.test(path) && /^(?:wxfile:\/\/|file:\/\/|https?:\/\/tmp\/|\/)/.test(path);
}
function fileMeta(file) {
  const path = file.path || file.tempFilePath;
  if (!localPath(path)) throw new Error('只支持微信选中的本地资料，不读取网页地址');
  const name = String(file.name || path.split('/').pop() || '').slice(0, 100);
  const kind = policy.fileKind(name);
  return { path, name, kind };
}
function fsCall(method, args) { return new Promise((resolve, reject) => wx.getFileSystemManager()[method]({ ...args, success: resolve, fail: () => reject(new Error('本地文件不可读，请重新选择')) })); }
async function importFile(file, { consent = false, guard = () => {}, onProgress = () => {} } = {}) {
  const meta = fileMeta(file);
  const info = await fsCall('getFileInfo', { filePath: meta.path });
  if (!info.size || info.size > policy.LIMITS.fileBytes) throw new Error('文件为空或超过8MB');
  guard();
  if (meta.kind === 'text') {
    const result = await fsCall('readFile', { filePath: meta.path, encoding: 'utf8' });
    if (result.data.includes('\uFFFD') || result.data.includes('\0')) throw new Error('文字文件请另存为UTF-8编码');
    return { source: textSource(meta.name, result.data), cleanupWarning: '' };
  }
  if (!consent) throw new Error('请先确认允许上传资料');
  if (await mode() !== 'cloud') throw new Error('文件解析和图片识别需要连接云端；可先粘贴文字');
  const ready = await capability();
  const proxy = await callFunction('deepseekProxy', { action: 'capabilities' });
  if (!ready.storageConfigured || proxy?.data?.materialsProtocol !== 'materials-v1' || !proxy.data.materialStorageConfigured) throw new Error('云端资料上传服务尚未配置；可先粘贴文字分析');
  if (meta.kind === 'image') await ai.ensureConsent('materials-photo');
  const revision = getApp().globalData.aiConfigRevision;
  guard();
  let uploaded, registered = false, source, originalError, cleanupWarning = '';
  try {
    onProgress('上传资料');
    uploaded = await media.uploadFile(meta.path, 'material', meta.name);
    await callFunction('dataService', { action: 'material.register', payload: { fileID: uploaded.fileID, size: info.size } });
    registered = true; guard();
    if (meta.kind === 'image' && revision !== getApp().globalData.aiConfigRevision) throw new Error('AI 设置已改变，请重新导入图片');
    onProgress(meta.kind === 'image' ? '识别图片文字' : '读取文档文字');
    const value = meta.kind === 'image' ? await ai.readMaterialImage(uploaded.fileID)
      : (await callFunction('deepseekProxy', { action: 'materialExtract', payload: { fileID: uploaded.fileID } }, { timeout: 35000 })).data;
    guard();
    source = policy.sources([{ id: makeId(), name: meta.name, kind: meta.kind, ...value }])[0];
  } catch (error) { originalError = error; }
  finally {
    if (uploaded) {
      try {
        const result = registered ? (await callFunction('dataService', { action: 'media.cleanup', payload: { fileIDs: [uploaded.fileID] } })).mediaCleanup
          : await media.deleteCloudFiles([uploaded.fileID]);
        if (!result || result.failed?.length || result.retained?.length) cleanupWarning = '临时云文件清理未完成，请联系开发者检查';
      } catch (_) { cleanupWarning = '临时云文件清理未完成，请联系开发者检查'; }
    }
  }
  if (originalError) throw new Error(`${originalError.message || '导入失败'}${cleanupWarning ? `；${cleanupWarning}` : ''}`);
  return { source, cleanupWarning };
}
module.exports = { makeId, mode, capability, list, get, save, remove, textSource, normalizeWebUrl, webMeta, importWeb, localPath, fileMeta, importFile, agreeCloudStorage };
