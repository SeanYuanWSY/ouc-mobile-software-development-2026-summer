const { scopedKey } = require('./account-scope');
const KEY = 'summerverse.focus.v1';
const MINUTES = [10, 25, 45];
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
function create(workspaceId, taskId, minutes = 25, storageMode = 'local', now = Date.now()) {
  if (!validId(workspaceId) || !validId(taskId) || !MINUTES.includes(minutes) || !['local', 'cloud'].includes(storageMode)) throw new Error('请先选择已保存的任务');
  return { version: 1, workspaceId, taskId, minutes, storageMode, state: 'idle', remainingMs: minutes * 60000, deadline: 0, updatedAt: now };
}
function normalize(raw, now = Date.now()) {
  if (!raw || raw.version !== 1 || !validId(raw.workspaceId) || !validId(raw.taskId) || !MINUTES.includes(raw.minutes)
    || !['local', 'cloud'].includes(raw.storageMode) || !['idle', 'running', 'paused', 'finished'].includes(raw.state)
    || !Number.isFinite(raw.remainingMs) || raw.remainingMs < 0 || raw.remainingMs > raw.minutes * 60000
    || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0 || !Number.isFinite(raw.deadline) || raw.deadline < 0) return null;
  const next = { ...create(raw.workspaceId, raw.taskId, raw.minutes, raw.storageMode, now), state: raw.state,
    remainingMs: raw.remainingMs, deadline: raw.deadline };
  if (next.state === 'running') {
    if (raw.deadline > raw.updatedAt + raw.minutes * 60000 || raw.deadline < raw.updatedAt) return null;
    // A backwards system-clock change must not award more time or a false finish.
    if (now < raw.updatedAt) { next.state = 'paused'; next.deadline = 0; }
    else {
      next.remainingMs = Math.max(0, Math.min(raw.remainingMs, raw.deadline - now));
      if (next.remainingMs === 0) { next.state = 'finished'; next.deadline = 0; }
    }
  } else next.deadline = 0;
  if (next.state === 'idle') next.remainingMs = next.minutes * 60000;
  if (next.state === 'finished') next.remainingMs = 0;
  return next;
}
function start(value, now = Date.now()) {
  const current = normalize(value, now);
  if (!current) throw new Error('计时状态无效，请重新选择任务');
  if (current.state === 'running') return current;
  const remainingMs = current.state === 'finished' ? current.minutes * 60000 : current.remainingMs;
  return { ...current, state: 'running', remainingMs, deadline: now + remainingMs, updatedAt: now };
}
function pause(value, now = Date.now()) {
  const current = normalize(value, now);
  if (!current) throw new Error('计时状态无效，请重新选择任务');
  return current.state === 'running' ? { ...current, state: 'paused', deadline: 0 } : current;
}
function read(now = Date.now()) { return normalize(wx.getStorageSync(scopedKey(KEY)), now); }
function save(value, now = Date.now()) {
  const current = normalize(value, now);
  if (!current) throw new Error('计时状态无效，请重新选择任务');
  // This object contains IDs and timer state only; no task text, answer, Key or token.
  try { wx.setStorageSync(scopedKey(KEY), current); } catch (_) { throw new Error('计时状态未能保存，请检查本机空间后重试'); }
  return current;
}
function display(value, now = Date.now()) {
  const current = normalize(value, now);
  const seconds = Math.ceil((current?.remainingMs ?? 25 * 60000) / 1000);
  return { sessionState: current?.state || 'idle', clock: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` };
}
module.exports = { KEY, MINUTES, validId, create, normalize, start, pause, read, save, display };
