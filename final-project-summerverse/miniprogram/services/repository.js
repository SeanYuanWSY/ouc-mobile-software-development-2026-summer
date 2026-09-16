const storage = require('../utils/storage');
const { STORAGE_KEYS, DEFAULT_PROFILE } = require('../utils/constants');
const { normalizeMemory, normalizeGoal } = require('../utils/validate');
const { toTimestamp } = require('../utils/date');
const { callFunction, isCloudReady, waitForCloudReady, dataMode, cachedRead, invalidateReads } = require('./cloud');
const demoData = require('./demo-data');
const mediaService = require('./media');

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeRequestId() { return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`; }

function sortMemories(items) {
  return [...items].sort((a, b) => toTimestamp(b) - toTimestamp(a));
}

function getLocalMemories() {
  return sortMemories(storage.get(STORAGE_KEYS.MEMORIES, []));
}

function saveLocalMemories(items) {
  if (!storage.set(STORAGE_KEYS.MEMORIES, sortMemories(items))) throw new Error('本机记忆写入失败，请检查存储空间');
}

function getLocalGoals() {
  return storage.get(STORAGE_KEYS.GOALS, []);
}

function saveLocalGoals(items) {
  if (!storage.set(STORAGE_KEYS.GOALS, items)) throw new Error('本机目标写入失败，请检查存储空间');
}

function mediaPath(item) {
  return item && (item.localPath || item.url || item.fileID) || '';
}

function localReferences(memories, profile) {
  const references = new Set();
  memories.forEach((memory) => (memory.media || []).forEach((item) => {
    const value = mediaPath(item);
    if (value) references.add(value);
  }));
  if (profile && profile.avatarUrl) references.add(profile.avatarUrl);
  return references;
}

function withCleanup(data, mediaCleanup) {
  return mediaCleanup ? { ...data, _mediaCleanup: mediaCleanup } : data;
}

function savedDocument(response) {
  const value = response?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value._id !== 'string' || !value._id.trim()) {
    throw Object.assign(new Error('云端返回了不完整的数据，保存结果尚未确认'), { code: 'CLOUD_INVALID_RESPONSE', outcomeUnknown: true });
  }
  return value;
}

async function cloudOrLocal(cloudTask, localTask, options = {}) {
  if (await dataMode() === 'cloud') {
    try {
      const result = await cloudTask();
      if (result !== undefined) return { data: result, mode: 'cloud' };
      throw Object.assign(new Error('云端返回了不完整的数据，请重试或更新小程序'), { outcomeUnknown: true });
    } catch (error) {
      console.warn('[repository] cloud request failed:', error);
      throw error;
    }
  }
  return { data: await localTask(), mode: 'local' };
}

function listMemories(filters = {}, options = {}) {
  return cachedRead('memories', JSON.stringify(filters), () => readMemories(filters), options);
}

async function readMemories(filters = {}) {
  return cloudOrLocal(
    async () => {
      const items = [];
      const seen = new Set();
      let offset = 0;
      do {
        const res = await callFunction('dataService', {
          action: 'memory.list', payload: { ...filters, offset, limit: 100 }
        });
        if (!Object.prototype.hasOwnProperty.call(res, 'nextOffset')) throw new Error('云端数据服务需要更新，请联系开发者');
        for (const item of res.data || []) {
          if (!seen.has(item._id)) { items.push(item); seen.add(item._id); }
        }
        if (filters.limit > 0 && items.length >= filters.limit) return items.slice(0, filters.limit);
        if (res.nextOffset == null) break;
        if (!Number.isSafeInteger(res.nextOffset) || res.nextOffset <= offset) throw new Error('记录分页异常，请重试');
        offset = res.nextOffset;
      } while (true);
      return items;
    },
    async () => {
      let items = getLocalMemories();
      if (filters.category) items = items.filter((item) => item.category === filters.category);
      if (filters.date) items = items.filter((item) => item.date === filters.date);
      if (filters.beforeDate) items = items.filter((item) => item.date <= filters.beforeDate);
      if (filters.keyword) {
        const keyword = String(filters.keyword).toLowerCase();
        items = items.filter((item) => `${item.title} ${item.content} ${(item.tags || []).join(' ')}`.toLowerCase().includes(keyword));
      }
      return filters.limit > 0 ? items.slice(0, filters.limit) : items;
    },
    { cloudOnly: true }
  );
}

async function getMemory(id) {
  if (!id) return { data: null, mode: 'local' };
  return cloudOrLocal(
    async () => {
      const res = await callFunction('dataService', { action: 'memory.get', payload: { id } });
      return res.data || null;
    },
    async () => getLocalMemories().find((item) => item._id === id || item.id === id) || null,
    { cloudOnly: true }
  );
}

async function saveMemory(input) {
  const memory = normalizeMemory(input);
  if (!memory._id) memory._id = makeId('memory');
  return cloudOrLocal(
    async () => {
      const action = input._id ? 'memory.update' : 'memory.create';
      const res = await callFunction('dataService', { action, payload: { ...memory, requestId: input.requestId || '', revision: input.revision || 0 } });
      return withCleanup(savedDocument(res), res.mediaCleanup);
    },
    async () => {
      const items = getLocalMemories();
      const index = items.findIndex((item) => item._id === memory._id);
      const previous = index >= 0 ? items[index] : null;
      if (index >= 0) items[index] = memory;
      else items.push(memory);
      saveLocalMemories(items);
      if (!previous) return memory;
      const references = localReferences(items, storage.get(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE));
      const removed = (previous.media || []).filter((item) => !references.has(mediaPath(item)));
      return withCleanup(memory, await mediaService.deleteLocalFiles(removed));
    },
    { cloudOnly: true }
  );
}

async function deleteMemory(id) {
  return cloudOrLocal(
    async () => {
      const res = await callFunction('dataService', { action: 'memory.delete', payload: { id } });
      return { deleted: true, mediaCleanup: res.mediaCleanup || null };
    },
    async () => {
      const memories = getLocalMemories();
      const memory = memories.find((item) => item._id === id || item.id === id);
      const remaining = memories.filter((item) => item._id !== id && item.id !== id);
      saveLocalMemories(remaining);
      const references = localReferences(remaining, storage.get(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE));
      const candidates = (memory && memory.media || []).filter((item) => !references.has(mediaPath(item)));
      const mediaCleanup = await mediaService.deleteLocalFiles(candidates);
      mediaCleanup.retained = (memory && memory.media || []).map(mediaPath).filter((value) => value && references.has(value));
      return { deleted: true, mediaCleanup };
    },
    { cloudOnly: true }
  );
}

function listGoals(options = {}) { return cachedRead('goals', 'list', readGoals, options); }

async function readGoals() {
  return cloudOrLocal(
    async () => {
      const items = [], seen = new Set();
      let offset = 0;
      do {
        const res = await callFunction('dataService', { action: 'goal.list', payload: { offset, limit: 100 } });
        for (const goal of res.data || []) if (!seen.has(goal._id)) { seen.add(goal._id); items.push(goal); }
        if (res.nextOffset == null) break;
        if (!Number.isSafeInteger(res.nextOffset) || res.nextOffset <= offset) throw new Error('目标分页异常，请重试');
        offset = res.nextOffset;
      } while (true);
      return items;
    },
    async () => getLocalGoals(),
    { cloudOnly: true }
  );
}

async function saveGoal(input) {
  const goal = normalizeGoal(input);
  if (!goal._id) goal._id = makeId('goal');
  return cloudOrLocal(
    async () => {
      const action = input._id ? 'goal.update' : 'goal.create';
      const res = await callFunction('dataService', { action, payload: { ...goal, requestId: input.requestId || '', revision: input.revision || 0 } });
      return savedDocument(res);
    },
    async () => {
      const items = getLocalGoals();
      const index = items.findIndex((item) => item._id === goal._id);
      if (index >= 0) items[index] = goal;
      else items.push(goal);
      saveLocalGoals(items);
      return goal;
    },
    { cloudOnly: true }
  );
}

async function incrementGoal(id, requestId) {
  return cloudOrLocal(async () => savedDocument(await callFunction('dataService', { action: 'goal.increment', payload: { id, requestId } })),
    async () => {
      const items = getLocalGoals();
      const goal = items.find((item) => item._id === id);
      if (!goal) throw new Error('目标已删除');
      const receipts = Array.isArray(goal._increments) ? goal._increments : [];
      if (receipts.includes(requestId)) return goal;
      goal.current = Math.min(Number(goal.target), Number(goal.current) + 1);
      goal._increments = [...receipts, requestId];
      saveLocalGoals(items); return goal;
    }, { cloudOnly: true });
}

async function deleteGoal(id) {
  return cloudOrLocal(
    async () => {
      await callFunction('dataService', { action: 'goal.delete', payload: { id } });
      return true;
    },
    async () => {
      saveLocalGoals(getLocalGoals().filter((item) => item._id !== id));
      return true;
    },
    { cloudOnly: true }
  );
}

function getProfile(options = {}) { return cachedRead('profile', 'get', readProfile, options); }

async function readProfile() {
  return cloudOrLocal(
    async () => {
      const res = await callFunction('dataService', { action: 'profile.get', payload: {} });
      return res.data || DEFAULT_PROFILE;
    },
    async () => ({ ...DEFAULT_PROFILE, ...storage.get(STORAGE_KEYS.PROFILE, {}) }),
    { cloudOnly: true }
  );
}

async function saveProfile(profile) {
  const value = { ...DEFAULT_PROFILE, ...profile, updatedAt: new Date().toISOString() };
  return cloudOrLocal(
    async () => {
      const res = await callFunction('dataService', { action: 'profile.save', payload: value });
      return withCleanup(savedDocument(res), res.mediaCleanup);
    },
    async () => {
      const previous = storage.get(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE);
      if (!storage.set(STORAGE_KEYS.PROFILE, value)) throw new Error('本机个人信息写入失败，请检查存储空间');
      const references = localReferences(getLocalMemories(), value);
      const removedAvatar = previous.avatarUrl && previous.avatarUrl !== value.avatarUrl && !references.has(previous.avatarUrl)
        ? [{ url: previous.avatarUrl }]
        : [];
      return withCleanup(value, await mediaService.deleteLocalFiles(removedAvatar));
    },
    { cloudOnly: true }
  );
}

function getStepSnapshot() {
  return storage.get(STORAGE_KEYS.STEP, null);
}

async function saveStepSnapshot(snapshot) {
  if (!storage.set(STORAGE_KEYS.STEP, snapshot)) throw new Error('本机步数写入失败');
  if (isCloudReady()) {
    try { await callFunction('dataService', { action: 'step.save', payload: snapshot }); } catch (error) { console.warn(error); }
  }
  return snapshot;
}

function getWeatherSnapshot() {
  return storage.get(STORAGE_KEYS.WEATHER, null);
}

function saveWeatherSnapshot(snapshot) {
  if (!storage.set(STORAGE_KEYS.WEATHER, snapshot)) throw new Error('本机天气写入失败');
  return snapshot;
}

function getChatHistory() {
  return storage.get(STORAGE_KEYS.CHAT, []);
}

function saveChatHistory(messages) {
  storage.set(STORAGE_KEYS.CHAT, messages.slice(-40));
}

async function importDemoData() {
  if (await dataMode() === 'cloud') throw new Error('云模式不能导入示例');
  const memories = getLocalMemories();
  const goals = getLocalGoals();
  const memoryIds = new Set(memories.map((item) => item._id));
  const goalIds = new Set(goals.map((item) => item._id));
  const newMemories = demoData.memories.filter((item) => !memoryIds.has(item._id));
  const newGoals = demoData.goals.filter((item) => !goalIds.has(item._id));
  saveLocalMemories([...memories, ...newMemories]);
  saveLocalGoals([...goals, ...newGoals]);
  storage.set(STORAGE_KEYS.DEMO_IMPORTED, true);
  return { memories: newMemories.length, goals: newGoals.length };
}

function clearDemoData() {
  saveLocalMemories(getLocalMemories().filter((item) => item.source !== 'demo'));
  saveLocalGoals(getLocalGoals().filter((item) => !String(item._id).startsWith('demo-')));
  storage.remove(STORAGE_KEYS.DEMO_IMPORTED);
}

function exportLocalData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    memories: getLocalMemories(),
    goals: getLocalGoals(),
    profile: storage.get(STORAGE_KEYS.PROFILE, DEFAULT_PROFILE),
    step: getStepSnapshot(),
    weather: getWeatherSnapshot()
  };
}

function importLocalData(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.memories)) throw new Error('备份文件格式不正确');
  saveLocalMemories(payload.memories.map(normalizeMemory));
  saveLocalGoals((payload.goals || []).map(normalizeGoal));
  if (payload.profile) storage.set(STORAGE_KEYS.PROFILE, payload.profile);
  if (payload.step) storage.set(STORAGE_KEYS.STEP, payload.step);
  if (payload.weather) storage.set(STORAGE_KEYS.WEATHER, payload.weather);
}

function mutation(resources, task) {
  return async (...args) => {
    resources.forEach(invalidateReads);
    try { return await task(...args); }
    finally { resources.forEach(invalidateReads); }
  };
}

module.exports = {
  listMemories,
  getMemory,
  saveMemory: mutation(['memories'], saveMemory),
  deleteMemory: mutation(['memories'], deleteMemory),
  listGoals,
  saveGoal: mutation(['goals'], saveGoal),
  incrementGoal: mutation(['goals'], incrementGoal),
  makeRequestId,
  deleteGoal: mutation(['goals'], deleteGoal),
  getProfile,
  saveProfile: mutation(['profile'], saveProfile),
  getStepSnapshot,
  saveStepSnapshot,
  getWeatherSnapshot,
  saveWeatherSnapshot,
  getChatHistory,
  saveChatHistory,
  importDemoData: mutation(['memories', 'goals'], importDemoData),
  clearDemoData() { try { return clearDemoData(); } finally { invalidateReads('memories'); invalidateReads('goals'); } },
  exportLocalData,
  importLocalData(payload) { try { return importLocalData(payload); } finally { ['memories', 'goals', 'profile'].forEach(invalidateReads); } }
};
