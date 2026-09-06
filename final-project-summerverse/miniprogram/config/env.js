/**
 * 非敏感运行配置。
 * 这里绝不放 DeepSeek API Key；每位用户在设置页输入自己的会话 Key，不提供共享 Key。
 */
module.exports = {
  CLOUD_ENV_ID: '',
  ENABLE_CLOUD: true,
  DEFAULT_AI_PROVIDER: 'deepseek',
  DEFAULT_AI_MODEL: 'deepseek-v4-flash',
  DEFAULT_VISION_MODEL: 'deepseek-v4-flash-vision-exp',
  DEMO_DATE: '2026-08-24',
  ISLAND_STAGE_THRESHOLDS: [1, 18, 60]
};
