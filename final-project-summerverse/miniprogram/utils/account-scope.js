// Private local state never migrates between accounts or from legacy unowned storage.
function subject() {
  try { return getApp().globalData.accountSubject || ''; } catch (_) { return ''; }
}
function scopedKey(key) {
  const id = subject();
  return `summerverse.account.${/^[a-f0-9]{64}$/.test(id) ? id : 'unowned'}.${key}`;
}
function stamp() {
  try { const d = getApp().globalData; return `${d.accountSubject || ''}:${d.accountEpoch || 0}`; } catch (_) { return ''; }
}
function guard(allowInitial = false) { const before = stamp(), initial = !subject(); return () => { if (before !== stamp() && !(allowInitial && initial && subject())) throw Object.assign(new Error('账号已变化，请重新操作'), { code: 'ACCOUNT_CHANGED' }); }; }
module.exports = { subject, scopedKey, stamp, guard };
