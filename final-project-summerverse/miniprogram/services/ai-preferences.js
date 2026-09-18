const { scopedKey } = require('../utils/account-scope');
const { defaults, providerFor } = require('../config/ai-providers');
const STORAGE = 'summerverse.ai.preferences.v1';
function safeDraftEndpoint(value) {
  return typeof value === 'string' && !/[@?#\s\x00-\x1f\x7f\\%]/.test(value);
}
function normalize(input = {}) {
  const base = defaults(input.provider);
  const p = providerFor(base.provider);
  if (p.id === 'custom') return { ...base,
    endpoint: safeDraftEndpoint(input.endpoint) ? input.endpoint.slice(0, 500) : '',
    model: typeof input.model === 'string' ? input.model.trim().slice(0, 120) : '',
    visionModel: typeof input.visionModel === 'string' ? input.visionModel.trim().slice(0, 120) : '' };
  return { ...base, model: p.models.includes(input.model) ? input.model : base.model,
    visionModel: p.visionModels.includes(input.visionModel) ? input.visionModel : base.visionModel };
}
function load() {
  try { return normalize(wx.getStorageSync(scopedKey(STORAGE)) || {}); } catch (_) { return defaults('deepseek'); }
}
function save(input) {
  if (input.provider === 'custom' && !safeDraftEndpoint(input.endpoint || '')) return false;
  const safe = normalize(input);
  try { wx.setStorageSync(scopedKey(STORAGE), safe); return true; } catch (_) { return false; }
}
// This runs in the Mini Program (no Node URL API). Cloud validates again before connecting.
function receiver(config) {
  if (config.provider !== 'custom') return providerFor(config.provider).endpoint;
  const raw = String(config.endpoint || '').trim();
  if (raw.length > 500 || !/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::443)?(?:\/[A-Za-z0-9._~/-]*)?$/i.test(raw)) {
    throw Object.assign(new Error('请填写公网 HTTPS 接口地址，不要在地址中填写 Key 或参数。'), { code: 'AI_ENDPOINT_INVALID' });
  }
  const clean = raw.replace(/:443(?=\/|$)/, '').replace(/\/+$/, '');
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`;
}
module.exports = { normalize, load, save, receiver };
