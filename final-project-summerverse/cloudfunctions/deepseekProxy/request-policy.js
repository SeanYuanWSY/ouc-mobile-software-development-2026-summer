function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function isReal(item) { return item && (item.source == null || item.source === 'manual' || item.source === 'ai-assisted'); }

function validateMemories(value, required = false) {
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || (required && !value.length)) throw new Error('记忆列表格式不正确');
  if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('记忆列表包含无效项目');
  if (value.some((item) => !isReal(item))) throw Object.assign(new Error('示例和反思不能作为真实记忆传给 AI'), { code: 'BAD_REQUEST' });
}

function validateRequestPayload(action, payload = {}) {
  switch (action) {
    case 'ping': return;
    case 'parseMemory':
      if (!clean(payload.text, 1200)) throw new Error('没有提供需要整理的文字');
      return;
    case 'chat':
      if (!clean(payload.question, 600)) throw new Error('问题不能为空');
      validateMemories(payload.memories);
      return;
    case 'timePhone':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(payload.date, 10)) || !clean(payload.question, 500)) throw new Error('时间电话需要有效日期和问题');
      validateMemories(payload.memories);
      return;
    case 'parallel':
      if (!isReal(payload.memory)) throw Object.assign(new Error('平行路线需要真实记忆'), { code: 'BAD_REQUEST' });
      if (!clean(payload.memory && payload.memory.title, 80) || !clean(payload.alternative, 500)) throw new Error('真实记忆和另一种选择都不能为空');
      return;
    case 'director':
      validateMemories(payload.memories, true);
      return;
    case 'insight':
      validateMemories(payload.memories);
      return;
    case 'visionMemory':
      if (!clean(payload.fileID, 500).startsWith('cloud://')) throw new Error('AI 看图需要先把图片上传到微信云存储');
      return;
    default: throw new Error(`未知 AI action：${action}`);
  }
}

module.exports = { validateRequestPayload };
