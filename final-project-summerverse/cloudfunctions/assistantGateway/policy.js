const crypto = require('node:crypto');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function requireValue(ok, code = 'BAD_REQUEST') { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
function fields(value, allowed) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value));
  requireValue(Object.keys(value).every((key) => allowed.includes(key)));
}
function string(value, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max);
  requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
  return value.trim();
}
function draft(value) {
  fields(value, ['kind', 'title', 'content', 'date', 'target', 'unit']);
  requireValue(['memory', 'goal', 'result'].includes(value.kind));
  const result = { kind: value.kind, title: string(value.title, 60), content: string(value.content, 3000, true) };
  if (value.kind === 'result') {
    requireValue(value.date === undefined && value.target === undefined && value.unit === undefined);
    requireValue(result.content.length > 0);
  } else if (value.kind === 'memory') {
    requireValue(value.target === undefined && value.unit === undefined);
    requireValue(typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date));
    const date = new Date(value.date + 'T00:00:00Z');
    requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.date);
    result.date = value.date;
  } else {
    requireValue(value.date === undefined);
    requireValue(Number.isInteger(value.target) && value.target >= 1 && value.target <= 9999);
    result.target = value.target; result.unit = string(value.unit, 10);
  }
  return result;
}
function active(connection, now) {
  requireValue(connection && !connection.revoked && connection.expiresAt > now, 'UNAUTHORIZED');
}
function publicConnection(c) {
  return { id: c.publicId, name: c.name, scopes: c.scopeVersion === 2 ? c.scopes : [], scopeVersion: c.scopeVersion || 1, readRecent: c.readRecent, workJobs: c.workJobs === true, expiresAt: c.expiresAt, lastUsedAt: c.lastUsedAt || null, revoked: !!c.revoked };
}
const messages = { BAD_REQUEST: '请求内容不符合要求', UNAUTHORIZED: '连接无效、已过期或已撤销', FORBIDDEN: '此连接未获当前操作的授权', LIMIT: '已达到本次连接或账号的使用上限', JOB_LIMIT: '最多保留20条接力，请先取消并清理不再需要的任务后再发起', NOT_FOUND: '内容不存在', CONFLICT: '内容或处理状态已变更，请重新查看', REVISION_CONFLICT: '资料已更新，请重新打开后发起接力', LEASE_EXPIRED: '领取已过期，请重新查看任务状态', CLAIM_REUSED: '该领取编号已使用，请生成新的编号重新领取', CLAIM_LIMIT: '此任务已达到20次领取上限，请在手机取消后重新发起接力', CANCELLED: '接力已取消，不能继续处理', SOURCE_LIMIT: '所选资料超过1.2万字、120个片段或6份来源，请减少选择', EVIDENCE_INVALID: '结果引用无法在所选资料中找到', UNAVAILABLE: '服务暂不可用，请稍后重试' };
function failure(e) { const code = messages[e.code] ? e.code : 'UNAVAILABLE'; return { ok: false, code, error: messages[code] }; }
module.exports = { hash, requireValue, fields, string, draft, active, publicConnection, failure };
