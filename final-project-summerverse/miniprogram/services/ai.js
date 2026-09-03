const { callFunction, isCloudReady } = require('./cloud');
const { CATEGORIES, MOODS } = require('../utils/constants');
const { cleanText } = require('../utils/validate');

function appConfig() {
  const app = getApp();
  return {
    provider: app.globalData.aiProvider || 'deepseek',
    model: app.globalData.aiModel || 'deepseek-v4-flash',
    visionModel: app.globalData.visionModel || 'deepseek-v4-flash-vision-exp',
    apiKeyOverride: app.globalData.aiSessionKey || ''
  };
}

function inferCategory(text) {
  if (/论文|学习|课程|英语|单词|读书|考试/.test(text)) return 'study';
  if (/科研|代码|开发|模型|实验|项目|调试|小程序/.test(text)) return 'research';
  if (/家人|妈妈|爸爸|狗狗|朋友|陪伴/.test(text)) return 'family';
  if (/旅行|海边|公园|日落|景点|出发|城市/.test(text)) return 'explore';
  if (/跑步|运动|散步|健身|游泳|骑行/.test(text)) return 'health';
  return 'life';
}

function inferMood(text) {
  if (/开心|快乐|高兴|治愈|放松/.test(text)) return 'happy';
  if (/兴奋|激动|终于|太棒/.test(text)) return 'excited';
  if (/焦虑|担心|紧张/.test(text)) return 'anxious';
  if (/累|疲惫|困/.test(text)) return 'tired';
  if (/难过|低落|失望/.test(text)) return 'low';
  return 'calm';
}

function localParseMemory(text) {
  const category = inferCategory(text);
  const mood = inferMood(text);
  return {
    title: cleanText(text.replace(/[，。！？].*$/, ''), 26) || `${CATEGORIES[category].name}的一天`,
    content: cleanText(text, 800),
    category,
    mood,
    durationMinutes: Number((text.match(/(\d+)\s*(分钟|min)/i) || [])[1]) || 0,
    tags: [CATEGORIES[category].short, MOODS[mood].name],
    importance: /第一次|终于|完成|特别|重要/.test(text) ? 5 : 3,
    assistantNote: '当前使用本地解析模式；连接 DeepSeek 后可获得更细致的结构化结果。'
  };
}

function localChat(question, memories) {
  const latest = memories[0];
  if (!latest) return '我还没有收到你的真实记忆。先记录一件今天发生的事，我才会真正开始了解你。';
  const category = CATEGORIES[latest.category]?.name || '生活';
  return `我记得你最近写下了「${latest.title}」。这件${category}记忆里的情绪是${MOODS[latest.mood]?.name || '平静'}；比起替你下结论，我更想问：当时最值得留下的那个瞬间是什么？`;
}

function localTimePhone(date, question, memories) {
  const eligible = memories.filter((item) => item.date <= date);
  const latest = eligible[0];
  if (!latest) return `这里是 ${date} 的你。这个时间点之前还没有留下记忆，所以我只能听见一点模糊的期待：你希望未来的自己别忘记什么？`;
  return `这里是 ${date} 的你。我现在只知道「${latest.title}」以及更早发生的事情，还不知道之后的答案。关于“${cleanText(question, 60)}”，我当时可能会说：先把今天能完成的一小步做好。`;
}

function localParallel(memory, alternative) {
  return {
    title: '一条没有走过的夏日支路',
    original: [`真实选择：${memory?.title || '原来的决定'}`, '保留了已经发生的关系、经验和结果'],
    parallel: [`另一种选择：${cleanText(alternative, 80) || '换一种做法'}`, '可能获得新的体验，也会失去真实路线中的某些细节'],
    gains: ['新的视角', '对自己选择偏好的理解'],
    losses: ['真实路线中已经积累的经验'],
    letter: '平行故事不是用来否定真实生活，而是帮助你看清：自己真正重视的是什么。'
  };
}

function localDirector(memories) {
  const selected = memories.slice(0, 6).reverse();
  return {
    title: '我的暑假，正在长成一座岛',
    subtitle: '由真实记忆自动整理的夏日短片',
    chapters: selected.length ? selected.map((item, index) => ({
      title: `第 ${index + 1} 幕 · ${item.title}`,
      narration: item.content || `这一天，${item.title}。`,
      memoryIds: [item._id]
    })) : [{ title: '序章 · 等待第一颗记忆', narration: '记录一件真实发生的事，影片才会开始。', memoryIds: [] }],
    ending: '普通的日子被认真记录之后，也会拥有自己的光。'
  };
}

async function invoke(action, payload = {}, options = {}) {
  if (!isCloudReady()) {
    if (options.local) return options.local();
    throw new Error('云开发未连接，当前功能需要 deepseekProxy 云函数');
  }
  try {
    const res = await callFunction('deepseekProxy', {
      action,
      payload,
      config: appConfig()
    }, { timeout: options.timeout || 45000 });
    return res.data;
  } catch (error) {
    console.warn(`[AI:${action}] fallback`, error);
    if (options.local) return options.local(error);
    throw error;
  }
}

function ping() {
  return invoke('ping', {}, { timeout: 20000 });
}

function parseMemory(text) {
  return invoke('parseMemory', { text }, { local: () => localParseMemory(text) });
}

function chat(question, memories) {
  return invoke('chat', { question, memories: memories.slice(0, 30) }, { local: () => localChat(question, memories) });
}

function timePhone(date, question, memories) {
  return invoke('timePhone', { date, question, memories: memories.filter((item) => item.date <= date).slice(0, 40) }, {
    local: () => localTimePhone(date, question, memories)
  });
}

function parallel(memory, alternative) {
  return invoke('parallel', { memory, alternative }, { local: () => localParallel(memory, alternative) });
}

function director(memories, theme = '温暖成长') {
  return invoke('director', { memories: memories.slice(0, 60), theme }, { local: () => localDirector(memories) });
}

function insight(memories) {
  return invoke('insight', { memories: memories.slice(0, 80) }, {
    local: () => ({
      headline: '你的暑假更像一座正在扩建的小岛',
      observations: ['学习与项目记录最稳定', '陪伴类记忆通常带来更高的心情分数'],
      action: '下周安排一次不以完成任务为目标的户外陪伴。'
    })
  });
}

function analyzePhoto(fileID, note = '') {
  return invoke('visionMemory', { fileID, note }, { timeout: 60000 });
}

module.exports = { ping, parseMemory, chat, timePhone, parallel, director, insight, analyzePhoto };
