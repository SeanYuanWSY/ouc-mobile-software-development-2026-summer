const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMemory, normalizeGoal } = require('../miniprogram/utils/validate');

test('memory normalization rejects unknown category and mood', () => {
  const value = normalizeMemory({ title: '  hello  ', category: 'fake', mood: 'fake', importance: 99 });
  assert.equal(value.title, 'hello');
  assert.equal(value.category, 'life');
  assert.equal(value.mood, 'calm');
  assert.equal(value.importance, 5);
});

test('goal current never exceeds target', () => {
  const goal = normalizeGoal({ title: '目标', target: 5, current: 99 });
  assert.equal(goal.current, 5);
  assert.equal(goal.target, 5);
});
