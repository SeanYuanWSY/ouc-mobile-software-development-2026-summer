const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
function configFromEvent(event = {}) {
  const client = event.config || {};
  const apiKey = typeof client.apiKeyOverride === 'string' ? client.apiKeyOverride.trim() : '';
  if (!apiKey || apiKey.length > 300 || /\s/.test(apiKey)) {
    throw Object.assign(new Error('请在设置中填写你自己的有效 DeepSeek API Key。'), { code: 'AI_KEY_MISSING' });
  }
  return { apiKey, model: MODELS.has(client.model) ? client.model : 'deepseek-v4-flash', source: 'byok-session', visionModel: 'deepseek-v4-flash-vision-exp' };
}
module.exports = { configFromEvent, DEEPSEEK_URL };
