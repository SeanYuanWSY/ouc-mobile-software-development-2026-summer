const { CATEGORIES, MOODS } = require('./constants');
const { formatDate, formatTime } = require('./date');

function cleanText(value, maxLength = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeMemory(input = {}) {
  const now = new Date();
  const category = CATEGORIES[input.category] ? input.category : 'life';
  const mood = MOODS[input.mood] ? input.mood : 'calm';
  const location = input.location && Number.isFinite(Number(input.location.latitude))
    ? {
        name: cleanText(input.location.name, 50),
        address: cleanText(input.location.address, 100),
        latitude: Number(input.location.latitude),
        longitude: Number(input.location.longitude)
      }
    : null;
  return {
    _id: input._id || input.id || '',
    title: cleanText(input.title, 40) || '一颗新的暑假记忆',
    content: cleanText(input.content || input.note, 1200),
    category,
    mood,
    importance: Math.max(1, Math.min(5, Number(input.importance) || 3)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : formatDate(now),
    time: /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : formatTime(now),
    durationMinutes: Math.max(0, Math.min(1440, Number(input.durationMinutes) || 0)),
    location,
    media: Array.isArray(input.media) ? input.media.slice(0, 9) : [],
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => cleanText(tag, 20)).filter(Boolean).slice(0, 8) : [],
    source: ['manual', 'ai-assisted', 'demo', 'reflection'].includes(input.source) ? input.source : 'manual',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeGoal(input = {}) {
  const target = Math.max(1, Math.min(9999, Number(input.target) || 1));
  return {
    _id: input._id || input.id || '',
    title: cleanText(input.title, 40) || '新的暑假目标',
    category: CATEGORIES[input.category] ? input.category : 'life',
    current: Math.max(0, Math.min(target, Number(input.current) || 0)),
    target,
    unit: cleanText(input.unit, 8) || '次',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = { cleanText, normalizeMemory, normalizeGoal };
