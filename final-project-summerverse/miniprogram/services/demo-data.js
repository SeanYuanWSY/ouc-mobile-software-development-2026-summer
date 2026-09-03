const { normalizeMemory, normalizeGoal } = require('../utils/validate');

const memories = [
  normalizeMemory({
    id: 'demo-study', title: '读懂了一篇代谢建模论文', content: '把论文的输入、输出和评估流程重新画了一遍，终于能完整讲清楚。',
    category: 'study', mood: 'calm', date: '2026-08-20', time: '09:30', durationMinutes: 95, importance: 4,
    location: { name: '图书馆', address: '示例地点 · 仅用于演示', latitude: 36.0649, longitude: 120.3404 }, source: 'demo'
  }),
  normalizeMemory({
    id: 'demo-research', title: '完成小岛地图交互', content: '把记录、星球成长和真实地点串成了同一条数据链。',
    category: 'research', mood: 'excited', date: '2026-08-20', time: '20:30', durationMinutes: 150, importance: 5,
    location: { name: '宿舍', address: '示例地点 · 仅用于演示', latitude: 36.0712, longitude: 120.3302 }, source: 'demo'
  }),
  normalizeMemory({
    id: 'demo-family', title: '和狗狗沿海边散步', content: '风很舒服，走了四十分钟，整个人都放松了下来。',
    category: 'family', mood: 'happy', date: '2026-08-21', time: '18:10', durationMinutes: 40, importance: 4,
    location: { name: '石老人海边', address: '示例地点 · 仅用于演示', latitude: 36.0941, longitude: 120.4789 }, source: 'demo'
  }),
  normalizeMemory({
    id: 'demo-explore', title: '看了一次海边日落', content: '没有安排任务，只是坐着看太阳慢慢落下去。',
    category: 'explore', mood: 'calm', date: '2026-08-22', time: '18:42', durationMinutes: 55, importance: 4,
    location: { name: '小麦岛公园', address: '示例地点 · 仅用于演示', latitude: 36.0616, longitude: 120.4367 }, source: 'demo'
  }),
  normalizeMemory({
    id: 'demo-health', title: '夜跑完成五公里', content: '配速不重要，重要的是今天真的出门了。',
    category: 'health', mood: 'happy', date: '2026-08-23', time: '20:10', durationMinutes: 36, importance: 3, source: 'demo'
  }),
  normalizeMemory({
    id: 'demo-life', title: '整理了暑假照片', content: '把零散的截图、照片和票根整理成了几个故事章节。',
    category: 'life', mood: 'happy', date: '2026-08-24', time: '21:00', durationMinutes: 45, importance: 3, source: 'demo'
  })
];

const goals = [
  normalizeGoal({ id: 'demo-goal-1', title: '完成移动软件开发大作业', category: 'research', current: 4, target: 5, unit: '步' }),
  normalizeGoal({ id: 'demo-goal-2', title: '精读 10 篇论文', category: 'study', current: 6, target: 10, unit: '篇' }),
  normalizeGoal({ id: 'demo-goal-3', title: '带狗狗散步 10 次', category: 'family', current: 7, target: 10, unit: '次' })
];

module.exports = { memories, goals };
