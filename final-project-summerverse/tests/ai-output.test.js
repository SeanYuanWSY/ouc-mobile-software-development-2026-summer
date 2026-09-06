const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMemoryDraft, normalizeParallel, normalizeInsight } = require('../miniprogram/utils/ai-output');

test('AI 记忆草稿限制枚举、数字和列表', () => {
  const value = normalizeMemoryDraft({ category: 'invented', mood: 'wild', durationMinutes: 9999, importance: -2, tags: '不是数组' });
  assert.equal(value.category, 'life');
  assert.equal(value.mood, 'calm');
  assert.equal(value.durationMinutes, 1440);
  assert.equal(value.importance, 1);
  assert.deepEqual(value.tags, []);
});

test('AI 平行路线缺少核心字段时明确失败', () => {
  assert.throws(() => normalizeParallel({ title: '只有标题' }), /不完整/);
  const value = normalizeParallel({ original: ['真实'], parallel: ['可能'], letter: '珍惜选择' });
  assert.equal(value.original[0], '真实');
});

test('AI 成长洞察过滤无效证据', () => {
  const value = normalizeInsight({
    headline: '节奏稳定', observations: ['连续记录'], action: '明天散步',
    evidence: [{ date: '2026-08-01', title: '海边' }, { date: '明天', title: '猜测' }]
  });
  assert.deepEqual(value.evidence, [{ date: '2026-08-01', title: '海边' }]);
});
