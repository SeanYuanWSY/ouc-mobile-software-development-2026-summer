const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PROVIDERS, requestBody } = require('../cloudfunctions/deepseekProxy/providers');
const { configFromEvent } = require('../cloudfunctions/deepseekProxy/config-policy');
const { normalizeEndpoint, isPublicAddress, resolvePublic, postJson } = require('../cloudfunctions/deepseekProxy/safe-http');
const preferences = require('../miniprogram/services/ai-preferences');

test('前后端模型目录一致，预设接口不可被客户端覆盖', () => {
  for (const p of require('../miniprogram/config/ai-providers').PROVIDERS.filter((p) => p.id !== 'custom')) {
    assert.deepEqual(PROVIDERS[p.id], { endpoint: p.endpoint, models: p.models, visionModels: p.visionModels });
    const c = configFromEvent({ config: { provider: p.id, endpoint: 'https://example.com', apiKeyOverride: 'test-only-user-key' } });
    assert.equal(c.endpoint, p.endpoint);
    assert.equal(c.visionModel, p.visionModels[0]);
  }
});
test('自定义地址只接受公网 HTTPS 形式，不接受凭据、参数和内网地址', async () => {
  for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=x', 'https://example.com#x', 'https://127.0.0.1', 'https://[::1]', 'https://example.com:8443', 'https://example.com/%0a']) {
    assert.throws(() => normalizeEndpoint(value), { code: 'AI_ENDPOINT_INVALID' });
  }
  assert.equal(normalizeEndpoint('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
  for (const address of ['127.0.0.1', '10.0.0.1', '100.100.100.200', '169.254.169.254', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2001:2::1', '2001:0010::1', '2001:0db8::1']) assert.equal(isPublicAddress(address), false, address);
  await assert.rejects(resolvePublic('example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]), { code: 'AI_ENDPOINT_INVALID' });
});
test('网络连接固定到已检查 IP，并拒绝重定向且不重试', async () => {
  let calls = 0;
  await assert.rejects(postJson('https://example.com/v1', 'test-only-user-key', {}, 100, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    request(url, options, callback) {
      calls++;
      assert.equal(options.servername, 'example.com');
      assert.equal(options.rejectUnauthorized, true);
      options.lookup('example.com', {}, (error, address) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); });
      const req = new EventEmitter();
      req.destroy = (e) => req.emit('error', e);
      req.end = () => { const res = new EventEmitter(); res.statusCode = 302; res.resume = () => {}; callback(res); };
      return req;
    }
  }), { code: 'AI_ENDPOINT_INVALID' });
  assert.equal(calls, 1);
});
test('模型请求使用服务商对应参数，自定义接口不夹带专有字段', () => {
  assert.equal(requestBody({ provider: 'kimi', model: 'kimi-k2.6' }, []).temperature, 0.6);
  assert.equal(requestBody({ provider: 'qwen', model: 'qwen-plus' }, []).enable_thinking, false);
  const custom = requestBody({ provider: 'custom', model: 'user-model' }, [], { json: true });
  assert.equal(custom.thinking, undefined);
  assert.equal(custom.response_format, undefined);
});
test('本机设置只持久化白名单字段，绝不把 Key 或授权状态存下来', () => {
  let stored;
  global.wx = { setStorageSync: (_, value) => { stored = value; }, getStorageSync: () => stored };
  try {
    preferences.save({ provider: 'kimi', apiKeyOverride: 'test-only-user-key', aiConsent: true });
    assert.deepEqual(Object.keys(stored).sort(), ['endpoint', 'model', 'provider', 'visionModel']);
    assert.equal(preferences.load().provider, 'kimi');
    assert.equal(JSON.stringify(stored).includes('test-only-user-key'), false);
    for (const endpoint of ['https://example.com?api_key=test-only-user-key', 'https://test-only-user-key@example.com']) {
      assert.equal(preferences.save({ provider: 'custom', endpoint }), false);
      assert.equal(preferences.normalize({ provider: 'custom', endpoint }).endpoint, '');
      assert.equal(JSON.stringify(stored).includes('test-only-user-key'), false);
    }
  } finally { delete global.wx; }
});
