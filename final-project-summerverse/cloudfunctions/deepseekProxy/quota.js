const crypto = require('node:crypto');

const ACTION_CREDITS = Object.freeze({
  ping: 1,
  parseMemory: 2,
  chat: 2,
  timePhone: 2,
  parallel: 3,
  insight: 3,
  director: 4,
  visionMemory: 8
});

function creditCost(action, model = '') {
  const base = ACTION_CREDITS[action] || 0;
  return model === 'deepseek-v4-pro' ? base * 2 : base;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${name} 必须是正整数`);
    error.code = 'AI_QUOTA_CONFIG_INVALID';
    throw error;
  }
  return parsed;
}

function readQuotaConfig(env = process.env) {
  const timeZone = env.AI_QUOTA_TIMEZONE || 'Asia/Shanghai';
  try { new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); }
  catch (_) {
    const error = new Error('AI_QUOTA_TIMEZONE 不是有效时区');
    error.code = 'AI_QUOTA_CONFIG_INVALID';
    throw error;
  }
  return {
    perMinute: positiveInteger(env.AI_MAX_REQUESTS_PER_MINUTE, 6, 'AI_MAX_REQUESTS_PER_MINUTE'),
    perDay: positiveInteger(env.AI_MAX_REQUESTS_PER_DAY, 40, 'AI_MAX_REQUESTS_PER_DAY'),
    creditsPerDay: positiveInteger(env.AI_MAX_CREDITS_PER_DAY, 80, 'AI_MAX_CREDITS_PER_DAY'),
    globalCreditsPerDay: positiveInteger(env.AI_GLOBAL_CREDITS_PER_DAY, 5000, 'AI_GLOBAL_CREDITS_PER_DAY'),
    timeZone
  };
}

function timeWindow(now = new Date(), timeZone = 'Asia/Shanghai') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const second = Number(parts.second) || 0;
  const secondsUntilMidnight = 86400 - (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + second);
  return { date, minuteKey: `${date}T${parts.hour}:${parts.minute}`, second, secondsUntilMidnight };
}

function limitError(scope, retryAfterSeconds) {
  const labels = { minute: '每分钟', daily: '当日', global: '全局当日' };
  const error = new Error(`DeepSeek ${labels[scope]} 额度已用完`);
  error.code = 'AI_RATE_LIMITED';
  error.scope = scope;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function evaluateQuota(user = {}, global = {}, context) {
  const { credits, config, window, includeGlobal = true, requestAlreadyReserved = false } = context;
  const minuteRequests = user.minuteKey === window.minuteKey ? Number(user.minuteRequests) || 0 : 0;
  const dailyRequests = Number(user.dailyRequests) || 0;
  const dailyCredits = Number(user.dailyCredits) || 0;
  const globalCredits = Number(global.dailyCredits) || 0;
  if (!requestAlreadyReserved && minuteRequests + 1 > config.perMinute) throw limitError('minute', 60 - window.second);
  if (dailyRequests + 1 > config.perDay || dailyCredits + credits > config.creditsPerDay) throw limitError('daily', window.secondsUntilMidnight || 86400);
  if (includeGlobal && globalCredits + credits > config.globalCreditsPerDay) throw limitError('global', window.secondsUntilMidnight || 86400);
  return {
    user: {
      kind: 'user', date: window.date, minuteKey: window.minuteKey,
      minuteRequests: minuteRequests + (requestAlreadyReserved ? 0 : 1),
      dailyRequests: dailyRequests + 1,
      dailyCredits: dailyCredits + credits
    },
    global: includeGlobal ? { kind: 'global', date: window.date, dailyCredits: globalCredits + credits } : null
  };
}

function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function reserveAiMinute(db, {
  openid,
  appId = 'wechat-mini-program',
  action,
  model,
  includeGlobal = true,
  now = new Date(),
  env = process.env
}) {
  const credits = creditCost(action, model);
  if (!credits) return;
  const config = readQuotaConfig(env);
  const window = timeWindow(now, config.timeZone);
  const userId = `user-${hashId(`${appId}:${openid}:${window.date}`)}`;
  const globalId = `global-${hashId(`${appId}:${window.date}`)}`;
  try {
    await db.runTransaction(async (transaction) => {
      const userRef = transaction.collection('ai_usage').doc(userId);
      const globalRef = includeGlobal ? transaction.collection('ai_usage').doc(globalId) : null;
      const userResult = await userRef.get();
      const globalResult = globalRef ? await globalRef.get() : { data: null };
      const user = userResult.data || {};
      const minuteRequests = user.minuteKey === window.minuteKey ? Number(user.minuteRequests) || 0 : 0;
      if (minuteRequests + 1 > config.perMinute) throw limitError('minute', 60 - window.second);
      const dailyRequests = Number(user.dailyRequests) || 0;
      const dailyCredits = Number(user.dailyCredits) || 0;
      const globalCredits = Number(globalResult.data && globalResult.data.dailyCredits) || 0;
      if (dailyRequests + 1 > config.perDay || dailyCredits + credits > config.creditsPerDay) {
        throw limitError('daily', window.secondsUntilMidnight || 86400);
      }
      if (includeGlobal && globalCredits + credits > config.globalCreditsPerDay) {
        throw limitError('global', window.secondsUntilMidnight || 86400);
      }
      await userRef.set({ data: {
        ...user,
        kind: 'user',
        date: window.date,
        minuteKey: window.minuteKey,
        minuteRequests: minuteRequests + 1,
        ownerHash: hashId(`${appId}:${openid}`),
        updatedAt: db.serverDate()
      } });
    });
  } catch (error) {
    if (['AI_RATE_LIMITED', 'AI_QUOTA_CONFIG_INVALID'].includes(error.code)) throw error;
    const wrapped = new Error('暂时无法校验 AI 使用额度，本次未请求 DeepSeek');
    wrapped.code = 'AI_QUOTA_UNAVAILABLE';
    throw wrapped;
  }
}

async function reserveAiQuota(db, {
  openid,
  appId = 'wechat-mini-program',
  action,
  model,
  includeGlobal = true,
  requestAlreadyReserved = false,
  now = new Date(),
  env = process.env
}) {
  const credits = creditCost(action, model);
  if (!credits) return;
  const config = readQuotaConfig(env);
  const window = timeWindow(now, config.timeZone);
  const userId = `user-${hashId(`${appId}:${openid}:${window.date}`)}`;
  const globalId = `global-${hashId(`${appId}:${window.date}`)}`;
  try {
    await db.runTransaction(async (transaction) => {
      const userRef = transaction.collection('ai_usage').doc(userId);
      const globalRef = includeGlobal ? transaction.collection('ai_usage').doc(globalId) : null;
      const userResult = await userRef.get();
      const globalResult = globalRef ? await globalRef.get() : { data: null };
      const next = evaluateQuota(userResult.data || {}, globalResult.data || {}, {
        credits, config, window, includeGlobal, requestAlreadyReserved
      });
      const updatedAt = db.serverDate();
      await userRef.set({ data: { ...next.user, ownerHash: hashId(`${appId}:${openid}`), updatedAt } });
      if (globalRef) await globalRef.set({ data: { ...next.global, updatedAt } });
    });
  } catch (error) {
    if (['AI_RATE_LIMITED', 'AI_QUOTA_CONFIG_INVALID'].includes(error.code)) throw error;
    const wrapped = new Error('暂时无法校验 AI 使用额度，本次未请求 DeepSeek');
    wrapped.code = 'AI_QUOTA_UNAVAILABLE';
    throw wrapped;
  }
}

module.exports = { ACTION_CREDITS, creditCost, readQuotaConfig, timeWindow, evaluateQuota, reserveAiMinute, reserveAiQuota };
