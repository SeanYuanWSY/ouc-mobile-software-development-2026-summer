// Canonical shared contract. Run scripts/sync-material-policy.js after edits.
const LIMITS = Object.freeze({ sources: 6, characters: 40000, chunks: 120, fileBytes: 8 * 1024 * 1024, pages: 40, workspaces: 12, tasks: 40 });
const MODES = ['requirements', 'compare', 'ask', 'checklist', 'minutes', 'plan', 'defense'];
// Preserve the existing five modes' stored reports while keeping new flows narrow.
const LEGACY_KINDS = ['requirement', 'change', 'answer', 'check', 'decision', 'task', 'question'];
const MODE_KINDS = { plan: ['task', 'check', 'question'], defense: ['practice'] };
function bad(message) { throw Object.assign(new Error(message), { code: 'MATERIAL_INVALID' }); }
function string(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) bad(`${label}格式不正确或过长`);
  return value.trim();
}
function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) bad('资料标识无效'); return value; }
function array(value, max, label) { if (!Array.isArray(value) || value.length > max) bad(`${label}数量超出范围`); return value; }
function sources(input) {
  let chars = 0, count = 0;
  const seen = new Set();
  const output = array(input, LIMITS.sources, '资料').map((s) => {
    if (!s || typeof s !== 'object') bad('资料格式不正确');
    const sourceId = id(s.id);
    if (seen.has(sourceId)) bad('资料标识重复');
    seen.add(sourceId);
    if (!['text', 'pdf', 'docx', 'pptx', 'image', 'web'].includes(s.kind)) bad('暂不支持这种资料');
    if (!['plain', 'pdf-text', 'ooxml-text', 'vision', 'web-text'].includes(s.extraction)) bad('提取方式无效');
    const domain = s.kind === 'web' ? string(s.domain, 253, '网页域名').toLowerCase() : '';
    if (domain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(domain)) bad('网页域名无效');
    const chunkIds = new Set();
    const chunks = array(s.chunks, LIMITS.chunks, '片段').map((c) => {
      const chunkId = id(c.id);
      if (chunkIds.has(chunkId)) bad('片段标识重复');
      chunkIds.add(chunkId);
      const text = string(c.text, LIMITS.characters, '资料文字');
      chars += text.length; count += 1;
      return { id: chunkId, locator: string(c.locator, 60, '位置'), text };
    });
    if (!chunks.length) bad('这份资料没有可分析的文字');
    return { id: sourceId, name: string(s.name, 100, '资料名'), kind: s.kind, extraction: s.extraction, chunks,
      ...(domain ? { domain } : {}), warnings: array(s.warnings || [], 10, '提示').map((w) => string(w, 180, '提示')) };
  });
  if (chars > LIMITS.characters || count > LIMITS.chunks) bad('本次资料超过4万字或120个片段，请分批分析');
  return output;
}
function evidence(input, materials, required = true) {
  const refs = array(input || [], 6, '引用').map((r) => {
    if (!r || typeof r !== 'object') bad('引用格式不正确');
    const source = materials.find((s) => s.id === r.sourceId);
    const chunk = source && source.chunks.find((c) => c.id === r.chunkId);
    const quote = string(r.quote, 400, '引文');
    if (!chunk || !chunk.text.replace(/\s/g, '').includes(quote.replace(/\s/g, ''))) bad('AI 给出的出处无法在资料中找到，请重试');
    return { sourceId: source.id, chunkId: chunk.id, quote };
  });
  if (required && !refs.length) bad('AI 结果缺少出处，请重试');
  return refs;
}
function analysis(input, materials) {
  if (!input || !MODES.includes(input.mode)) bad('分析方式无效');
  const allowedKinds = MODE_KINDS[input.mode] || LEGACY_KINDS;
  const maxItems = input.mode === 'defense' ? 5 : input.mode === 'plan' ? 12 : 20;
  const items = array(input.items, maxItems, '分析结果').map((item, i) => {
    if (!item || typeof item !== 'object' || !allowedKinds.includes(item.kind)) bad('分析结果类型无效');
    if (item.kind === 'practice') array(item.evidence || [], 3, '练习出处');
    return { id: `item-${i + 1}`, kind: item.kind, title: string(item.title, 80, '结果标题'), detail: string(item.detail, 1200, '结果内容', item.kind !== 'practice'),
      evidence: evidence(item.evidence, materials, item.kind !== 'question') };
  });
  if (!items.length && input.mode === 'defense') bad('资料不足，暂时无法生成有出处的练习题，请补充资料后重试');
  if (!items.length) bad('AI 没有给出可用结果，请重试');
  return { id: id(input.id), mode: input.mode, question: string(input.question || '', 600, '问题', true), items,
    model: string(input.model || '', 100, '模型', true), generatedAt: string(input.generatedAt || '', 40, '生成时间', true) };
}
function workspace(input) {
  if (!input || typeof input !== 'object') bad('工作台格式无效');
  const materials = sources(input.sources || []);
  const report = input.analysis ? analysis(input.analysis, materials) : null;
  const taskIds = new Set();
  const tasks = array(input.tasks || [], LIMITS.tasks, '任务').map((t) => {
    const taskId = id(t.id);
    if (taskIds.has(taskId)) bad('任务重复');
    taskIds.add(taskId);
    return { id: taskId, title: string(t.title, 80, '任务标题'), detail: string(t.detail || '', 1200, '任务说明', true), done: t.done === true,
      // Tasks retain readable provenance even if the user starts a later analysis.
      provenance: string(t.provenance || '', 1200, '任务出处', true) };
  });
  const out = { id: id(input.id), title: string(input.title || '未命名资料', 80, '工作台名'), sources: materials, analysis: report, tasks };
  if (JSON.stringify(out).length > 110000) bad('工作台内容过大，请拆分');
  return out;
}
function extension(name) { return ((String(name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase(); }
function fileKind(name) {
  const ext = extension(name);
  if (['txt', 'md'].includes(ext)) return 'text';
  if (['pdf', 'docx', 'pptx'].includes(ext)) return ext;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  bad('支持 PDF、DOCX、PPTX、TXT、MD 和 JPG/PNG/WebP 图片；旧版文档请先另存为新格式');
}
module.exports = { LIMITS, MODES, bad, id, sources, evidence, analysis, workspace, extension, fileKind };
