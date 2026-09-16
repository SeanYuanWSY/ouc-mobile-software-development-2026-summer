const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject, restoreEnv } = require('./helpers/subject-load');
const policy = require('../miniprogram/utils/material-policy');

function client(capability) {
  const calls = [];
  const app = { globalData: { aiProvider: 'glm', aiModel: 'glm-4.7-flash', aiSessionKey: 'fixture-key-not-a-secret', aiConfigRevision: 0, aiConsent: { materials: true } } };
  prepareSubject({
    subject: '../miniprogram/services/ai',
    mocks: [{ spec: './cloud', value: {
      waitForCloudReady: async () => true,
      callFunction: async (name, data, options) => {
        options?.beforeDispatch?.();
        calls.push(structuredClone(data));
        return { data: data.action === 'capabilities' ? capability : { mode: data.payload.mode } };
      }
    } }],
    globals: { getApp: () => app },
  });
  return { ai: require('../miniprogram/services/ai'), calls, app };
}
const base = { protocol: 'multi-provider-v1', materialsProtocol: 'materials-v1' };

test('旧云端或畸形能力声明不会收到新模式的资料与Key，也不调用模型', async () => {
  for (const materialModes of [undefined, null, 'plan,defense', {}, [], ['requirements']]) {
    for (const mode of ['plan', 'defense']) {
      const f = client({ ...base, materialModes });
      await assert.rejects(f.ai.analyzeMaterials([{ name: 'fixture-private-source' }], mode), { code: 'AI_BACKEND_OUTDATED' });
      assert.equal(f.calls.length, 1);
      assert.equal(JSON.stringify(f.calls), '[{"action":"capabilities"}]');
      assert.equal(f.app.globalData.aiReady, false);
    }
  }
});

test('新模式仅在明确声明支持时发送一次业务请求，旧五种模式兼容旧能力格式', async () => {
  for (const mode of ['requirements', 'compare', 'ask', 'checklist', 'minutes', 'plan', 'defense']) {
    const f = client(['plan', 'defense'].includes(mode) ? { ...base, materialModes: [mode] } : base);
    assert.equal((await f.ai.analyzeMaterials([], mode)).mode, mode);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].action, 'materialsAnalyze');
    assert.equal(f.calls[1].payload.mode, mode);
  }
  const limited = client({ ...base, materialModes: ['plan'] });
  await assert.rejects(limited.ai.analyzeMaterials([], 'defense'), { code: 'AI_BACKEND_OUTDATED' });
  assert.equal(limited.calls.length, 1);
});

test('云函数从实际资料契约声明模式，能力探测不走Key或计费路径', async () => {
  let owner = 'fixture-owner';
  const forbidden = () => { throw Error('能力探测不应访问计费、凭据或业务数据库'); };
  prepareSubject({
    subject: '../cloudfunctions/deepseekProxy/index',
    mocks: [
      { spec: 'wx-server-sdk', value: { init() {}, database: () => ({ collection: forbidden }), getWXContext: () => ({ OPENID: owner }) } },
      { spec: './quota', value: { reserveAiQuota: forbidden, reserveAiMinute: forbidden } },
      { spec: './config-policy', value: { configFromEvent: forbidden } },
      { spec: './safe-http', value: { postJson: forbidden } },
    ],
    globals: {},
    env: {},
  });
  const gateway = require('../cloudfunctions/deepseekProxy/index');
  const result = await gateway.main({ action: 'capabilities' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.materialModes, policy.MODES);
  assert.equal(result.data.materialsProtocol, 'materials-v1');
  owner = '';
  assert.equal((await gateway.main({ action: 'capabilities' })).code, 'NO_OPENID');
  restoreEnv();
});
