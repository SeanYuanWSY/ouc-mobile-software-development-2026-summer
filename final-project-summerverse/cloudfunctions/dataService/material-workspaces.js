const crypto = require('node:crypto');
const policy = require('./material-policy');
const COLLECTION = 'material_workspaces';
function docId(owner, id) { return crypto.createHash('sha256').update(`${owner}:${id}`).digest('hex'); }
function conflict() { throw Object.assign(new Error('这份资料在其他页面已更新，请重新打开后再修改'), { code: 'MATERIAL_CONFLICT' }); }
function createWorkspaces(db) {
  return async (owner, action, payload = {}) => {
    if (typeof owner !== 'string' || !owner) policy.bad('无法识别当前用户');
    const indexId = docId(owner, '$index');
    if (action === 'material.list') {
      const meta = (await db.collection(COLLECTION).doc(indexId).get()).data;
      if (meta && meta._openid !== owner) policy.bad('无法读取资料列表');
      const ids = meta?.ids || [];
      const list = [];
      for (const id of ids) {
        const d = (await db.collection(COLLECTION).doc(docId(owner, id)).get()).data;
        if (d && d._openid === owner) list.push({ id: d.id, title: d.title, updatedAt: d.updatedAt, sourceCount: d.sources.length, taskCount: d.tasks.length, revision: d.revision });
      }
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const id = policy.id(payload.id || payload.workspace?.id);
    if (action === 'material.get') {
      const d = (await db.collection(COLLECTION).doc(docId(owner, id)).get()).data;
      if (!d || d._openid !== owner) policy.bad('资料不存在或已删除');
      const out = { ...d }; delete out._openid; delete out._id; return out;
    }
    if (!['material.save', 'material.delete'].includes(action)) policy.bad('未知资料操作');
    const incoming = action === 'material.save' ? policy.workspace(payload.workspace) : null;
    if (incoming && incoming.id !== id) policy.bad('资料编号不一致');
    if (incoming && Buffer.byteLength(JSON.stringify(incoming)) > 400000) policy.bad('工作台内容过大');
    if (!Number.isInteger(payload.revision) || payload.revision < 0) policy.bad('版本信息无效');
    return db.runTransaction(async (tx) => {
      const metaRef = tx.collection(COLLECTION).doc(indexId), itemRef = tx.collection(COLLECTION).doc(docId(owner, id));
      const meta = (await metaRef.get()).data || { _openid: owner, ids: [] };
      const existing = (await itemRef.get()).data;
      if (meta._openid !== owner || (existing && existing._openid !== owner)) policy.bad('无法修改其他人的资料');
      if ((existing?.revision || 0) !== payload.revision) conflict();
      if (action === 'material.delete') {
        if (existing) await itemRef.remove();
        await metaRef.set({ data: { _openid: owner, ids: meta.ids.filter((v) => v !== id) } });
        return { deleted: true };
      }
      if (!meta.ids.includes(id) && meta.ids.length >= policy.LIMITS.workspaces) policy.bad('最多保存12份资料，请先删除不用的工作台');
      const now = new Date().toISOString();
      const data = { ...incoming, _openid: owner, revision: payload.revision + 1, updatedAt: now };
      await itemRef.set({ data });
      await metaRef.set({ data: { _openid: owner, ids: [...new Set([...meta.ids, id])] } });
      return { revision: data.revision, updatedAt: now };
    });
  };
}
module.exports = { createWorkspaces, docId, COLLECTION };
