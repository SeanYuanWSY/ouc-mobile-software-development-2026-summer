const { CATEGORIES, MOODS } = require('./constants');
const { formatDate, enumerateDates } = require('./date');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function getIslandStage(memoryCount) {
  if (memoryCount >= 60) return 2;
  if (memoryCount >= 1) return 1;
  return 0;
}

function getTwinStage(memoryCount, chatCount = 0) {
  const score = memoryCount + chatCount * 2;
  if (score >= 60) return 2;
  if (score >= 8) return 1;
  return 0;
}

function categoryCounts(memories = []) {
  const counts = Object.keys(CATEGORIES).reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  memories.forEach((memory) => {
    if (counts[memory.category] !== undefined) counts[memory.category] += 1;
  });
  return counts;
}

function moodAverage(memories = []) {
  const scored = memories
    .map((memory) => MOODS[memory.mood]?.score)
    .filter((score) => Number.isFinite(score));
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

function totalDurationHours(memories = [], predicate = () => true) {
  const minutes = memories
    .filter(predicate)
    .reduce((sum, memory) => sum + clamp(memory.durationMinutes, 0, 1440), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

function haversineDistance(a, b) {
  if (!a || !b) return 0;
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function routeDistance(memories = []) {
  const points = memories
    .filter((memory) => memory.location && Number.isFinite(Number(memory.location.latitude)))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistance(points[i - 1].location, points[i].location);
  }
  return Math.round(total * 10) / 10;
}

function weeklyMoodSeries(memories = [], endDate = formatDate()) {
  const end = new Date(`${endDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const dates = enumerateDates(formatDate(start), formatDate(end));
  return dates.map((date) => {
    const dayItems = memories.filter((memory) => memory.date === date);
    return { date, value: moodAverage(dayItems) };
  });
}

function heatmap(memories = [], startDate, endDate) {
  return enumerateDates(startDate, endDate).map((date) => {
    const count = memories.filter((memory) => memory.date === date).length;
    return { date, count, level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3 };
  });
}

function buildSummary(memories = [], goals = [], step = null) {
  const counts = categoryCounts(memories);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const completedGoals = goals.filter((goal) => Number(goal.current) >= Number(goal.target)).length;
  return {
    memoryCount: memories.length,
    categoryCounts: counts,
    dominantCategory: dominant && dominant[1] > 0 ? dominant[0] : null,
    moodScore: moodAverage(memories),
    learningHours: totalDurationHours(memories, (memory) => ['study', 'research'].includes(memory.category)),
    outdoorHours: totalDurationHours(memories, (memory) => ['explore', 'health', 'family'].includes(memory.category)),
    routeDistance: routeDistance(memories),
    completedGoals,
    todaySteps: step?.steps ?? null,
    islandStage: getIslandStage(memories.length)
  };
}

module.exports = {
  clamp,
  getIslandStage,
  getTwinStage,
  categoryCounts,
  moodAverage,
  totalDurationHours,
  haversineDistance,
  routeDistance,
  weeklyMoodSeries,
  heatmap,
  buildSummary
};
