const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const VISION_MODEL = 'deepseek-v4-flash-vision-exp';


async function fetchWithTimeout(url, options = {}, timeout = 50000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function compactMemory(item = {}) {
  return {
    id: clean(item._id || item.id, 100),
    date: clean(item.date, 10),
    time: clean(item.time, 5),
    title: clean(item.title, 80),
    content: clean(item.content, 500),
    category: clean(item.category, 20),
    mood: clean(item.mood, 20),
    durationMinutes: Number(item.durationMinutes) || 0,
    location: item.location ? { name: clean(item.location.name, 80), address: clean(item.location.address, 120) } : null,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 8).map((tag) => clean(tag, 24)) : []
  };
}

function stripFence(content) {
  return clean(content, 200000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function parseJson(content) {
  const text = stripFence(content);
  try { return JSON.parse(text); } catch (_) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
    throw new Error('模型没有返回可解析的 JSON');
  }
}

function configFromEvent(event = {}) {
  const client = event.config || {};
  const allowOverride = String(process.env.ALLOW_CLIENT_API_KEY || '').toLowerCase() === 'true';
  const override = allowOverride ? clean(client.apiKeyOverride, 300) : '';
  const apiKey = override || clean(process.env.DEEPSEEK_API_KEY, 300);
  const requestedModel = clean(client.model, 80);
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : clean(process.env.DEEPSEEK_MODEL, 80) || 'deepseek-v4-flash';
  const baseUrl = (clean(process.env.DEEPSEEK_BASE_URL, 300) || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    apiKey,
    model,
    baseUrl,
    source: override ? 'temporary-session-key' : process.env.DEEPSEEK_API_KEY ? 'cloud-env' : 'missing-key',
    visionModel: clean(process.env.DEEPSEEK_VISION_MODEL, 80) || VISION_MODEL
  };
}

async function requestDeepSeek(config, messages, options = {}) {
  if (!config.apiKey) throw new Error('未配置 DEEPSEEK_API_KEY；可在云函数环境变量中设置，或仅在开发阶段开启临时 Key。');
  const body = {
    model: options.model || config.model,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.65,
    max_tokens: options.maxTokens || 1800
  };
  if (options.json) body.response_format = { type: 'json_object' };
  const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body)
  }, options.timeout || 50000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `DeepSeek HTTP ${response.status}`;
    throw new Error(message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 返回内容为空');
  return { content, usage: payload.usage || null, model: payload.model || body.model };
}

async function jsonTask(config, system, user, options = {}) {
  const result = await requestDeepSeek(config, [
    { role: 'system', content: `${system}\n必须只输出合法 JSON，不要使用 Markdown 代码块。` },
    { role: 'user', content: user }
  ], { ...options, json: true });
  return { data: parseJson(result.content), meta: { model: result.model, usage: result.usage, source: config.source } };
}

function memoriesJson(memories, max = 50) {
  return JSON.stringify((Array.isArray(memories) ? memories : []).slice(0, max).map(compactMemory));
}

async function handlePing(config) {
  const result = await requestDeepSeek(config, [
    { role: 'system', content: '你是 SummerVerse 的连接测试助手。' },
    { role: 'user', content: '只回复：SummerTwin 已连接' }
  ], { maxTokens: 30, temperature: 0 });
  return { ok: true, data: { text: result.content.trim(), model: result.model, source: config.source } };
}

async function handleParseMemory(config, payload) {
  const text = clean(payload.text, 1200);
  if (!text) throw new Error('没有提供需要整理的文字');
  const schema = {
    title: '不超过26字', content: '忠于原文的完整记录', category: 'study|research|family|explore|health|life',
    mood: 'happy|excited|calm|tired|anxious|low', durationMinutes: 0, importance: 1, tags: ['标签'],
    assistantNote: '哪些信息来自原文，哪些是推断'
  };
  const { data, meta } = await jsonTask(config,
    '你是 SummerVerse 记忆整理器。只抽取用户明确说出的事实；不确定的时间、地点、人物不要编造。分类与情绪可以谨慎推断，并在 assistantNote 中说明。',
    `输出结构必须符合：${JSON.stringify(schema)}\n用户原话：${text}`,
    { maxTokens: 900, temperature: 0.3 }
  );
  return { ok: true, data, meta };
}

async function handleChat(config, payload) {
  const question = clean(payload.question, 600);
  const memories = Array.isArray(payload.memories) ? payload.memories.slice(0, 30) : [];
  if (!question) throw new Error('问题不能为空');
  const result = await requestDeepSeek(config, [
    {
      role: 'system',
      content: `你是 SummerTwin，一个由用户真实暑假记录构成的数字分身。\n规则：\n1. 事实只来自提供的记忆；不要声称拥有意识、真实人格或未提供的经历。\n2. 每次回答优先引用1-3条“日期 + 标题”作为证据。\n3. 推断必须用“我推测/可能”标明。\n4. 语气温暖但不谄媚，回答控制在220字以内。\n5. 若证据不足，直接说明并提出一个能帮助用户补充记忆的问题。`
    },
    { role: 'user', content: `现有记忆：${memoriesJson(memories, 30)}\n\n问题：${question}` }
  ], { maxTokens: 700, temperature: 0.7 });
  return { ok: true, data: result.content.trim(), meta: { model: result.model, usage: result.usage, source: config.source } };
}

async function handleTimePhone(config, payload) {
  const date = clean(payload.date, 10);
  const question = clean(payload.question, 500);
  const memories = (Array.isArray(payload.memories) ? payload.memories : []).filter((item) => clean(item.date, 10) <= date).slice(0, 40);
  const result = await requestDeepSeek(config, [
    {
      role: 'system',
      content: `你扮演用户在 ${date} 当天的“时间版本”。你只能知道该日期及以前提供的记忆，绝对不能提及之后发生的事。你不是用户真实意识，只是受时间边界约束的叙事角色。回答120-220字，像过去的自己在电话里说话；证据不足时承认不知道。`
    },
    { role: 'user', content: `截至 ${date} 可见的记忆：${memoriesJson(memories, 40)}\n\n未来的我问：${question}` }
  ], { maxTokens: 700, temperature: 0.75 });
  return { ok: true, data: result.content.trim(), meta: { model: result.model, usage: result.usage, source: config.source, visibleMemoryCount: memories.length } };
}

async function handleParallel(config, payload) {
  const memory = compactMemory(payload.memory || {});
  const alternative = clean(payload.alternative, 500);
  if (!memory.title || !alternative) throw new Error('真实记忆和另一种选择都不能为空');
  const schema = { title: '', original: [''], parallel: [''], gains: [''], losses: [''], letter: '' };
  const { data, meta } = await jsonTask(config,
    '你是反事实叙事设计师。基于一条真实记忆与一个替代选择，生成克制、可信的平行故事。禁止预测确定结果，必须使用“可能”。真实路线和生成路线要明确分开。',
    `结构：${JSON.stringify(schema)}\n真实记忆：${JSON.stringify(memory)}\n替代选择：${alternative}`,
    { maxTokens: 1200, temperature: 0.8 }
  );
  return { ok: true, data, meta };
}

async function handleDirector(config, payload) {
  const memories = (Array.isArray(payload.memories) ? payload.memories : []).slice(0, 60).map(compactMemory);
  const theme = clean(payload.theme, 40) || '温暖成长';
  if (!memories.length) throw new Error('没有可供剪辑的真实记忆');
  const schema = { title: '', subtitle: '', chapters: [{ title: '', narration: '', memoryIds: ['真实记忆id'] }], ending: '' };
  const { data, meta } = await jsonTask(config,
    '你是个人纪录片导演。只能使用提供的真实记忆 ID 组织章节；不得虚构新的事件。每章旁白40-90字，章节数3-8个。',
    `叙事气质：${theme}\n输出结构：${JSON.stringify(schema)}\n真实记忆：${JSON.stringify(memories)}`,
    { maxTokens: 2000, temperature: 0.75 }
  );
  return { ok: true, data, meta };
}

async function handleInsight(config, payload) {
  const memories = (Array.isArray(payload.memories) ? payload.memories : []).slice(0, 80).map(compactMemory);
  const schema = { headline: '', observations: [''], action: '', evidence: [{ date: '', title: '' }] };
  const { data, meta } = await jsonTask(config,
    '你是行为记录分析助手。不要做心理诊断；只能从类别、时间、地点、心情和文字中寻找弱相关模式。所有观察必须附具体记忆证据；给出一个低风险、可执行的小行动。',
    `输出结构：${JSON.stringify(schema)}\n记忆：${JSON.stringify(memories)}`,
    { maxTokens: 1200, temperature: 0.5 }
  );
  return { ok: true, data, meta };
}

async function handleVision(config, payload) {
  const fileID = clean(payload.fileID, 500);
  if (!fileID.startsWith('cloud://')) throw new Error('AI 看图需要先把图片上传到微信云存储');
  const download = await cloud.downloadFile({ fileID });
  const buffer = download.fileContent;
  if (!buffer || buffer.length > 8 * 1024 * 1024) throw new Error('图片为空或超过 8MB');
  const base64 = buffer.toString('base64');
  const ext = (fileID.match(/\.([a-z0-9]+)(?:\?|$)/i) || [])[1]?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const note = clean(payload.note, 600);
  const messages = [
    {
      role: 'system',
      content: '你是 SummerVerse 的照片记忆整理器。只描述图中可见内容，不识别人名，不猜测敏感属性。输出合法 JSON。'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `用户补充：${note || '无'}\n输出 JSON：{"title":"","content":"","category":"study|research|family|explore|health|life","mood":"happy|excited|calm|tired|anxious|low","tags":[""]}` },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
      ]
    }
  ];
  const result = await requestDeepSeek(config, messages, { model: config.visionModel, json: true, maxTokens: 900, temperature: 0.35, timeout: 55000 });
  return { ok: true, data: parseJson(result.content), meta: { model: result.model, usage: result.usage, source: config.source } };
}

exports.main = async (event = {}) => {
  try {
    const action = clean(event.action, 60);
    const payload = event.payload || {};
    const config = configFromEvent(event);
    switch (action) {
      case 'ping': return await handlePing(config);
      case 'parseMemory': return await handleParseMemory(config, payload);
      case 'chat': return await handleChat(config, payload);
      case 'timePhone': return await handleTimePhone(config, payload);
      case 'parallel': return await handleParallel(config, payload);
      case 'director': return await handleDirector(config, payload);
      case 'insight': return await handleInsight(config, payload);
      case 'visionMemory': return await handleVision(config, payload);
      default: return { ok: false, error: `未知 AI action：${action}` };
    }
  } catch (error) {
    console.error('[deepseekProxy]', error);
    return { ok: false, error: error.message || 'DeepSeek 调用失败' };
  }
};
