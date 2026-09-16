const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../miniprogram/utils/material-policy');
const { analyze, validate } = require('../cloudfunctions/deepseekProxy/material-ai');

const source = { id: 's1', name: '项目说明', kind: 'text', extraction: 'plain', chunks: [{ id: 'c1', locator: '片段1', text: '这个工具把课程资料整理成带出处的任务。展示时需要说明资料读取范围。手机体验尚未验收。' }], warnings: [] };
const ref = { sourceId: 's1', chunkId: 'c1', quote: '这个工具把课程资料整理成带出处的任务' };
const practice = { kind: 'practice', title: '你的工具解决了什么问题？', detail: '把课程资料中的信息整理为带有出处的任务。', evidence: [ref] };
const task = { kind: 'task', title: '说明资料读取范围', detail: '准备演示中的范围说明', evidence: [{ ...ref, quote: '展示时需要说明资料读取范围' }] };
const report = (mode, items) => ({ id: 'a1', mode, items });
const workspace = (mode, items) => ({ id: 'w1', title: '汇报准备', sources: [source], analysis: report(mode, items), tasks: [] });

test('行动与答辩报告可保存恢复，保持出处且不自动创建或完成任务', () => {
  for (const [mode, items] of [['plan', [task]], ['defense', [practice]]]) {
    const stored = policy.workspace(workspace(mode, items));
    assert.deepEqual(policy.workspace(JSON.parse(JSON.stringify(stored))), stored);
    assert.equal(stored.tasks.length, 0);
    assert.equal(stored.analysis.items[0].evidence[0].sourceId, 's1');
  }
});

test('答辩练习不能以无引用或待确认类型绕过来源校验', () => {
  for (const item of [
    { ...practice, evidence: [] },
    { ...practice, evidence: [{ ...ref, quote: '获得全国一等奖' }] },
    { ...practice, evidence: [{ ...ref, sourceId: 'invented' }] },
    { ...practice, kind: 'question', evidence: [] },
    { ...practice, kind: 'answer' },
    { ...practice, detail: '' },
    { ...practice, evidence: [ref, ref, ref, ref] }
  ]) assert.throws(() => policy.analysis(report('defense', [item]), [source]), { code: 'MATERIAL_INVALID' });
  assert.throws(() => policy.analysis(report('defense', []), [source]), /资料不足/);
  assert.throws(() => policy.analysis(report('defense', Array(6).fill(practice)), [source]), { code: 'MATERIAL_INVALID' });
});

test('行动模式只接受行动、核对和待确认，普通模式不能混入练习类型', () => {
  assert.equal(policy.analysis(report('plan', [task, { ...task, kind: 'check' }, { kind: 'question', title: '截止时间未说明', detail: '', evidence: [] }]), [source]).items.length, 3);
  for (const kind of ['practice', 'answer', 'decision', 'requirement', 'change']) {
    assert.throws(() => policy.analysis(report('plan', [{ ...task, kind }]), [source]), { code: 'MATERIAL_INVALID' });
  }
  for (const mode of ['requirements', 'compare', 'ask', 'checklist', 'minutes']) {
    // Historical reports shared these kinds, so their old values remain readable.
    assert.equal(policy.analysis(report(mode, [{ ...task, kind: 'answer' }]), [source]).mode, mode);
    assert.throws(() => policy.analysis(report(mode, [practice]), [source]), { code: 'MATERIAL_INVALID' });
  }
});

test('畸形条目及引用返回可识别的格式错误', () => {
  for (const mode of ['requirements', 'plan', 'defense']) {
    assert.throws(() => policy.analysis(report(mode, [null]), [source]), { code: 'MATERIAL_INVALID' });
  }
  assert.throws(() => policy.evidence([null], [source]), { code: 'MATERIAL_INVALID' });
});

test('新增分析一次手动动作只调用一次模型，不提供工具、评分或伪造进展', async () => {
  for (const [mode, item] of [['plan', task], ['defense', practice]]) {
    let calls = 0;
    let sent;
    const result = await analyze({ sources: [source], mode }, { provider: 'glm' }, async (config, messages, options) => {
      calls += 1;
      sent = { config, messages, options };
      return { content: JSON.stringify({ items: [item], score: 100, done: true, ownAnswer: 'fixture-not-saved' }), model: 'fixture-model' };
    });
    assert.equal(calls, 1);
    assert.equal(result.mode, mode);
    assert.equal(sent.options.tools, undefined);
    assert.equal(sent.options.json, true);
    assert.match(sent.messages[0].content, /不得执行/);
    assert.match(sent.messages[0].content, mode === 'defense' ? /不打分/ : /未写明的日期/);
    assert.equal(JSON.parse(sent.messages[1].content).sources[0].chunks[0].text, source.chunks[0].text);
    assert.equal(result.score, undefined);
    assert.equal(result.done, undefined);
    assert(!JSON.stringify(result).includes('fixture-not-saved'));
  }
});

test('空资料与未知模式在模型请求前拒绝，无出处模型回复不能成为答辩结果', async () => {
  let calls = 0;
  const request = async () => { calls += 1; return { content: JSON.stringify({ items: [practice] }) }; };
  await assert.rejects(analyze({ sources: [], mode: 'defense' }, {}, request), { code: 'MATERIAL_INVALID' });
  await assert.rejects(analyze({ sources: [source], mode: 'unknown' }, {}, request), { code: 'MATERIAL_INVALID' });
  assert.equal(calls, 0);
  for (const mode of ['plan', 'defense']) assert.doesNotThrow(() => validate('materialsAnalyze', { sources: [source], mode }));
  await assert.rejects(analyze({ sources: [source], mode: 'defense' }, {}, async () => ({ content: JSON.stringify({ items: [{ ...practice, evidence: [] }] }) })), /出处/);
});
