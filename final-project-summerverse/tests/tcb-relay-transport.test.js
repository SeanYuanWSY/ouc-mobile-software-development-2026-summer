const test = require('node:test');
const assert = require('node:assert/strict');
const { transport, cloudBaseAuthorization, cloudBaseTransport } = require('../integrations/mcp/server.cjs');

// 向量来自 CloudBase Open API 官方文档示例：固定密钥与时间戳必须复现文档给出的签名。
test('CloudBase Open API 签名与官方示例向量一致', () => {
  const authorization = cloudBaseAuthorization('AKIDDo-bNhLNl3kEY5HRzEG-CNUotmyFSadvpKimESWTfND98qyfrpYLCtQJ92_z9yN8', 'wH72j2a5ZzhwgnXViwVNqdWhWn4AG4iasv26D4JdjBA=', 1600227242);
  assert.equal(authorization, '1.0 TC3-HMAC-SHA256 Credential=AKIDDo-bNhLNl3kEY5HRzEG-CNUotmyFSadvpKimESWTfND98qyfrpYLCtQJ92_z9yN8/2020-09-16/tcb/tc3_request, SignedHeaders=content-type;host, Signature=0ce229810e251baa0ee2bb786c5f9eb6cb7758f55df28cbc161883c48a997e04');
});

test('无网关地址时使用 Open API 模式，配置不全明确拒绝', () => {
  const token = 'a'.repeat(64);
  assert.equal(typeof transport({ SUMMERVERSE_ENV: 'cloudbase-test', TCB_SECRET_ID: 'AKID' + 'x'.repeat(20), TCB_SECRET_KEY: 'k'.repeat(36), SUMMERVERSE_TOKEN: token }), 'function');
  assert.throws(() => transport({ SUMMERVERSE_ENV: 'cloudbase-test', TCB_SECRET_ID: 'AKIDxxxxxxxxxxxxxxxxxxxx', TCB_SECRET_KEY: 'k'.repeat(36) }), /Invalid token/);
  assert.throws(() => transport({ TCB_SECRET_ID: 'AKIDxxxxxxxxxxxxxxxxxxxx', TCB_SECRET_KEY: 'k'.repeat(36), SUMMERVERSE_TOKEN: token }), /Invalid env id/);
  assert.throws(() => transport({ SUMMERVERSE_ENV: 'cloudbase-test', SUMMERVERSE_TOKEN: token }), /Invalid secret id/);
});

test('Open API 传输按网关信封调用并解包响应', async () => {
  const token = 'b'.repeat(64);
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const service = { ok: true, data: { drafts: [] } };
    const envelope = { statusCode: 200, headers: {}, body: JSON.stringify(service) };
    const outer = { requestId: 'fixture', stat: { funcExecTime: 1 }, data: { response_data: JSON.stringify(envelope) } };
    return { body: (async function* () { yield Buffer.from(JSON.stringify(outer)); })() };
  };
  const send = cloudBaseTransport({ envId: 'cloudbase-d5gdro8i30f1a4efd', secretId: 'AKID' + 'x'.repeat(20), secretKey: 'k'.repeat(36), token, fetchImpl });
  const result = await send({ action: 'draft.status', requestId: 'r1' });
  assert.deepEqual(result, { ok: true, data: { drafts: [] } });
  const { url, options } = requests[0];
  assert.equal(url, 'https://tcb-api.tencentcloudapi.com/api/v2/envs/cloudbase-d5gdro8i30f1a4efd/functions/assistantGateway:invoke');
  assert.match(options.headers['X-CloudBase-Authorization'], /^1\.0 TC3-HMAC-SHA256 Credential=AKIDx{20}\/\d{4}-\d{2}-\d{2}\/tcb\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/);
  assert.equal(options.headers['X-CloudBase-SessionToken'], undefined);
  assert.equal(typeof options.headers['X-CloudBase-TimeStamp'], 'number');
  const payload = JSON.parse(options.body);
  assert.equal(payload.data.httpMethod, 'POST');
  assert.equal(payload.data.headers.authorization, 'Bearer ' + token);
  assert.match(payload.data.headers['content-type'], /^application\/json/);
  assert.equal(JSON.parse(payload.data.body).action, 'draft.status');
  assert.ok(Buffer.byteLength(payload.data.body) <= 16384);
});

test('临时密钥带会话令牌；业务错误码按网关状态透传', async () => {
  const token = 'c'.repeat(64);
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push(options);
    const envelope = { statusCode: 401, body: JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }) };
    const outer = { data: { response_data: JSON.stringify(envelope) } };
    return { body: (async function* () { yield Buffer.from(JSON.stringify(outer)); })() };
  };
  const send = cloudBaseTransport({ envId: 'cloudbase-test', secretId: 'AKID' + 'x'.repeat(20), secretKey: 'k'.repeat(36), sessionToken: 'session-fixture', token, fetchImpl });
  assert.deepEqual(await send({ action: 'draft.status', requestId: 'r2' }), { ok: false, code: 'UNAUTHORIZED' });
  assert.equal(requests[0].headers['X-CloudBase-SessionToken'], 'session-fixture');
});

test('Open API 外层失败或畸形响应不伪装成业务结果', async () => {
  const token = 'd'.repeat(64);
  const make = (outer) => async () => ({ body: (async function* () { yield Buffer.from(JSON.stringify(outer)); })() });
  const base = { envId: 'cloudbase-test', secretId: 'AKID' + 'x'.repeat(20), secretKey: 'k'.repeat(36), token };
  await assert.rejects(cloudBaseTransport({ ...base, fetchImpl: make({ code: 'SIGN_PARAM_INVALID', message: 'no auth' }) })({ action: 'draft.status', requestId: 'r3' }), /CloudBase API: SIGN_PARAM_INVALID/);
  await assert.rejects(cloudBaseTransport({ ...base, fetchImpl: make({ data: {} }) })({ action: 'draft.status', requestId: 'r4' }), /Invalid response/);
  await assert.rejects(cloudBaseTransport({ ...base, fetchImpl: make({ data: { response_data: '{"statusCode":200,"body":"not-json"}' } }) })({ action: 'draft.status', requestId: 'r5' }), SyntaxError);
  await assert.rejects(cloudBaseTransport({ ...base, fetchImpl: async () => ({ body: (async function* () { yield Buffer.alloc(262145); })() }) })({ action: 'draft.status', requestId: 'r6' }), /Response too large/);
  await assert.rejects(cloudBaseTransport(base)({ action: 'draft.status', requestId: 'r7' + 'x'.repeat(16400) }), /Too large/);
});
