const { parentPort, workerData } = require('node:worker_threads');
const { LIMITS } = require('./material-policy');
const yauzl = require('yauzl');
function fail(message) { throw Object.assign(new Error(message), { code: 'MATERIAL_PARSE' }); }
function entities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const names = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (names[entity]) return names[entity];
    const n = parseInt(entity.slice(entity[2] === 'x' ? 3 : 2, -1), entity[2] === 'x' ? 16 : 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  });
}
function xmlText(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('不支持包含外部实体的文档');
  return xml.replace(/<\/(?:w|a):p>/g, '\n').replace(/<(?:w|a):(?:tab|br)\b[^>]*\/?\s*>/g, ' ')
    .split(/(<(?:w|a):t\b[^>]*>[\s\S]*?<\/(?:w|a):t>)/g)
    .map((s) => /^<(?:w|a):t\b/.test(s) ? entities(s.replace(/<[^>]+>/g, '')) : s.includes('\n') ? '\n' : '')
    .join('').replace(/\n{3,}/g, '\n\n').trim();
}
async function office(buffer, kind) {
  if (buffer.readUInt32LE(0) !== 0x04034b50) fail('文档格式不匹配，请另存为DOCX或PPTX');
  const selected = [];
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (err, zip) => {
      if (err) return reject(new Error('文档压缩结构损坏'));
      let entries = 0, total = 0, ended = false;
      function stop(error) { if (ended) return; ended = true; zip.close(); reject(error); }
      zip.on('error', () => stop(new Error('文档压缩结构损坏')));
      zip.on('entry', (entry) => {
        if (++entries > 1500 || entry.generalPurposeBitFlag & 1) return stop(new Error('文档过大或已加密'));
        const wanted = kind === 'docx' ? entry.fileName === 'word/document.xml' : /^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName);
        if (!wanted) return zip.readEntry();
        if (selected.some((s) => s.name === entry.fileName) || entry.uncompressedSize > 2 * 1024 * 1024 || total + entry.uncompressedSize > 8 * 1024 * 1024 || selected.length >= LIMITS.pages) return stop(new Error('文档超过40页或展开后过大，请拆分'));
        zip.openReadStream(entry, (error, stream) => {
          if (error) return stop(new Error('文档无法解压'));
          const chunks = []; let size = 0;
          stream.on('data', (chunk) => {
            size += chunk.length; total += chunk.length;
            if (size > 2 * 1024 * 1024 || total > 8 * 1024 * 1024) { stream.destroy(); stop(new Error('文档解压内容过大')); return; }
            chunks.push(chunk);
          });
          stream.on('error', () => stop(new Error('文档解压校验失败')));
          stream.on('end', () => { if (!ended) { selected.push({ name: entry.fileName, text: xmlText(Buffer.concat(chunks).toString('utf8')) }); zip.readEntry(); } });
        });
      });
      zip.on('end', () => { if (!ended) { ended = true; resolve(); } });
      zip.readEntry();
    });
  });
  if (!selected.length) fail('文件中没有可读取的正文');
  selected.sort((a, b) => (Number(a.name.match(/slide(\d+)/)?.[1]) || 0) - (Number(b.name.match(/slide(\d+)/)?.[1]) || 0));
  return selected.map((s) => ({ locator: kind === 'pptx' ? `第${s.name.match(/slide(\d+)/)[1]}张幻灯片` : '文档正文', text: s.text }));
}
async function pdf(buffer) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-') fail('文件内容不是有效PDF');
  const { getDocumentProxy } = require('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    if (doc.numPages > LIMITS.pages) fail('PDF超过40页，请拆分后导入');
    const pages = []; let chars = 0;
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const stream = page.streamTextContent({ disableNormalization: false }).getReader();
      let text = '';
      while (true) {
        const { done, value } = await stream.read();
        if (done) break;
        for (const item of value.items || []) if (typeof item.str === 'string') {
          text += item.str + (item.hasEOL ? '\n' : ' ');
          chars += item.str.length + 1;
          if (chars > LIMITS.characters) { await stream.cancel(); fail('PDF超过4万字，请拆分'); }
        }
      }
      pages.push({ locator: `第${i}页`, text: text.trim() }); page.cleanup();
    }
    return pages;
  } finally { await doc.destroy(); }
}
async function main() {
  const buffer = Buffer.from(workerData.buffer), kind = workerData.kind;
  let parts;
  if (kind === 'pdf') parts = await pdf(buffer);
  else if (kind === 'docx' || kind === 'pptx') parts = await office(buffer, kind);
  else {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_) { fail('文字文件请使用UTF-8编码'); }
    if (text.includes('\0')) fail('不是有效文字文件');
    parts = [{ locator: '文字正文', text }];
  }
  if (parts.reduce((n, p) => n + p.text.length, 0) > LIMITS.characters) fail('资料超过4万字，请拆分');
  const warnings = [], chunks = [];
  for (const p of parts) {
    if (!p.text.trim()) { warnings.push(`${p.locator}未提取到文字，可能是图片；请另附截图`); continue; }
    for (let offset = 0; offset < p.text.length; offset += 2000) chunks.push({ id: `c${chunks.length + 1}`, locator: `${p.locator}${p.text.length > 2000 ? ` · 片段${Math.floor(offset / 2000) + 1}` : ''}`, text: p.text.slice(offset, offset + 2000) });
  }
  if (!chunks.length) fail('未提取到文字；扫描件请导入清晰截图进行识别');
  if (chunks.length > LIMITS.chunks) fail('资料片段过多，请拆分');
  if (kind === 'docx' || kind === 'pptx') warnings.unshift('仅提取正文文字；内嵌图片、图表、批注和备注未分析');
  if (kind === 'pdf') warnings.unshift('仅提取PDF文字层；图表和图片未分析');
  return { chunks, extraction: kind === 'pdf' ? 'pdf-text' : kind === 'text' ? 'plain' : 'ooxml-text', warnings: warnings.slice(0, 10) };
}
main().then((data) => parentPort.postMessage({ ok: true, data })).catch((error) => parentPort.postMessage({ ok: false, error: error.code === 'MATERIAL_PARSE' ? error.message : '读取失败；文件可能损坏、加密或格式不受支持' }));
