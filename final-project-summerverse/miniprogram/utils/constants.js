const CATEGORIES = {
  study: { key: 'study', name: '学习成长', short: '学习', emoji: '📘', color: '#5f8fd8', soft: '#eaf2ff' },
  research: { key: 'research', name: '科研项目', short: '科研', emoji: '🧪', color: '#b3613f', soft: '#f9ece1' },
  family: { key: 'family', name: '家人陪伴', short: '陪伴', emoji: '🏡', color: '#d77672', soft: '#fff0ed' },
  explore: { key: 'explore', name: '旅行探索', short: '探索', emoji: '📍', color: '#d89b42', soft: '#fff5df' },
  health: { key: 'health', name: '运动健康', short: '运动', emoji: '🏃', color: '#4fa584', soft: '#e9f8f1' },
  life: { key: 'life', name: '生活日常', short: '生活', emoji: '☕', color: '#9b7fa8', soft: '#f5eff7' }
};

const CATEGORY_LIST = Object.values(CATEGORIES);

const MOODS = {
  happy: { key: 'happy', name: '开心', emoji: '😊', score: 86 },
  excited: { key: 'excited', name: '兴奋', emoji: '🤩', score: 94 },
  calm: { key: 'calm', name: '平静', emoji: '😌', score: 78 },
  tired: { key: 'tired', name: '疲惫', emoji: '😮‍💨', score: 55 },
  anxious: { key: 'anxious', name: '焦虑', emoji: '😟', score: 45 },
  low: { key: 'low', name: '低落', emoji: '😔', score: 35 }
};

const MOOD_LIST = Object.values(MOODS);

const ISLAND_ASSETS = [
  '/images/island-seed-v2.jpg',
  '/images/island-growing-v2.jpg',
  '/images/island-bloom-v2.jpg'
];

const TWIN_ASSETS = [
  '/images/twin-seed-v2.jpg',
  '/images/twin-growing-v2.jpg',
  '/images/twin-bloom-v2.jpg'
];

const STORAGE_KEYS = {
  MEMORIES: 'summerverse.memories.v1',
  GOALS: 'summerverse.goals.v1',
  PROFILE: 'summerverse.profile.v1',
  STEP: 'summerverse.step.v1',
  WEATHER: 'summerverse.weather.v1',
  CHAT: 'summerverse.chat.v1',
  SETTINGS: 'summerverse.settings.v1',
  DEMO_IMPORTED: 'summerverse.demoImported.v1',
  ONBOARDED: 'summerverse.onboarded.v1'
};

const DEFAULT_PROFILE = {
  nickname: 'SuiYuan',
  avatarUrl: '/images/twin-avatar-v2.jpg',
  summerStart: '2026-07-01',
  summerEnd: '2026-08-31',
  motto: '让每一个可见的夏天，都成为值得珍藏的宇宙。',
  createdAt: ''
};

module.exports = {
  CATEGORIES,
  CATEGORY_LIST,
  MOODS,
  MOOD_LIST,
  ISLAND_ASSETS,
  TWIN_ASSETS,
  STORAGE_KEYS,
  DEFAULT_PROFILE
};
