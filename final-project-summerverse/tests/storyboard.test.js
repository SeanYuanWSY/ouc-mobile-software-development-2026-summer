const test = require('node:test');
const assert = require('node:assert/strict');

const { enrichStoryboard } = require('../miniprogram/utils/storyboard');

const memories = [
  { _id: 'memory-a', title: '真实记忆 A', media: [{ type: 'image', url: '/a.jpg' }] },
  { _id: 'memory-b', title: '真实记忆 B', media: [] }
];

test('director chapters only bind existing memory ids', () => {
  const result = enrichStoryboard({
    title: '暑假故事',
    chapters: [
      { title: '有效章节', memoryIds: ['memory-a'] },
      { title: '错误章节', memoryIds: ['missing-id'] }
    ]
  }, memories);

  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].memory._id, 'memory-a');
  assert.equal(result.chapters[0].cover, '/a.jpg');
  assert.equal(result.discardedChapterCount, 1);
});

test('director rejects a storyboard with no traceable chapter', () => {
  assert.throws(
    () => enrichStoryboard({ chapters: [{ title: '错误章节', memoryIds: ['missing-id'] }] }, memories),
    /没有绑定到现有真实记忆/
  );
});
