function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toTimestamp(memory) {
  if (!memory) return 0;
  if (memory.occurredAt instanceof Date) return memory.occurredAt.getTime();
  if (memory.occurredAt) {
    const direct = new Date(memory.occurredAt).getTime();
    if (!Number.isNaN(direct)) return direct;
  }
  const value = new Date(`${memory.date || '1970-01-01'}T${memory.time || '00:00'}:00`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function friendlyDate(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${week[date.getDay()]}`;
}

function relativeDate(dateString, todayString = formatDate()) {
  const a = new Date(`${dateString}T00:00:00`);
  const b = new Date(`${todayString}T00:00:00`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff > 1 && diff < 7) return `${diff} 天前`;
  return friendlyDate(dateString);
}

function groupByDate(memories) {
  const groups = new Map();
  memories.forEach((memory) => {
    const key = memory.date || formatDate(memory.occurredAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(memory);
  });
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      label: friendlyDate(date),
      items: items.sort((a, b) => toTimestamp(b) - toTimestamp(a))
    }));
}

function enumerateDates(start, end) {
  const result = [];
  const cursor = new Date(`${start}T00:00:00`);
  const final = new Date(`${end}T00:00:00`);
  while (!Number.isNaN(cursor.getTime()) && cursor <= final && result.length < 370) {
    result.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

module.exports = {
  pad,
  formatDate,
  formatTime,
  toTimestamp,
  friendlyDate,
  relativeDate,
  groupByDate,
  enumerateDates
};
