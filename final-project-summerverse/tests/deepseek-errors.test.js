const test = require('node:test');
const assert = require('node:assert/strict');
const { publicErrorForStatus, publicError } = require('../cloudfunctions/deepseekProxy/deepseek-errors');

test('DeepSeek 上游错误只向客户端暴露稳定短提示', () => {
  const auth = publicErrorForStatus(401, 'upstream detail with request id');
  assert.equal(auth.code, 'AI_AUTH_FAILED');
  assert.equal(auth.message, 'DeepSeek 身份验证失败，请检查你填写的 API Key。');
  assert.equal(auth.message.includes('request id'), false);
  assert.equal(auth.internalMessage, 'upstream detail with request id');

  assert.equal(publicErrorForStatus(402).code, 'AI_BALANCE_INSUFFICIENT');
  assert.equal(publicErrorForStatus(429).code, 'AI_UPSTREAM_RATE_LIMITED');
  assert.equal(publicErrorForStatus(503).code, 'AI_UPSTREAM_UNAVAILABLE');
});

test('网络和超时错误转换为可操作的公共错误码', () => {
  const timeout = new Error('request timeout');
  timeout.name = 'AbortError';
  assert.equal(publicError(timeout).code, 'AI_TIMEOUT');
  assert.equal(publicError(new Error('socket details')).code, 'AI_UPSTREAM_UNAVAILABLE');
});


test('额度数据库不可用保持准确错误码', () => {
  const error = Object.assign(new Error('暂时无法校验 AI 使用额度，本次未请求 DeepSeek'), { code: 'AI_QUOTA_UNAVAILABLE' });
  assert.equal(publicError(error).code, 'AI_QUOTA_UNAVAILABLE');
});
