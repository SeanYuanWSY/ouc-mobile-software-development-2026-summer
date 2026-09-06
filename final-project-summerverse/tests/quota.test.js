const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTION_CREDITS,
  creditCost,
  readQuotaConfig,
  timeWindow,
  evaluateQuota,
  reserveAiMinute,
  reserveAiQuota
} = require('../cloudfunctions/deepseekProxy/quota');

const config = { perMinute: 2, perDay: 3, creditsPerDay: 5, globalCreditsPerDay: 8, timeZone: 'Asia/Shanghai' };
const window = { date: '2026-09-04', minuteKey: '2026-09-04T10:00', second: 20 };

test('ping 也会消耗 AI 额度', () => {
  assert.equal(ACTION_CREDITS.ping, 1);
  assert.equal(ACTION_CREDITS.visionMemory, 8);
});

test('Pro 模型使用双倍额度权重', () => {
  assert.equal(creditCost('chat', 'deepseek-v4-flash'), 2);
  assert.equal(creditCost('chat', 'deepseek-v4-pro'), 4);
});

test('AI 限额配置非法时关闭请求', () => {
  assert.throws(() => readQuotaConfig({ AI_MAX_REQUESTS_PER_DAY: '0' }), (error) => error.code === 'AI_QUOTA_CONFIG_INVALID');
  assert.throws(() => readQuotaConfig({ AI_QUOTA_TIMEZONE: 'Mars/Base' }), (error) => error.code === 'AI_QUOTA_CONFIG_INVALID');
});

test('额度计数同时更新用户和全局文档', () => {
  const next = evaluateQuota({}, {}, { credits: 2, config, window });
  assert.equal(next.user.minuteRequests, 1);
  assert.equal(next.user.dailyRequests, 1);
  assert.equal(next.user.dailyCredits, 2);
  assert.equal(next.global.dailyCredits, 2);
});

test('自带临时 Key 不消耗共享全局额度', () => {
  const next = evaluateQuota({}, { dailyCredits: 999 }, { credits: 2, config, window, includeGlobal: false });
  assert.equal(next.user.dailyCredits, 2);
  assert.equal(next.global, null);
});

test('视觉下载前已占用的分钟次数不会在 credits 阶段重复增加', () => {
  const next = evaluateQuota(
    { minuteKey: window.minuteKey, minuteRequests: 1 },
    {},
    { credits: 8, config: { ...config, creditsPerDay: 10 }, window, requestAlreadyReserved: true }
  );
  assert.equal(next.user.minuteRequests, 1);
  assert.equal(next.user.dailyRequests, 1);
  assert.equal(next.user.dailyCredits, 8);
});

test('视觉下载前的分钟占位使用事务并阻止超额下载', async () => {
  const documents = new Map();
  const db = {
    serverDate: () => 'server-date',
    runTransaction: async (task) => task({
      collection: () => ({
        doc: (id) => ({
          get: async () => ({ data: documents.get(id) || null }),
          set: async ({ data }) => documents.set(id, data)
        })
      })
    })
  };
  const options = {
    openid: 'user', appId: 'app', action: 'visionMemory', model: 'deepseek-v4-flash-vision-exp',
    now: new Date('2026-09-04T02:00:20Z'),
    env: { AI_MAX_REQUESTS_PER_MINUTE: '1', AI_QUOTA_TIMEZONE: 'Asia/Shanghai' }
  };
  await reserveAiMinute(db, options);
  await assert.rejects(() => reserveAiMinute(db, options), (error) => error.code === 'AI_RATE_LIMITED' && error.scope === 'minute');
});

test('视觉文件下载前同时检查每日 credits 余额', async () => {
  const documents = new Map();
  const db = {
    serverDate: () => 'server-date',
    runTransaction: async (task) => task({
      collection: () => ({
        doc: (id) => ({
          get: async () => ({ data: documents.get(id) || null }),
          set: async ({ data }) => documents.set(id, data)
        })
      })
    })
  };
  await assert.rejects(() => reserveAiMinute(db, {
    openid: 'user', appId: 'app', action: 'visionMemory', model: 'deepseek-v4-flash-vision-exp',
    now: new Date('2026-09-04T02:00:20Z'), env: { AI_MAX_CREDITS_PER_DAY: '7' }
  }), (error) => error.code === 'AI_RATE_LIMITED' && error.scope === 'daily');
});

test('每分钟、每日和全局限额分别拒绝超额请求', () => {
  assert.throws(
    () => evaluateQuota({ minuteKey: window.minuteKey, minuteRequests: 2 }, {}, { credits: 1, config, window }),
    (error) => error.code === 'AI_RATE_LIMITED' && error.scope === 'minute' && error.retryAfterSeconds === 40
  );
  assert.throws(
    () => evaluateQuota({ dailyRequests: 3 }, {}, { credits: 1, config, window }),
    (error) => error.code === 'AI_RATE_LIMITED' && error.scope === 'daily'
  );
  assert.throws(
    () => evaluateQuota({}, { dailyCredits: 8 }, { credits: 1, config, window }),
    (error) => error.code === 'AI_RATE_LIMITED' && error.scope === 'global'
  );
});

test('限额时间窗口使用服务端时区', () => {
  const value = timeWindow(new Date('2026-09-03T16:01:02Z'), 'Asia/Shanghai');
  assert.deepEqual(value, { date: '2026-09-04', minuteKey: '2026-09-04T00:01', second: 2, secondsUntilMidnight: 86338 });
});

test('额度数据库不可用时 fail closed', async () => {
  const db = { runTransaction: async () => { throw new Error('db down'); } };
  await assert.rejects(
    () => reserveAiQuota(db, { openid: 'user', action: 'chat', now: new Date(), env: {} }),
    (error) => error.code === 'AI_QUOTA_UNAVAILABLE'
  );
  await assert.rejects(
    () => reserveAiMinute(db, { openid: 'user', action: 'visionMemory', model: 'deepseek-v4-flash-vision-exp', now: new Date(), env: {} }),
    (error) => error.code === 'AI_QUOTA_UNAVAILABLE'
  );
});

test('BYOK 两个 OPENID 各自计数且不创建共享额度文档', async () => {
  const documents = new Map();
  const db = {
    serverDate: () => 'server-date',
    runTransaction: async (task) => task({ collection: () => ({ doc: (id) => ({
      get: async () => ({ data: documents.get(id) || null }),
      set: async ({ data }) => documents.set(id, data)
    }) }) })
  };
  const options = { appId: 'test-app', action: 'ping', model: 'deepseek-v4-flash', includeGlobal: false,
    now: new Date('2026-09-05T02:00:00Z'), env: { AI_MAX_REQUESTS_PER_DAY: '1' } };
  await reserveAiQuota(db, { ...options, openid: 'first-user' });
  await assert.rejects(() => reserveAiQuota(db, { ...options, openid: 'first-user' }), { code: 'AI_RATE_LIMITED' });
  await reserveAiQuota(db, { ...options, openid: 'second-user' });
  assert.equal(documents.size, 2);
  assert.deepEqual([...documents.values()].map((item) => item.dailyRequests), [1, 1]);
});
