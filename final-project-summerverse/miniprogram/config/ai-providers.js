// Public presets only. Never put credentials here. Checked against official docs 2026-09-07.
const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], visionModels: ['deepseek-v4-flash-vision-exp'] },
  { id: 'glm', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4.7-flash', 'glm-5.2'], visionModels: ['glm-4.6v-flash', 'glm-4.6v'] },
  { id: 'kimi', name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', models: ['kimi-k2.6', 'kimi-k2.5'], visionModels: ['kimi-k2.6', 'kimi-k2.5'] },
  { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen-plus', 'qwen-turbo'], visionModels: ['qwen-vl-plus', 'qwen-vl-max'] },
  { id: 'custom', name: '自定义（OpenAI 兼容）', endpoint: '', models: [], visionModels: [] }
];
function providerFor(id) { return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]; }
function defaults(id) {
  const p = providerFor(id);
  return { provider: p.id, endpoint: p.endpoint, model: p.models[0] || '', visionModel: p.visionModels[0] || '' };
}
module.exports = { PROVIDERS, providerFor, defaults };
