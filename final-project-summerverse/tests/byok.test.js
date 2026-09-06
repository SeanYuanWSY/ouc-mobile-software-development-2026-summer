const test = require('node:test');
const assert = require('node:assert/strict');
const { configFromEvent, DEEPSEEK_URL } = require('../cloudfunctions/deepseekProxy/config-policy');
const { validateRequestPayload } = require('../cloudfunctions/deepseekProxy/request-policy');

test('严格 BYOK 不读取环境 Key 或环境上游地址', () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalUrl = process.env.DEEPSEEK_BASE_URL;
  try {
    process.env.DEEPSEEK_API_KEY = 'test-only-server-key';
    process.env.DEEPSEEK_BASE_URL = 'https://example.invalid';
    assert.throws(() => configFromEvent(), { code: 'AI_KEY_MISSING' });
    const config = configFromEvent({ config: { apiKeyOverride: 'test-only-user-key', baseUrl: 'https://example.invalid', model: 'unknown' } });
    assert.equal(config.apiKey, 'test-only-user-key');
    assert.equal(config.source, 'byok-session');
    assert.equal(config.model, 'deepseek-v4-flash');
    assert.equal(DEEPSEEK_URL, 'https://api.deepseek.com/chat/completions');
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.DEEPSEEK_BASE_URL; else process.env.DEEPSEEK_BASE_URL = originalUrl;
  }
});

test('Key 拒绝非字符串、空白和过长输入', () => {
  for (const apiKeyOverride of [{}, ' ', 'key\nheader', 'x'.repeat(301)]) {
    assert.throws(() => configFromEvent({ config: { apiKeyOverride } }), { code: 'AI_KEY_MISSING' });
  }
});

test('服务端拒绝把示例或反思作为 AI 事实证据', () => {
  for (const source of ['reflection', 'demo', 'unknown']) {
    assert.throws(() => validateRequestPayload('chat', { question: '总结', memories: [{ title: '条目', source }] }), { code: 'BAD_REQUEST' });
    assert.throws(() => validateRequestPayload('parallel', { alternative: '选择', memory: { title: '条目', source } }), { code: 'BAD_REQUEST' });
  }
});

function aiHarness({ key = 'test-only-user-key', ready = true, confirm = true, result, error } = {}) {
  const calls = [];
  const app = { globalData: { aiSessionKey: key, aiModel: 'deepseek-v4-flash', aiReady: false, aiConfigRevision: 0, aiConsent: {} }, awaitCloudReady: async () => ready };
  global.getApp = () => app;
  global.wx = {
    showModal: ({ success }) => success({ confirm }),
    cloud: { callFunction: (args) => { calls.push(args); if (error) args.fail(error); else args.success({ result: result || { ok: true, data: '真实上游回复' } }); } }
  };
  delete require.cache[require.resolve('../miniprogram/services/ai')];
  return { ai: require('../miniprogram/services/ai'), app, calls };
}
test.afterEach(() => { delete global.wx; delete global.getApp; });

test('缺少 Key、云离线或取消同意都不会发送 AI 请求或生成假回复', async () => {
  for (const options of [{ key: '' }, { ready: false }, { confirm: false }]) {
    const { ai, app, calls } = aiHarness(options);
    await assert.rejects(() => ai.chat('你好', []));
    assert.equal(calls.length, 0);
    assert.equal(app.globalData.aiReady, false);
  }
});

test('真实上游成功后才设置连接状态，并过滤生成证据与未来记录', async () => {
  const { ai, app, calls } = aiHarness();
  assert.equal(await ai.timePhone('2026-07-01', '你好', [
    { source: 'manual', date: '2026-06-30', title: '过去' },
    { source: 'reflection', date: '2026-06-30', title: '反思' },
    { source: 'manual', date: '2026-07-02', title: '未来' }
  ]), '真实上游回复');
  assert.deepEqual(calls[0].data.payload.memories.map((item) => item.title), ['过去']);
  assert.equal(app.globalData.aiReady, true);
});

test('上游失败不返回本地模板且清除连接状态', async () => {
  const error = Object.assign(new Error('用户余额不足'), { code: 'AI_BALANCE_INSUFFICIENT' });
  const { ai, app } = aiHarness({ error });
  app.globalData.aiReady = true;
  await assert.rejects(() => ai.chat('你好', []), { code: 'AI_BALANCE_INSUFFICIENT' });
  assert.equal(app.globalData.aiReady, false);
});

test('旧 Key 的异步结果不能更新新 Key 的连接状态', async () => {
  const { ai, app, calls } = aiHarness();
  global.wx.cloud.callFunction = (args) => {
    calls.push(args);
    app.globalData.aiConfigRevision += 1;
    args.success({ result: { ok: true, data: '旧结果' } });
  };
  await assert.rejects(() => ai.ping(), { code: 'AI_CONFIG_CHANGED' });
  assert.equal(app.globalData.aiReady, false);
});
