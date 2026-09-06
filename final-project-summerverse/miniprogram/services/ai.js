const { callFunction, waitForCloudReady } = require('./cloud');
const { realMemories, isRealMemory } = require('../utils/memory-source');
const { normalizeMemoryDraft, normalizeParallel, normalizeInsight } = require('../utils/ai-output');

function aiError(code, message) { return Object.assign(new Error(message), { code }); }

async function ensureConsent(kind = 'text') {
  const app = getApp();
  if (!app.globalData.aiSessionKey) throw aiError('AI_KEY_MISSING', '请先在设置中填写你自己的 DeepSeek API Key。基础记录功能无需 Key。');
  if (!(await waitForCloudReady())) throw aiError('AI_CLOUD_UNAVAILABLE', 'AI 服务暂未连接，请稍后重试；基础记录仍可使用。');
  const revision = app.globalData.aiConfigRevision;
  const consent = app.globalData.aiConsent || {};
  if (consent[kind]) return;
  const result = await new Promise((resolve, reject) => wx.showModal({
    title: kind === 'photo' ? '允许 AI 分析这张照片？' : '使用你的 DeepSeek 账户？',
    content: kind === 'photo'
      ? '所选照片将上传腾讯云，并连同补充文字发送给 DeepSeek 分析；这会从你填写的 Key 所属 API 账户扣费。应用不主动保存或记录 Key。本次运行后续点击 AI 看图也会按此处理。'
      : '点击 AI 功能时，相关记忆文字、日期、心情与地点名称将经腾讯云函数发送给 DeepSeek；连接测试也会产生 API 费用，由你填写的 Key 所属账户承担。应用不主动保存或记录 Key。本次运行内有效，可在设置中清除。',
    confirmText: '同意使用', success: resolve, fail: reject
  }));
  if (!result.confirm) throw aiError('AI_CANCELLED', '已取消，未请求 DeepSeek。');
  if (revision !== app.globalData.aiConfigRevision) throw aiError('AI_CONFIG_CHANGED', 'AI 设置已更改，请重新操作。');
  app.globalData.aiConsent = { ...consent, [kind]: true };
}

async function invoke(action, payload = {}, options = {}) {
  await ensureConsent(action === 'visionMemory' ? 'photo' : 'text');
  const app = getApp();
  const revision = app.globalData.aiConfigRevision;
  try {
    const res = await callFunction('deepseekProxy', {
      action, payload,
      config: { model: app.globalData.aiModel || 'deepseek-v4-flash', apiKeyOverride: app.globalData.aiSessionKey }
    }, { timeout: options.timeout || 60000 });
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
module.exports = { ping, parseMemory, chat, timePhone, parallel, director, insight, analyzePhoto, ensureConsent };
