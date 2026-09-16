const { PROVIDERS } = require('./providers');
const { normalizeEndpoint } = require('./safe-http');
const DEEPSEEK_URL = PROVIDERS.deepseek.endpoint;
function modelId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value)) {
    throw Object.assign(new Error('请填写正确的模型 ID。'), { code: 'BAD_REQUEST' });
  }
  return value;
}
function configFromEvent(event = {}) {
  const client = event.config || {};
  const apiKey = typeof client.apiKeyOverride === 'string' ? client.apiKeyOverride.trim() : '';
  if (!apiKey || apiKey.length > 300 || /[\s\x00-\x1f\x7f]/.test(apiKey)) {
    throw Object.assign(new Error('请在设置中填写你自己的 API Key。'), { code: 'AI_KEY_MISSING' });
  }
  const provider = client.provider || 'deepseek';
  if (provider === 'custom') return {
    provider, apiKey, endpoint: normalizeEndpoint(client.endpoint), model: modelId(client.model),
    visionModel: client.visionModel ? modelId(client.visionModel) : '', source: 'byok-session'
  };
  const preset = PROVIDERS[provider];
  if (!Object.hasOwn(PROVIDERS, provider)) throw Object.assign(new Error('不支持此服务商。'), { code: 'BAD_REQUEST' });
  return { provider, apiKey, endpoint: preset.endpoint,
    model: preset.models.includes(client.model) ? client.model : preset.models[0],
    visionModel: preset.visionModels.includes(client.visionModel) ? client.visionModel : preset.visionModels[0], source: 'byok-session' };
}
module.exports = { configFromEvent, DEEPSEEK_URL };
