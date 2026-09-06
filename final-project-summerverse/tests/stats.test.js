const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../miniprogram/utils/stats');

test('island stages depend only on real memory count', () => {
  assert.equal(stats.getIslandStage(0), 0);
  assert.equal(stats.getIslandStage(1), 1);
  assert.equal(stats.getIslandStage(59), 1);
  assert.equal(stats.getIslandStage(60), 2);
});

test('category counts keep all six categories', () => {
  const result = stats.categoryCounts([{ category: 'study' }, { category: 'study' }, { category: 'family' }]);
  assert.equal(result.study, 2);
  assert.equal(result.family, 1);
  assert.equal(result.life, 0);
});

test('route distance is zero without real locations', () => {
  assert.equal(stats.routeDistance([{ title: 'no location' }]), 0);
});

test('mood average ignores missing mood', () => {
  assert.equal(stats.moodAverage([{ mood: 'happy' }, { mood: 'calm' }, {}]), 82);
});

test('示例与反思不进入真实计数、心情、时长、热力图或目标完成数', () => {
  const memories = [
    { source: 'manual', category: 'study', mood: 'happy', durationMinutes: 60, date: '2026-09-05' },
    { source: 'reflection', category: 'study', mood: 'low', durationMinutes: 600, date: '2026-09-05' },
    { source: 'demo', category: 'study', mood: 'low', durationMinutes: 600, date: '2026-09-05' }
  ];
  const summary = stats.buildSummary(memories, [{ _id: 'demo-goal', current: 1, target: 1 }]);
  assert.equal(summary.memoryCount, 1);
  assert.equal(summary.moodScore, stats.moodAverage(memories.slice(0, 1)));
  assert.equal(summary.learningHours, 1);
  assert.equal(summary.categoryCounts.study, 1);
  assert.equal(summary.completedGoals, 0);
  assert.equal(stats.heatmap(memories, '2026-09-05', '2026-09-05')[0].count, 1);
  assert.equal(stats.buildSummary(memories.slice(1)).islandStage, 0);
});
