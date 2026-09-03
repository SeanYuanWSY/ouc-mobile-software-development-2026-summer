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
