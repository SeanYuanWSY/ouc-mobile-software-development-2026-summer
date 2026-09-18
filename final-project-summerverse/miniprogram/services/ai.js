const accountScope = require('../utils/account-scope');
const { callFunction, waitForCloudReady } = require('./cloud');
const { realMemories, isRealMemory } = require('../utils/memory-source');
const { normalizeMemoryDraft, normalizeParallel, normalizeInsight } = require('../utils/ai-output');
const { providerFor } = require('../config/ai-providers');
const { receiver } = require('./ai-preferences');

function aiError(code, message) { return Object.assign(new Error(message), { code }); }

function snapshot() {
  const d = getApp().globalData;
  const provider = d.aiProvider || 'deepseek';
  const config = { provider, model: d.aiModel || providerFor(provider).models[0], visionModel: d.visionModel || providerFor(provider).visionModels[0], endpoint: d.aiEndpoint || '', apiKeyOverride: d.aiSessionKey };
  config.endpoint = receiver(config);
  return { config, credential: d.aiSessionKey ? null : d.aiCredential, account: accountScope.stamp(), revision: d.aiConfigRevision };
}
function assertCurrent(s) {
  if (s.account !== accountScope.stamp()) throw aiError('ACCOUNT_CHANGED', '账号已变化，请重新操作。');
  if (s.revision !== getApp().globalData.aiConfigRevision) throw aiError('AI_CONFIG_CHANGED', 'AI 设置已更改，请重新操作。');
}
async function ensureConsent(kind = 'text', s = snapshot()) {
  const app = getApp();
  if (!s.config.apiKeyOverride && !s.credential) throw aiError('AI_KEY_MISSING', '请先在设置中填写你的 API Key。');
  if (!(await waitForCloudReady())) throw aiError('AI_CLOUD_UNAVAILABLE', 'AI 服务暂未连接，请稍后重试；基础记录仍可使用。');
  assertCurrent(s);
  const consent = app.globalData.aiConsent || {};
  if (consent[kind]) return;
  const isPhoto = kind === 'photo' || kind === 'materials-photo';
  const result = await new Promise((resolve, reject) => wx.showModal({
    title: isPhoto ? '允许 AI 分析照片？' : kind === 'materials' ? '允许 AI 分析这些资料？' : '允许使用 AI？',
    content: kind === 'materials' ? `导入资料的文字和提问将经腾讯云发送至 ${s.config.endpoint}，使用你个人的 Key 并由你的 API 账户付费。请确认你有权上传这些内容。结果是待核对的 AI 草稿。` : isPhoto
      ? `照片和补充文字将上传腾讯云并发送至 ${s.config.endpoint}。对方会收到你的 Key，费用由你的 API 账户承担。仅使用可信服务。本次运行内有效。`
      : `相关文字、日期、心情和地点名称将经腾讯云发送至 ${s.config.endpoint}。对方会收到你的 Key，测试也会产生费用。仅使用可信服务。本次运行内有效。`,
    confirmText: '同意使用', success: resolve, fail: reject
  }));
  if (!result.confirm) throw aiError('AI_CANCELLED', '已取消。');
  assertCurrent(s);
  app.globalData.aiConsent = { ...consent, [kind]: true };
}

async function invoke(action, payload = {}, options = {}) {
  const s = snapshot();
  if (['visionMemory', 'materialVision'].includes(action) && !s.config.visionModel) throw aiError('BAD_REQUEST', '请先在设置中填写识图模型。');
  await ensureConsent(action === 'materialsAnalyze' ? 'materials' : action === 'materialVision' ? 'materials-photo' : action === 'visionMemory' ? 'photo' : 'text', s);
  const app = getApp();
  const revision = s.revision;
  try {
    assertCurrent(s);
    // Probe without any Key or user payload: an old deployed proxy must never receive a different provider's Key.
    const capability = await callFunction('deepseekProxy', { action: 'capabilities' }, {
      beforeDispatch: () => assertCurrent(s)
    });
    if (!capability || !capability.data || capability.data.protocol !== 'multi-provider-v1') {
      throw aiError('AI_BACKEND_OUTDATED', '云端 AI 服务需要更新，请联系开发者。');
    }
    if (['materialsAnalyze', 'materialVision'].includes(action) && capability.data.materialsProtocol !== 'materials-v1') {
      throw aiError('AI_BACKEND_OUTDATED', '云端资料分析服务需要更新，请联系开发者。');
    }
    if (action === 'materialsAnalyze' && ['plan', 'defense'].includes(payload.mode)
      && (!Array.isArray(capability.data.materialModes) || !capability.data.materialModes.includes(payload.mode))) {
      throw aiError('AI_BACKEND_OUTDATED', '云端尚未支持行动拆解与答辩演练，请联系开发者更新后再试；本次未发送资料或调用模型。');
    }
    assertCurrent(s);
    const res = await callFunction('deepseekProxy', {
      action, payload,
      config: s.credential ? { credentialId: s.credential.id, credentialVersion: s.credential.version } : s.config
    }, { timeout: options.timeout || 60000, beforeDispatch: () => assertCurrent(s) });
    if (revision !== app.globalData.aiConfigRevision) throw aiError('AI_CONFIG_CHANGED', 'AI 设置已更改，已忽略旧设置的回复，请重试。');
    app.globalData.aiReady = true;
    return res.data;
  } catch (error) {
    if (revision === app.globalData.aiConfigRevision) app.globalData.aiReady = false;
    throw error;
  }
}

function ping() { return invoke('ping'); }
function parseMemory(text) { return invoke('parseMemory', { text }).then(normalizeMemoryDraft); }
function chat(question, memories) { return invoke('chat', { question, memories: realMemories(memories).slice(0, 30) }); }
function timePhone(date, question, memories) {
  return invoke('timePhone', { date, question, memories: realMemories(memories).filter((item) => item.date <= date).slice(0, 40) });
}
function parallel(memory, alternative) {
  if (!isRealMemory(memory)) return Promise.reject(aiError('BAD_REQUEST', '请选择真实记忆，示例与反思不能用作真实路线。'));
  return invoke('parallel', { memory, alternative }).then(normalizeParallel);
}
function director(memories, theme = '温暖成长') { return invoke('director', { memories: realMemories(memories).slice(0, 60), theme }); }
function insight(memories) { return invoke('insight', { memories: realMemories(memories).slice(0, 80) }).then(normalizeInsight); }
function analyzePhoto(fileID, note = '') { return invoke('visionMemory', { fileID, note }, { timeout: 65000 }).then(normalizeMemoryDraft); }
function analyzeMaterials(sources, mode, question = '') { return invoke('materialsAnalyze', { sources, mode, question }, { timeout: 65000 }); }
function readMaterialImage(fileID) { return invoke('materialVision', { fileID }, { timeout: 80000 }); }
module.exports = { ping, parseMemory, chat, timePhone, parallel, director, insight, analyzePhoto, ensureConsent, analyzeMaterials, readMaterialImage };
