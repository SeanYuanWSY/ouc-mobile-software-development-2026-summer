// Legacy records without a source were entered manually. Unknown future sources fail closed.
function isRealMemory(item) {
  return Boolean(item && (item.source == null || item.source === 'manual' || item.source === 'ai-assisted'));
}
function realMemories(items = []) { return items.filter(isRealMemory); }
function realGoals(items = []) { return items.filter((item) => item.source !== 'demo' && !String(item._id || '').startsWith('demo-')); }
module.exports = { isRealMemory, realMemories, realGoals };
