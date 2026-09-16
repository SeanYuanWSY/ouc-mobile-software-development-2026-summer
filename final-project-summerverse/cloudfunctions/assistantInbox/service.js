const crypto = require('node:crypto');
const { hash, requireValue, fields, string, draft, publicConnection } = require('./policy');
const { createPhoneJobs } = require('./jobs');
function createInbox(db, now = Date.now) {
  const jobs = createPhoneJobs(db, now);
  return async (openid, input) => {
    requireValue(typeof openid === 'string' && openid.length > 0, 'UNAUTHORIZED');
    if (input && (input.action === 'capabilities' || String(input.action).startsWith('job.'))) return jobs(openid, input);
    const allowed = { list: ['action'], connect: ['action', 'name', 'readRecent', 'workJobs'], revoke: ['action', 'id'], accept: ['action', 'id', 'draft'], dismiss: ['action', 'id'] };
    requireValue(input && Object.hasOwn(allowed, input.action)); fields(input, allowed[input.action]);
    const timestamp = now(), accountId = hash(openid);
    if (input.action === 'list') {
      const account = (await db.collection('assistant_accounts').doc(accountId).get()).data;
      const connections = [];
      for (const id of account?.connections || []) {
        const c = (await db.collection('assistant_connections').doc(id).get()).data;
        if (c && c._openid === openid) connections.push(publicConnection(c));
      }
      const drafts = (await db.collection('assistant_drafts').where({ _openid: openid, status: 'pending' }).limit(100).get()).data || [];
      return { connections, drafts: drafts.filter(d => d.type === undefined || d.type === 'draft').sort((a, b) => b.createdAt - a.createdAt).map(d => ({ id: d._id, draft: d.draft, connectionName: d.connectionName, createdAt: d.createdAt })) };
    }
    if (input.action === 'connect') {
      const name = string(input.name, 30);
      requireValue(typeof input.readRecent === 'boolean');
      requireValue(input.workJobs === undefined || typeof input.workJobs === 'boolean');
      const token = crypto.randomBytes(32).toString('hex'), id = hash(token);
      const c = { _openid: openid, publicId: crypto.randomBytes(16).toString('hex'), name, readRecent: input.readRecent, workJobs: input.workJobs === true, createdAt: timestamp, expiresAt: timestamp + 30 * 86400000, revoked: false, requests: 0 };
      await db.runTransaction(async tx => {
        const ref = tx.collection('assistant_accounts').doc(accountId);
        const account = (await ref.get()).data || { _openid: openid, connections: [], pending: 0 };
        requireValue(account.connections.length < 5, 'LIMIT');
        const day = new Date(timestamp).toISOString().slice(0, 10);
        const issues = account.issueDay === day ? account.issues : 0;
        requireValue(issues < 10, 'LIMIT');
        delete account._id;
        await tx.collection('assistant_connections').doc(id).set({ data: c });
        await ref.set({ data: { ...account, connections: [...account.connections, id], issueDay: day, issues: issues + 1 } });
      });
      return { token, connection: publicConnection(c) };
    }
    requireValue(['revoke', 'accept', 'dismiss'].includes(input.action));
    const id = string(input.id, 64);
    return db.runTransaction(async tx => {
      const ar = tx.collection('assistant_accounts').doc(accountId);
      const account = (await ar.get()).data;
      requireValue(account && account._openid === openid, 'NOT_FOUND');
      if (input.action === 'revoke') {
        for (const key of account.connections || []) {
          const ref = tx.collection('assistant_connections').doc(key), c = (await ref.get()).data;
          if (c && c._openid === openid && c.publicId === id) {
            await ref.update({ data: { revoked: true } });
            await ar.update({ data: { connections: account.connections.filter(k => k !== key) } });
            return { revoked: true };
          }
        }
        requireValue(false, 'NOT_FOUND');
      }
      const dr = tx.collection('assistant_drafts').doc(id), d = (await dr.get()).data;
      requireValue(d && (d.type === undefined || d.type === 'draft') && d._openid === openid, 'NOT_FOUND');
      if (d.status !== 'pending') return { status: d.status, targetId: d.targetId || null };
      let targetId = null;
      if (input.action === 'accept') {
        const safe = draft(input.draft);
        requireValue(safe.kind === d.draft.kind);
        targetId = 'assistant_' + id;
        const data = safe.kind === 'memory' ? {
          title: safe.title, content: safe.content, date: safe.date, time: '00:00', occurredAt: new Date(safe.date + 'T00:00:00+08:00'),
          category: 'life', mood: 'calm', importance: 3, durationMinutes: 0, location: null, media: [], tags: [], source: 'ai-assisted'
        } : { title: safe.title, category: 'life', current: 0, target: safe.target, unit: safe.unit, completed: false, source: 'ai-assisted' };
        const ref = tx.collection(safe.kind === 'memory' ? 'memories' : 'goals').doc(targetId);
        requireValue(!(await ref.get()).data, 'CONFLICT');
        await ref.set({ data: { ...data, _openid: openid, createdAt: new Date(timestamp), updatedAt: new Date(timestamp), assistantDraftId: id } });
      }
      const status = input.action === 'accept' ? 'accepted' : 'dismissed';
      await dr.update({ data: { status, targetId, resolvedAt: timestamp } });
      await ar.update({ data: { pending: Math.max(0, (account.pending || 0) - 1) } });
      return { status, targetId };
    });
  };
}
module.exports = { createInbox };
