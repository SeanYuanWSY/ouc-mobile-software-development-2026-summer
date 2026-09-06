const { CATEGORIES, MOODS } = require('./constants');
const { cleanText } = require('./validate');

function textList(value, maxItems = 6, maxLength = 100) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMemoryDraft(value = {}) {
  return {
    title: cleanText(value.title, 40),
    content: cleanText(value.content, 1200),
    category: CATEGORIES[value.category] ? value.category : 'life',
    mood: MOODS[value.mood] ? value.mood : 'calm',
    durationMinutes: Math.max(0, Math.min(1440, Number(value.durationMinutes) || 0)),
    importance: Math.max(1, Math.min(5, Number(value.importance) || 3)),
    tags: textList(value.tags, 8, 20),
    assistantNote: cleanText(value.assistantNote, 240)
  };
}

function normalizeParallel(value = {}) {
  const normalized = {
    title: cleanText(value.title, 60) || '一条没有走过的夏日支路',
    original: textList(value.original, 6, 160),
    parallel: textList(value.parallel, 6, 160),
    gains: textList(value.gains, 6, 100),
    losses: textList(value.losses, 6, 100),
    letter: cleanText(value.letter, 500)
  };
  if (!normalized.original.length || !normalized.parallel.length || !normalized.letter) {
    throw new Error('AI 返回的平行路线不完整，请重试');
  }
  return normalized;
}

function normalizeInsight(value = {}) {
  const normalized = {
    headline: cleanText(value.headline, 100),
    observations: textList(value.observations, 6, 180),
    action: cleanText(value.action, 220),
    evidence: (Array.isArray(value.evidence) ? value.evidence : []).map((item) => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(item && item.date || '')) ? item.date : '',
      title: cleanText(item && item.title, 80)
    })).filter((item) => item.date && item.title).slice(0, 8)
  };
  if (!normalized.headline || !normalized.observations.length || !normalized.action) {
    throw new Error('AI 返回的成长洞察不完整，请重试');
  }
  return normalized;
}

module.exports = { normalizeMemoryDraft, normalizeParallel, normalizeInsight };
