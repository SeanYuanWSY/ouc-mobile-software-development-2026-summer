// Deployed with the cloud function; checked against the client catalog in tests.
const PROVIDERS = {
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], visionModels: ['deepseek-v4-flash-vision-exp'] },
  glm: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4.7-flash', 'glm-5.2'], visionModels: ['glm-4.6v-flash', 'glm-4.6v'] },
  kimi: { endpoint: 'https://api.moonshot.cn/v1/chat/completions', models: ['kimi-k2.6', 'kimi-k2.5'], visionModels: ['kimi-k2.6', 'kimi-k2.5'] },
  qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen-plus', 'qwen-turbo'], visionModels: ['qwen-vl-plus', 'qwen-vl-max'] }
};
function requestBody(config, messages, options = {}) {
  const body = { model: options.model || config.model, messages, stream: false, max_tokens: options.maxTokens || 1800 };
  if (['deepseek', 'glm', 'kimi'].includes(config.provider)) body.thinking = { type: 'disabled' };
  if (config.provider === 'qwen' && !body.model.includes('vl')) body.enable_thinking = false;
  if (config.provider === 'kimi') body.temperature = 0.6;
  else if (config.provider !== 'custom') body.temperature = options.temperature ?? 0.65;
  // Custom endpoints vary: rely on the explicit JSON prompt, avoiding unsupported extensions.
  if (options.json && config.provider !== 'custom') body.response_format = { type: 'json_object' };
  return body;
}
module.exports = { PROVIDERS, requestBody };
