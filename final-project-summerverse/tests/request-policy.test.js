const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequestPayload } = require('../cloudfunctions/deepseekProxy/request-policy');

test('AI 空请求在占用额度前被拒绝', () => {
  assert.throws(() => validateRequestPayload('chat', { question: '   ' }), /不能为空/);
  assert.throws(() => validateRequestPayload('parseMemory', {}), /需要整理/);
  assert.throws(() => validateRequestPayload('parallel', { memory: {}, alternative: '' }), /都不能为空/);
  assert.throws(() => validateRequestPayload('director', { memories: [] }), /记忆列表/);
  assert.throws(() => validateRequestPayload('director', { memories: [null] }), /无效项目/);
  assert.throws(() => validateRequestPayload('chat', { question: '你好', memories: [null] }), /无效项目/);
});

test('AI 看图在占用额度前要求云文件 ID', () => {
  assert.throws(() => validateRequestPayload('visionMemory', { fileID: '/tmp/a.jpg' }), /微信云存储/);
  assert.doesNotThrow(() => validateRequestPayload('visionMemory', { fileID: 'cloud://env/path.jpg' }));
});

test('时间电话在占用额度前验证日期和问题', () => {
  assert.throws(() => validateRequestPayload('timePhone', { date: '明天', question: '你好' }), /有效日期/);
  assert.doesNotThrow(() => validateRequestPayload('timePhone', { date: '2026-08-01', question: '你好' }));
});
