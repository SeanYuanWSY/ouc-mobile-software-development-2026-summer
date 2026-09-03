const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;

const COLLECTIONS = {
  memories: 'memories',
  goals: 'goals',
  profiles: 'profiles',
  steps: 'step_snapshots'
};

function ok(data, extra = {}) { return { ok: true, data, ...extra }; }
function fail(message, code = 'BAD_REQUEST') { return { ok: false, error: message, code }; }
function text(value, max = 500) { return String(value || '').trim().slice(0, max); }
function number(value, min = 0, max = 999999) { return Math.max(min, Math.min(max, Number(value) || 0)); }

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
  if (!result.data || result.data._openid !== openid) throw new Error('没有权限访问这条数据');
  return result.data;
}

async function listMemories(openid, payload) {
  const where = { _openid: openid };
  if (payload.category) where.category = payload.category;
  if (payload.date) where.date = payload.date;
  if (payload.beforeDate) where.date = command.lte(payload.beforeDate);
  const limit = payload.limit ? number(payload.limit, 1, 300) : 200;
  const result = await db.collection(COLLECTIONS.memories).where(where).orderBy('occurredAt', 'desc').limit(limit).get();
  let items = result.data || [];
  if (payload.keyword) {
    const keyword = text(payload.keyword, 80).toLowerCase();
    items = items.filter((item) => `${item.title} ${item.content} ${(item.tags || []).join(' ')} ${item.location?.name || ''}`.toLowerCase().includes(keyword));
  }
  return items;
}

async function main(event, openid) {
  const action = text(event.action, 60);
  const payload = event.payload || {};
  switch (action) {
    case 'memory.list': return ok(await listMemories(openid, payload));
    case 'memory.get': return ok(await ownedDoc(COLLECTIONS.memories, payload.id, openid));
    case 'memory.create': {
      const data = { ...sanitizeMemory(payload), _openid: openid, createdAt: db.serverDate(), updatedAt: db.serverDate() };
      const result = await db.collection(COLLECTIONS.memories).add({ data });
      return ok({ ...data, _id: result._id });
    }
    case 'memory.update': {
      await ownedDoc(COLLECTIONS.memories, payload._id || payload.id, openid);
      const id = payload._id || payload.id;
      const data = { ...sanitizeMemory(payload), updatedAt: db.serverDate() };
      await db.collection(COLLECTIONS.memories).doc(id).update({ data });
      return ok({ ...data, _id: id });
    }
    case 'memory.delete': {
      await ownedDoc(COLLECTIONS.memories, payload.id, openid);
      await db.collection(COLLECTIONS.memories).doc(payload.id).remove();
      return ok(true);
    }
    case 'goal.list': {
      const result = await db.collection(COLLECTIONS.goals).where({ _openid: openid }).orderBy('createdAt', 'asc').limit(100).get();
      return ok(result.data || []);
    }
    case 'goal.create': {
      const data = { ...sanitizeGoal(payload), _openid: openid, createdAt: db.serverDate(), updatedAt: db.serverDate() };
      const result = await db.collection(COLLECTIONS.goals).add({ data });
      return ok({ ...data, _id: result._id });
    }
    case 'goal.update': {
      const id = payload._id || payload.id;
      await ownedDoc(COLLECTIONS.goals, id, openid);
      const data = { ...sanitizeGoal(payload), updatedAt: db.serverDate() };
      await db.collection(COLLECTIONS.goals).doc(id).update({ data });
      return ok({ ...data, _id: id });
    }
    case 'goal.delete': {
      await ownedDoc(COLLECTIONS.goals, payload.id, openid);
      await db.collection(COLLECTIONS.goals).doc(payload.id).remove();
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
      if (existing.data?.[0]) {
        const id = existing.data[0]._id;
        await db.collection(COLLECTIONS.profiles).doc(id).update({ data: safe });
        return ok({ ...safe, _id: id, _openid: openid });
      }
      const result = await db.collection(COLLECTIONS.profiles).add({ data: { ...safe, _openid: openid, createdAt: db.serverDate() } });
      return ok({ ...safe, _id: result._id, _openid: openid });
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
      await Promise.all([
        db.collection(COLLECTIONS.memories).where({ _openid: openid }).remove(),
        db.collection(COLLECTIONS.goals).where({ _openid: openid }).remove(),
        db.collection(COLLECTIONS.profiles).where({ _openid: openid }).remove(),
        db.collection(COLLECTIONS.steps).where({ _openid: openid }).remove()
      ]);
      return ok(true);
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
    console.error('[dataService]', error);
    return fail(error.message || '数据服务执行失败', 'SERVER_ERROR');
  }
};
