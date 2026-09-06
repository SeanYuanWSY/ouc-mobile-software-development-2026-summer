const PUBLIC_ERRORS = {
  401: { code: 'AI_AUTH_FAILED', message: 'DeepSeek 身份验证失败，请检查你填写的 API Key。' },
  402: { code: 'AI_BALANCE_INSUFFICIENT', message: 'DeepSeek 账户额度不可用。' },
  429: { code: 'AI_UPSTREAM_RATE_LIMITED', message: 'DeepSeek 请求较多，请稍后再试。' },
  500: { code: 'AI_UPSTREAM_UNAVAILABLE', message: 'DeepSeek 服务暂时不可用。' },
  503: { code: 'AI_UPSTREAM_UNAVAILABLE', message: 'DeepSeek 服务暂时不可用。' }
};
const SAFE_CODES = new Set([
  'AI_AUTH_FAILED', 'AI_BALANCE_INSUFFICIENT', 'AI_UPSTREAM_RATE_LIMITED',
  'AI_UPSTREAM_UNAVAILABLE', 'AI_TIMEOUT', 'AI_KEY_MISSING',
  'AI_QUOTA_UNAVAILABLE', 'BAD_REQUEST', 'AI_QUOTA_CONFIG_INVALID', 'AI_RATE_LIMITED', 'MEDIA_NOT_OWNED'
]);

function publicErrorForStatus(status, internalMessage = '') {
  const publicInfo = PUBLIC_ERRORS[status] || {
    code: 'AI_UPSTREAM_UNAVAILABLE',
    message: 'DeepSeek 调用暂时失败，请稍后再试。'
  };
  const error = new Error(publicInfo.message);
  error.code = publicInfo.code;
  error.upstreamStatus = status;
  error.internalMessage = internalMessage;
  return error;
}

function publicError(error = {}) {
  if (SAFE_CODES.has(error.code)) return error;
  const timeout = error.name === 'AbortError' || /timeout|超时/i.test(String(error.message || ''));
  const safe = new Error(timeout ? 'DeepSeek 响应超时，请稍后再试。' : 'DeepSeek 调用暂时失败，请稍后再试。');
  safe.code = timeout ? 'AI_TIMEOUT' : 'AI_UPSTREAM_UNAVAILABLE';
  safe.internalMessage = error.message || String(error);
  return safe;
}

module.exports = { publicErrorForStatus, publicError };
