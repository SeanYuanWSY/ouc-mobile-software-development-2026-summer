const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const policy = require('../miniprogram/utils/material-policy');
const { analyze, validate } = require('../cloudfunctions/deepseekProxy/material-ai');
const source = { id: 's1', name: '老师通知', kind: 'text', extraction: 'plain', chunks: [{ id: 'c1', locator: '文字', text: '请在周五18点前提交报告。' }], warnings: [] };
const ref = { sourceId: 's1', chunkId: 'c1', quote: '周五18点前提交报告' };
const item = { kind: 'task', title: '提交报告', detail: '核对要求后上传', evidence: [ref] };
test('资料校验规则与云端部署副本保持一致', () => {
  const canonical = fs.readFileSync(require.resolve('../miniprogram/utils/material-policy'), 'utf8');
  for (const folder of ['dataService', 'deepseekProxy']) assert.equal(fs.readFileSync(require.resolve(`../cloudfunctions/${folder}/material-policy`), 'utf8'), canonical);
  assert.equal(fs.readFileSync(require.resolve('../cloudfunctions/dataService/material-storage-policy'), 'utf8'), fs.readFileSync(require.resolve('../cloudfunctions/deepseekProxy/material-storage-policy'), 'utf8'));
});
test('来源与出处必须存在，拒绝编造引用、重复编号、过量资料和格式', () => {
  assert.deepEqual(policy.evidence([ref], [source]), [ref]);
  for (const r of [{ ...ref, quote: '下周一提交' }, { ...ref, sourceId: 's2' }, { ...ref, chunkId: 'c2' }, { ...ref, quote: '   ' }]) assert.throws(() => policy.evidence([r], [source]));
  assert.throws(() => policy.sources([source, source]));
  assert.throws(() => policy.sources([{ ...source, chunks: [...source.chunks, ...source.chunks] }]));
  assert.throws(() => policy.sources(Array.from({ length: 7 }, (_, i) => ({ ...source, id: `s${i}` }))));
  assert.throws(() => policy.sources([{ ...source, chunks: [{ ...source.chunks[0], text: 'a'.repeat(40001) }] }]));
  for (const name of ['note.doc', 'talk.mp3', 'sheet.xls', 'page.html']) assert.throws(() => policy.fileKind(name));
});
test('保存只留白名单字段；AI状态不能自动产生完成任务', () => {
  const w = policy.workspace({ id: 'w', title: '课程', sources: [source], analysis: { id: 'a', mode: 'requirements', items: [item], apiKey: 'fixture-not-a-secret' }, tasks: [], _openid: 'bob', apiKey: 'fixture-not-a-secret' });
  assert.equal(w.tasks.length, 0); assert(!JSON.stringify(w).includes('fixture-not-a-secret')); assert.equal(w._openid, undefined);
  assert.equal(policy.workspace({ ...w, tasks: [{ id: 't', title: '任务', done: 'true' }] }).tasks[0].done, false);
  assert.throws(() => policy.workspace({ ...w, tasks: [{ id: 't', title: 'a' }, { id: 't', title: 'a' }] }));
});
test('资料不足明确保留待确认；比较至少两份；按资料提问不能为空', () => {
  assert.equal(policy.analysis({ id: 'a', mode: 'ask', items: [{ kind: 'question', title: '资料没有说明负责人', detail: '', evidence: [] }] }, [source]).items[0].evidence.length, 0);
  assert.throws(() => validate('materialsAnalyze', { sources: [source], mode: 'compare' }));
  assert.throws(() => validate('materialsAnalyze', { sources: [source], mode: 'ask', question: '' }));
});
test('真实分析处理器验证模型JSON出处，不向模型提供工具或自动操作', async () => {
  let sent;
  const report = await analyze({ sources: [source], mode: 'requirements' }, { provider: 'custom' }, async (config, messages, options) => {
    sent = { messages, options }; return { content: JSON.stringify({ items: [item], tasks: [{ done: true }], endpoint: 'https://invalid.example' }), model: 'fixture-model' };
  });
  assert.equal(report.items.length, 1); assert.equal(report.tasks, undefined); assert.equal(sent.options.tools, undefined);
  assert.match(sent.messages[0].content, /不得执行/); assert.equal(JSON.parse(sent.messages[1].content).sources[0].name, source.name);
  await assert.rejects(analyze({ sources: [source], mode: 'requirements' }, {}, async () => ({ content: JSON.stringify({ items: [{ ...item, evidence: [{ ...ref, quote: '捏造截止时间' }] }] }) })), /出处/);
});
module.exports = { source, ref, item };
