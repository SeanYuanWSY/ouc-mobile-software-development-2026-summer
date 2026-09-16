const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { uniqueCloudFileIDs, registeredFileIDs, deletionOutcome } = require('./media-policy');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const command = db.command;
const { createWorkspaces } = require('./material-workspaces');
const { validateMaterialFile } = require('./material-storage-policy');
const materialWorkspaces = createWorkspaces(db);

const COLLECTIONS = {
  memories: 'memories',
  goals: 'goals',
  profiles: 'profiles',
  steps: 'step_snapshots',
  mediaAssets: 'media_assets'
};

function ok(data, extra = {}) { return { ok: true, data, ...extra }; }
function fail(message, code = 'BAD_REQUEST') { return { ok: false, error: message, code }; }
function text(value, max = 500) { return String(value || '').trim().slice(0, max); }
function number(value, min = 0, max = 999999) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function mediaPrefix(openid) { return `summerverse/${crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32)}`; }
const REQUEST_WINDOW = 24 * 60 * 60 * 1000;
function requestError(message, code = 'WRITE_CONFLICT') { return Object.assign(new Error(message), { code }); }
function requestToken(value) {
  const match = /^op-(\d{13})-([a-z0-9]{10})$/.exec(value || '');
  if (!match) throw requestError('请求标识无效，请重新打开小程序', 'WRITE_INVALID');
  const issuedAt = Number(match[1]);
  if (Date.now() - issuedAt > REQUEST_WINDOW || issuedAt > Date.now() + 5 * 60 * 1000) throw requestError('这笔请求已过期，请先核对保存结果', 'WRITE_EXPIRED');
  return { value, issuedAt };
}
function creation(openid, action, requestId, data) {
  const token = requestToken(requestId);
  return { id: `${action}-${crypto.createHash('sha256').update(`${openid}:${action}:${token.value}`).digest('hex').slice(0, 40)}`,
    receipt: { requestId: token.value, hash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex') } };
}
function replayCreation(existing, openid, receipt) {
  if (!existing) return null;
  if (existing._openid !== openid || existing._creation?.requestId !== receipt.requestId || existing._creation.hash !== receipt.hash) throw requestError('同一保存请求的内容已变化，请先核对原记录');
  if (existing._deleted) throw requestError('这条记录已删除，不会重复创建', 'WRITE_DELETED');
  return visibleDoc(existing);
}
function visibleDoc(value) {
  const copy = { ...value };
  delete copy._creation; delete copy._stepRequests; delete copy._lastWrite;
  return copy;
}
function tombstone(value) {
  return { _openid: value._openid, _creation: value._creation, _deleted: true, createdAt: value.createdAt,
    revision: (value.revision || 0) + 1, deletedAt: db.serverDate() };
}

async function clearRecordsWithReceipts(collection, openid) {
  while (true) {
    const rows = (await db.collection(collection).where({ _openid: openid, _deleted: command.neq(true) }).limit(100).get()).data || [];
    if (!rows.length) break;
    for (const row of rows) await db.runTransaction(async (tx) => {
      const ref = tx.collection(collection).doc(row._id), current = (await ref.get()).data;
      if (!current || current._openid !== openid || current._deleted) return;
      if (current._creation) await ref.set({ data: tombstone(current) }); else await ref.remove();
    });
  }
}
function sameFileIDs(left = [], right = []) {
  const a = uniqueCloudFileIDs(left).sort();
  const b = uniqueCloudFileIDs(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sanitizeLocation(value) {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { name: text(value.name, 60), address: text(value.address, 160), latitude, longitude };
}

function sanitizeMedia(items) {
  return Array.isArray(items) ? items.slice(0, 9).map((item) => ({
    id: text(item.id, 80),
    type: ['image', 'video', 'audio'].includes(item.type) ? item.type : 'image',
    fileID: text(item.fileID, 500),
    url: text(item.url, 500),
    cloudPath: text(item.cloudPath, 500),
    duration: number(item.duration, 0, 3600),
    size: number(item.size, 0, 100 * 1024 * 1024)
  })) : [];
}

function sanitizeMemory(input = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : new Date().toISOString().slice(0, 10);
  const time = /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '00:00';
  return {
    title: text(input.title, 60) || '一颗新的暑假记忆',
    content: text(input.content, 3000),
    category: ['study', 'research', 'family', 'explore', 'health', 'life'].includes(input.category) ? input.category : 'life',
    mood: ['happy', 'excited', 'calm', 'tired', 'anxious', 'low'].includes(input.mood) ? input.mood : 'calm',
    importance: input.importance === undefined || input.importance === null ? 3 : number(input.importance, 1, 5),
    date,
    time,
    occurredAt: new Date(`${date}T${time}:00+08:00`),
    durationMinutes: number(input.durationMinutes, 0, 1440),
    location: sanitizeLocation(input.location),
    media: sanitizeMedia(input.media),
    tags: Array.isArray(input.tags) ? input.tags.map((item) => text(item, 24)).filter(Boolean).slice(0, 10) : [],
    source: ['manual', 'ai-assisted', 'demo', 'reflection'].includes(input.source) ? input.source : 'manual'
  };
}

function sanitizeGoal(input = {}) {
  const target = number(input.target, 1, 9999);
  return {
    title: text(input.title, 60) || '新的暑假目标',
    category: ['study', 'research', 'family', 'explore', 'health', 'life'].includes(input.category) ? input.category : 'life',
    current: number(input.current, 0, target),
    target,
    unit: text(input.unit, 10) || '次'
  };
}

async function ownedDoc(collection, id, openid) {
  if (!id) throw new Error('缺少数据 ID');
  const result = await db.collection(collection).doc(id).get();
  if (!result.data || result.data._openid !== openid || result.data._deleted) throw new Error('没有权限访问这条数据或数据已删除');
  return result.data;
}

async function loadOwnedAssets(openid, fileIDs = []) {
  const unique = uniqueCloudFileIDs(fileIDs);
  if (!unique.length) return [];
  const result = await db.collection(COLLECTIONS.mediaAssets)
    .where({ _openid: openid, fileID: command.in(unique) })
    .limit(50)
    .get();
  return result.data || [];
}

async function listReferenceTokens(openid, fileIDs = []) {
  const targets = new Set(fileIDs);
  const tokens = new Map(fileIDs.map((fileID) => [fileID, new Set()]));
  for (let page = 0; ; page += 1) {
    const response = await db.collection(COLLECTIONS.memories).where({ _openid: openid, _deleted: command.neq(true) }).skip(page * 100).limit(100).get();
    const batch = response.data || [];
    batch.forEach((memory) => (memory.media || []).forEach((item) => {
      if (targets.has(item.fileID)) tokens.get(item.fileID).add(`memory:${memory._id}`);
    }));
    if (batch.length < 100) break;
  }
  const profiles = await db.collection(COLLECTIONS.profiles).where({ _openid: openid }).limit(1).get();
  const profile = profiles.data && profiles.data[0];
  if (profile && targets.has(profile.avatarUrl)) tokens.get(profile.avatarUrl).add(`profile:${profile._id}`);
  return tokens;
}

async function assertOwnedMedia(openid, media = []) {
  if (!media.length) return [];
  const fileIDs = [...new Set(media.map((item) => item.fileID).filter(Boolean))];
  if (fileIDs.length !== media.length || fileIDs.some((fileID) => !fileID.startsWith('cloud://'))) {
    throw new Error('云端记忆附件必须先上传并登记');
  }
  const records = await loadOwnedAssets(openid, fileIDs);
  const owned = new Set(records.map((item) => item.fileID));
  if (fileIDs.some((fileID) => !owned.has(fileID))) throw new Error('记忆中包含未登记或不属于当前用户的附件');
  if (records.some((item) => item.status === 'deleting')) throw new Error('附件正在清理，请重新选择后再保存');
  return records;
}

async function syncMediaReferences(openid, token, previousIDs, nextIDs, records, writeDocument, beforeWrite) {
  const previous = new Set(uniqueCloudFileIDs(previousIDs));
  const next = new Set(uniqueCloudFileIDs(nextIDs));
  const legacyIDs = records.filter((item) => !Array.isArray(item.references)).map((item) => item.fileID);
  const fallback = legacyIDs.length ? await listReferenceTokens(openid, legacyIDs) : new Map();
  return db.runTransaction(async (transaction) => {
    if (beforeWrite) {
      const replay = await beforeWrite(transaction);
      if (replay) return { claimed: [], retained: [], replay };
    }
    const claimed = [];
    const retained = [];
    for (const record of records) {
      const ref = transaction.collection(COLLECTIONS.mediaAssets).doc(record._id);
      const currentResult = await ref.get();
      const current = currentResult.data;
      if (!current || current._openid !== openid || current.fileID !== record.fileID) throw new Error('附件登记已变化，请重新保存');
      const references = new Set(Array.isArray(current.references)
        ? current.references
        : [...(fallback.get(current.fileID) || [])]);
      references.delete(token);
      if (next.has(current.fileID)) {
        if (current.status === 'deleting') throw new Error('附件正在清理，请重新选择后再保存');
        references.add(token);
      }
      const removed = previous.has(current.fileID) && !next.has(current.fileID);
      const status = removed && references.size === 0 ? 'deleting' : 'ready';
      await ref.update({ data: { references: [...references], status, updatedAt: db.serverDate() } });
      if (removed && status === 'deleting') claimed.push(current.fileID);
      if (removed && references.size) retained.push(current.fileID);
    }
    await writeDocument(transaction);
    return { claimed, retained };
  });
}

async function claimUnreferencedMedia(openid, fileIDs = []) {
  const unique = uniqueCloudFileIDs(fileIDs);
  const records = await loadOwnedAssets(openid, unique);
  const legacyIDs = records.filter((item) => !Array.isArray(item.references)).map((item) => item.fileID);
  const fallback = legacyIDs.length ? await listReferenceTokens(openid, legacyIDs) : new Map();
  const outcome = await db.runTransaction(async (transaction) => {
    const claimed = [];
    const retained = [];
    for (const record of records) {
      const ref = transaction.collection(COLLECTIONS.mediaAssets).doc(record._id);
      const currentResult = await ref.get();
      const current = currentResult.data;
      if (!current || current._openid !== openid || current.fileID !== record.fileID) continue;
      const references = Array.isArray(current.references) ? current.references : [...(fallback.get(current.fileID) || [])];
      if (references.length) {
        retained.push(current.fileID);
      } else {
        await ref.update({ data: { references: [], status: 'deleting', updatedAt: db.serverDate() } });
        claimed.push(current.fileID);
      }
    }
    return { claimed, retained };
  });
  const registered = new Set(records.map((item) => item.fileID));
  return { ...outcome, failed: unique.filter((fileID) => !registered.has(fileID)) };
}

async function deleteOwnedCloudFiles(openid, fileIDs = [], options = {}) {
  const unique = uniqueCloudFileIDs(fileIDs);
  const result = { requested: unique.length, deleted: 0, retained: [], failed: [] };
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    let records;
    try {
      records = await loadOwnedAssets(openid, chunk);
    } catch (error) {
      result.failed.push(...chunk);
      console.error('[dataService:media-cleanup-query]', error);
      continue;
    }
    const owned = registeredFileIDs(chunk, records.filter((item) => options.force || item.status === 'deleting'));
    const unowned = chunk.filter((fileID) => !owned.includes(fileID));
    if (options.force) result.failed.push(...unowned);
    else result.retained.push(...unowned);
    if (!owned.length) continue;
    let response;
    try {
      response = await cloud.deleteFile({ fileList: owned });
    } catch (error) {
      result.failed.push(...owned);
      console.error('[dataService:media-cloud-delete]', error);
      for (const record of records.filter((item) => owned.includes(item.fileID) && item.status === 'deleting')) {
        try {
          await db.collection(COLLECTIONS.mediaAssets).doc(record._id).update({
            data: { status: 'ready', updatedAt: db.serverDate() }
          });
        } catch (restoreError) {
          console.error('[dataService:media-cleanup-restore]', restoreError);
        }
      }
      continue;
    }
    const outcome = deletionOutcome(owned, response);
    result.failed.push(...outcome.failed);
    for (const fileID of outcome.failed) {
      const record = records.find((item) => item.fileID === fileID);
      if (record && record.status === 'deleting') {
        try {
          await db.collection(COLLECTIONS.mediaAssets).doc(record._id).update({
            data: { status: 'ready', updatedAt: db.serverDate() }
          });
        } catch (restoreError) {
          console.error('[dataService:media-cleanup-restore]', restoreError);
        }
      }
    }
    if (outcome.deleted.length) {
      try {
        await db.collection(COLLECTIONS.mediaAssets).where({
          _openid: openid,
          fileID: command.in(outcome.deleted)
        }).remove();
        result.deleted += outcome.deleted.length;
      } catch (error) {
        // The cloud objects are gone. Keep their registrations in `deleting`
        // so a later cleanup can remove the stale records without reusing them.
        result.failed.push(...outcome.deleted);
        console.error('[dataService:media-registration-cleanup]', error);
      }
    }
  }
  result.failed = [...new Set(result.failed)];
  result.retained = [...new Set(result.retained)];
  return result;
}

async function listOwnedFileIDs(openid) {
  const fileIDs = [];
  for (let page = 0; ; page += 1) {
    const response = await db.collection(COLLECTIONS.mediaAssets).where({ _openid: openid }).skip(page * 100).limit(100).get();
    const batch = response.data || [];
    fileIDs.push(...batch.map((item) => item.fileID));
    if (batch.length < 100) break;
  }
  return fileIDs;
}


async function listMemories(openid, payload) {
  const where = { _openid: openid, _deleted: command.neq(true) };
  if (payload.category) where.category = payload.category;
  if (payload.date) where.date = payload.date;
  if (payload.beforeDate) where.date = command.lte(payload.beforeDate);
  const paged = Object.prototype.hasOwnProperty.call(payload, 'offset');
  const limit = paged ? (payload.limit ? number(payload.limit, 1, 100) : 100) : (payload.limit ? number(payload.limit, 1, 300) : 200);
  const offset = Number.isSafeInteger(payload.offset) && payload.offset >= 0 ? payload.offset : 0;
  const result = { data: [] };
  while (result.data.length < limit) {
    const size = Math.min(100, limit - result.data.length);
    const page = await db.collection(COLLECTIONS.memories).where(where).orderBy('occurredAt', 'desc').orderBy('_id', 'desc').skip(offset + result.data.length).limit(size).get();
    result.data.push(...(page.data || []));
    if ((page.data || []).length < size) break;
  }
  let items = (result.data || []).filter((item) => !item._deleted).map(visibleDoc);
  if (payload.keyword) {
    const keyword = text(payload.keyword, 80).toLowerCase();
    items = items.filter((item) => `${item.title} ${item.content} ${(item.tags || []).join(' ')} ${item.location?.name || ''}`.toLowerCase().includes(keyword));
  }
  return ok(items, { nextOffset: (result.data || []).length === limit ? offset + limit : null });
}

async function main(event, openid) {
  const action = text(event.action, 60);
  const payload = event.payload || {};
  if (action.startsWith('material.')) {
    if (event.httpMethod || event.headers || event.body) return fail('资料仅支持微信内使用', 'NO_OPENID');
    if (action === 'material.capabilities') return ok({ protocol: 'materials-v1', storageConfigured: Boolean(process.env.MATERIAL_STORAGE_AUTHORITY) });
    if (action === 'material.register') {
      const safe = validateMaterialFile(openid, payload.fileID);
      const assetId = crypto.createHash('sha256').update(`material:${openid}:${payload.fileID}`).digest('hex');
      await db.runTransaction(async (tx) => {
        const ref = tx.collection(COLLECTIONS.mediaAssets).doc(assetId);
        const prior = (await ref.get()).data;
        if (prior) {
          if (prior._openid !== openid || prior.status !== 'ready') throw new Error('资料已清理，请重新导入');
          return;
        }
        await ref.set({ data: { _openid: openid, fileID: payload.fileID, cloudPath: safe.cloudPath, type: safe.kind === 'image' ? 'image' : 'file', size: number(payload.size, 0, 8 * 1024 * 1024), references: [], status: 'ready', createdAt: db.serverDate() } });
      });
      return ok(true);
    }
    return ok(await materialWorkspaces(openid, action, payload));
  }
  switch (action) {
    case 'system.ping': return ok({ service: 'dataService', authenticated: true });
    case 'media.prepare': return ok({ prefix: mediaPrefix(openid) });
    case 'media.register': {
      const fileID = text(payload.fileID, 500);
      const cloudPath = text(payload.cloudPath, 500);
      if (!fileID.startsWith('cloud://')) return fail('只能登记微信云存储文件');
      if (!cloudPath.startsWith(`${mediaPrefix(openid)}/`) || !fileID.endsWith(cloudPath)) {
        return fail('不能登记不属于当前用户的云文件', 'MEDIA_NOT_OWNED');
      }
      const existing = await db.collection(COLLECTIONS.mediaAssets).where({ _openid: openid, fileID }).limit(1).get();
      if (existing.data && existing.data[0]) return ok(existing.data[0]);
      const data = {
        _openid: openid,
        fileID,
        cloudPath,
        type: ['image', 'video', 'audio'].includes(payload.type) ? payload.type : 'image',
        size: number(payload.size, 0, 100 * 1024 * 1024),
        references: [],
        status: 'ready',
        createdAt: db.serverDate()
      };
      const result = await db.collection(COLLECTIONS.mediaAssets).add({ data });
      return ok({ ...data, _id: result._id });
    }
    case 'media.cleanup': {
      const fileIDs = uniqueCloudFileIDs(Array.isArray(payload.fileIDs) ? payload.fileIDs.slice(0, 50) : []);
      const claimed = await claimUnreferencedMedia(openid, fileIDs);
      const deletion = await deleteOwnedCloudFiles(openid, claimed.claimed);
      return ok(true, {
        mediaCleanup: {
          requested: fileIDs.length,
          deleted: deletion.deleted,
          retained: [...new Set([...claimed.retained, ...deletion.retained])],
          failed: [...new Set([...claimed.failed, ...deletion.failed])]
        }
      });
    }
    case 'memory.list': return listMemories(openid, payload);
    case 'memory.get': return ok(visibleDoc(await ownedDoc(COLLECTIONS.memories, payload.id, openid)));
    case 'memory.create': {
      const safe = sanitizeMemory(payload);
      const operation = payload.requestId ? creation(openid, 'memory', payload.requestId, safe) : null;
      if (operation) {
        const replay = replayCreation((await db.collection(COLLECTIONS.memories).doc(operation.id).get()).data, openid, operation.receipt);
        if (replay) return ok(replay);
      }
      const records = await assertOwnedMedia(openid, safe.media);
      const requestedId = text(payload._id, 100);
      const id = operation ? operation.id : /^memory-\d+-[a-z0-9]{6}$/i.test(requestedId)
        ? requestedId
        : `memory-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const data = { ...safe, _openid: openid, ...(operation ? { _creation: operation.receipt } : {}), revision: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() };
      const result = await syncMediaReferences(openid, `memory:${id}`, [], safe.media.map((item) => item.fileID), records, async (transaction) => {
        const ref = transaction.collection(COLLECTIONS.memories).doc(id);
        const existing = await ref.get();
        if (existing.data) throw new Error('记忆 ID 已存在，请重新保存');
        await ref.set({ data });
      }, operation ? async (transaction) => replayCreation((await transaction.collection(COLLECTIONS.memories).doc(id).get()).data, openid, operation.receipt) : null);
      return ok(result.replay || visibleDoc({ ...data, _id: id }));
    }
    case 'memory.update': {
      const id = payload._id || payload.id;
      const previous = await ownedDoc(COLLECTIONS.memories, id, openid);
      const safe = sanitizeMemory(payload);
      const receipt = payload.requestId ? creation(openid, 'memory-update', payload.requestId, safe).receipt : null;
      const baseRevision = Number.isSafeInteger(payload.revision) ? payload.revision : 0;
      const checkUpdate = (current) => {
        if (!current || current._openid !== openid || current._deleted) throw requestError('记忆已删除或无权修改', 'WRITE_DELETED');
        if (receipt && current._lastWrite?.requestId === receipt.requestId) {
          if (current._lastWrite.hash !== receipt.hash) throw requestError('同一编辑请求的内容已变化');
          return visibleDoc(current);
        }
        if ((current.revision || 0) !== baseRevision) throw requestError('记忆已在其他设备更新，请先核对最新内容');
        return null;
      };
      const replay = checkUpdate(previous);
      if (replay) return ok(replay);
      const nextIDs = safe.media.map((item) => item.fileID);
      const previousIDs = (previous.media || []).map((item) => item.fileID);
      const nextRecords = await assertOwnedMedia(openid, safe.media);
      const previousRecords = await loadOwnedAssets(openid, previousIDs);
      const recordMap = new Map([...previousRecords, ...nextRecords].map((item) => [item.fileID, item]));
      const data = { ...safe, revision: baseRevision + 1, _lastWrite: receipt, updatedAt: db.serverDate() };
      const references = await syncMediaReferences(openid, `memory:${id}`, previousIDs, nextIDs, [...recordMap.values()], async (transaction) => {
        const ref = transaction.collection(COLLECTIONS.memories).doc(id);
        const current = await ref.get();
        if (!current.data || current.data._openid !== openid || current.data._deleted) throw new Error('没有权限修改这条记忆或记忆已删除');
        if (!sameFileIDs((current.data.media || []).map((item) => item.fileID), previousIDs)) {
          throw new Error('这条记忆已在其他设备更新，请重新打开后再修改');
        }
        await ref.update({ data });
      }, async (transaction) => checkUpdate((await transaction.collection(COLLECTIONS.memories).doc(id).get()).data));
      if (references.replay) return ok(references.replay);
      const deletion = await deleteOwnedCloudFiles(openid, references.claimed);
      const removedIDs = previousIDs.filter((fileID) => !new Set(nextIDs).has(fileID));
      const registered = new Set(previousRecords.map((item) => item.fileID));
      const mediaCleanup = {
        requested: uniqueCloudFileIDs(removedIDs).length,
        deleted: deletion.deleted,
        retained: [...new Set([...references.retained, ...deletion.retained])],
        failed: [...new Set([...deletion.failed, ...removedIDs.filter((fileID) => !registered.has(fileID))])]
      };
      return ok(visibleDoc({ ...data, _id: id }), { mediaCleanup });
    }
    case 'memory.delete': {
      const memory = (await db.collection(COLLECTIONS.memories).doc(payload.id).get()).data;
      if (!memory || memory._openid !== openid) throw new Error('没有权限删除这条记忆');
      if (memory._deleted) return ok(true);
      const previousIDs = (memory.media || []).map((item) => item.fileID);
      const records = await loadOwnedAssets(openid, previousIDs);
      const references = await syncMediaReferences(openid, `memory:${payload.id}`, previousIDs, [], records, async (transaction) => {
        const ref = transaction.collection(COLLECTIONS.memories).doc(payload.id);
        const current = await ref.get();
        if (!current.data || current.data._openid !== openid) throw new Error('没有权限删除这条记忆');
        if (current.data._deleted) return;
        if (!sameFileIDs((current.data.media || []).map((item) => item.fileID), previousIDs)) {
          throw new Error('这条记忆已在其他设备更新，请重新打开后再删除');
        }
        if (current.data._creation) await ref.set({ data: tombstone(current.data) });
        else await ref.remove();
      }, async (transaction) => {
        const current = (await transaction.collection(COLLECTIONS.memories).doc(payload.id).get()).data;
        if (!current || current._openid !== openid) throw new Error('没有权限删除这条记忆');
        if (current._deleted) return true;
        if (!sameFileIDs((current.media || []).map((item) => item.fileID), previousIDs)) {
          throw new Error('这条记忆已在其他设备更新，请重新打开后再删除');
        }
        return null;
      });
      if (references.replay) return ok(true);
      const deletion = await deleteOwnedCloudFiles(openid, references.claimed);
      const registered = new Set(records.map((item) => item.fileID));
      const mediaCleanup = {
        requested: uniqueCloudFileIDs(previousIDs).length,
        deleted: deletion.deleted,
        retained: [...new Set([...references.retained, ...deletion.retained])],
        failed: [...new Set([...deletion.failed, ...previousIDs.filter((fileID) => !registered.has(fileID))])]
      };
      return ok(true, { mediaCleanup });
    }
    case 'goal.list': {
      const paged = Object.prototype.hasOwnProperty.call(payload, 'offset');
      const offset = Number.isSafeInteger(payload.offset) && payload.offset >= 0 ? payload.offset : 0;
      const result = await db.collection(COLLECTIONS.goals).where({ _openid: openid, _deleted: command.neq(true) }).orderBy('createdAt', 'asc').orderBy('_id', 'asc').skip(paged ? offset : 0).limit(100).get();
      const raw = result.data || [];
      const items = raw.filter((item) => !item._deleted).map(visibleDoc);
      return ok(items, paged ? { nextOffset: raw.length === 100 ? offset + 100 : null } : {});
    }
    case 'goal.create': {
      const safe = sanitizeGoal(payload);
      if (payload.requestId) {
        const operation = creation(openid, 'goal', payload.requestId, safe);
        const result = await db.runTransaction(async (tx) => {
          const ref = tx.collection(COLLECTIONS.goals).doc(operation.id);
          const existing = (await ref.get()).data;
          const replay = replayCreation(existing, openid, operation.receipt);
          if (replay) return replay;
          const data = { ...safe, _openid: openid, _creation: operation.receipt, revision: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() };
          await ref.set({ data }); return visibleDoc({ ...data, _id: operation.id });
        });
        return ok(result);
      }
      const data = { ...safe, _openid: openid, createdAt: db.serverDate(), updatedAt: db.serverDate() };
      const result = await db.collection(COLLECTIONS.goals).add({ data });
      return ok({ ...data, _id: result._id });
    }
    case 'goal.update': {
      const id = payload._id || payload.id;
      const result = await db.runTransaction(async (tx) => {
        const ref = tx.collection(COLLECTIONS.goals).doc(id), current = (await ref.get()).data;
        if (!current || current._openid !== openid || current._deleted) throw requestError('目标不存在', 'WRITE_DELETED');
        if ((payload.revision || 0) !== (current.revision || 0)) throw requestError('目标已更新，请重新打开后修改');
        const safe = sanitizeGoal(payload);
        if (safe.current !== Number(current.current || 0)) throw requestError('请使用新版进度按钮更新目标');
        const data = { ...safe, current: Math.min(safe.target, Number(current.current || 0)), revision: (current.revision || 0) + 1, updatedAt: db.serverDate() };
        await ref.update({ data }); return visibleDoc({ ...current, ...data, _id: id });
      });
      return ok(result);
    }
    case 'goal.increment': {
      const token = requestToken(payload.requestId);
      const result = await db.runTransaction(async (tx) => {
        const ref = tx.collection(COLLECTIONS.goals).doc(payload.id), current = (await ref.get()).data;
        if (!current || current._openid !== openid || current._deleted) throw requestError('目标不存在', 'WRITE_DELETED');
        const receipts = (current._stepRequests || []).filter((entry) => entry.issuedAt >= Date.now() - REQUEST_WINDOW);
        if (receipts.some((entry) => entry.value === token.value)) return visibleDoc(current);
        if (receipts.length >= 256) throw requestError('今天进度更新次数已达上限，请明天再试', 'WRITE_LIMIT');
        const data = { current: Math.min(Number(current.target), Number(current.current || 0) + 1), revision: (current.revision || 0) + 1,
          _stepRequests: [...receipts, token], updatedAt: db.serverDate() };
        await ref.update({ data }); return visibleDoc({ ...current, ...data });
      });
      return ok(result);
    }
    case 'goal.delete': {
      await db.runTransaction(async (tx) => {
        const ref = tx.collection(COLLECTIONS.goals).doc(payload.id), current = (await ref.get()).data;
        if (!current || current._openid !== openid) throw requestError('目标不存在', 'WRITE_DELETED');
        if (current._creation) await ref.set({ data: tombstone(current) }); else await ref.remove();
      });
      return ok(true);
    }
    case 'profile.get': {
      const result = await db.collection(COLLECTIONS.profiles).where({ _openid: openid }).limit(1).get();
      return ok(result.data?.[0] || null);
    }
    case 'profile.save': {
      const safe = {
        nickname: text(payload.nickname, 32) || 'SuiYuan',
        avatarUrl: text(payload.avatarUrl, 500),
        summerStart: text(payload.summerStart, 10),
        summerEnd: text(payload.summerEnd, 10),
        motto: text(payload.motto, 160),
        updatedAt: db.serverDate()
      };
      const existing = await db.collection(COLLECTIONS.profiles).where({ _openid: openid }).limit(1).get();
      const previous = existing.data && existing.data[0];
      const id = previous ? previous._id : `profile-${crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32)}`;
      const previousIDs = previous && String(previous.avatarUrl || '').startsWith('cloud://') ? [previous.avatarUrl] : [];
      const nextIDs = safe.avatarUrl.startsWith('cloud://') ? [safe.avatarUrl] : [];
      const nextRecords = nextIDs.length ? await assertOwnedMedia(openid, [{ fileID: safe.avatarUrl }]) : [];
      const previousRecords = await loadOwnedAssets(openid, previousIDs);
      const recordMap = new Map([...previousRecords, ...nextRecords].map((item) => [item.fileID, item]));
      const profileData = { ...safe, _openid: openid, ...(previous ? {} : { createdAt: db.serverDate() }) };
      const references = await syncMediaReferences(openid, `profile:${id}`, previousIDs, nextIDs, [...recordMap.values()], async (transaction) => {
        const ref = transaction.collection(COLLECTIONS.profiles).doc(id);
        const current = await ref.get();
        if (previous) {
          if (!current.data || current.data._openid !== openid || current.data.avatarUrl !== previous.avatarUrl) {
            throw new Error('个人信息已在其他设备更新，请重新打开后再保存');
          }
          await ref.update({ data: safe });
        } else {
          if (current.data) throw new Error('个人信息已创建，请重新打开后再保存');
          await ref.set({ data: profileData });
        }
      });
      const deletion = await deleteOwnedCloudFiles(openid, references.claimed);
      const removedIDs = previousIDs.filter((fileID) => !new Set(nextIDs).has(fileID));
      const registered = new Set(previousRecords.map((item) => item.fileID));
      const mediaCleanup = {
        requested: uniqueCloudFileIDs(removedIDs).length,
        deleted: deletion.deleted,
        retained: [...new Set([...references.retained, ...deletion.retained])],
        failed: [...new Set([...deletion.failed, ...removedIDs.filter((fileID) => !registered.has(fileID))])]
      };
      return ok({ ...safe, _id: id, _openid: openid }, { mediaCleanup });
    }
    case 'step.save': {
      const safe = {
        steps: number(payload.steps, 0, 200000),
        date: text(payload.date, 10),
        history: Array.isArray(payload.history) ? payload.history.slice(-31) : [],
        source: 'wechat-werun',
        updatedAt: db.serverDate()
      };
      const existing = await db.collection(COLLECTIONS.steps).where({ _openid: openid, date: safe.date }).limit(1).get();
      if (existing.data?.[0]) await db.collection(COLLECTIONS.steps).doc(existing.data[0]._id).update({ data: safe });
      else await db.collection(COLLECTIONS.steps).add({ data: { ...safe, _openid: openid } });
      return ok(safe);
    }
    case 'reset.mine': {
      const fileIDs = await listOwnedFileIDs(openid);
      const mediaCleanup = await deleteOwnedCloudFiles(openid, fileIDs, { force: true });
      await Promise.all([
        clearRecordsWithReceipts(COLLECTIONS.memories, openid),
        clearRecordsWithReceipts(COLLECTIONS.goals, openid),
        db.collection(COLLECTIONS.profiles).where({ _openid: openid }).remove(),
        db.collection(COLLECTIONS.steps).where({ _openid: openid }).remove(),
        db.collection('material_workspaces').where({ _openid: openid }).remove()
      ]);
      return ok(true, { mediaCleanup });
    }
    default: return fail(`未知 action：${action}`);
  }
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail('无法识别当前微信用户', 'NO_OPENID');
    return await main(event, OPENID);
  } catch (error) {
    if (['WRITE_CONFLICT', 'WRITE_INVALID', 'WRITE_EXPIRED', 'WRITE_DELETED', 'WRITE_LIMIT'].includes(error.code)) return fail(error.message, error.code);
    if (String(event.action || '').startsWith('material.')) {
      const known = ['MATERIAL_INVALID', 'MATERIAL_CONFLICT', 'MATERIAL_NOT_CONFIGURED', 'MEDIA_NOT_OWNED'].includes(error.code);
      return fail(known ? error.message : '资料服务暂不可用，请检查云端部署和资料集合', known ? error.code : 'MATERIAL_SERVICE_UNAVAILABLE');
    }
    console.error('[dataService]', error);
    return fail(error.message || '数据服务执行失败', 'SERVER_ERROR');
  }
};
