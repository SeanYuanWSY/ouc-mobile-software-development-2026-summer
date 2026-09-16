const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractDocument } = require('../cloudfunctions/deepseekProxy/material-parser');
const fixtures = require('../scripts/demo/material-fixtures.cjs');

test('真实PDF文字解析保留页码；不会把扫描空页当作已有文字', async () => {
  const parsed = await extractDocument(fixtures.pdf(['Submit a report.', '', 'Deadline: Friday.']), 'pdf');
  assert.equal(parsed.extraction, 'pdf-text');
  assert.match(parsed.chunks[0].text, /Submit a report/);
  assert.equal(parsed.chunks[1].locator, '第3页');
  assert(parsed.warnings.some((w) => w.includes('第2页')));
  await assert.rejects(extractDocument(fixtures.pdf(['']), 'pdf'), /扫描件/);
});
test('真实DOCX/PPTX解包提取中文；幻灯片按数值排序且明确未读取嵌入图片', async () => {
  const doc = await extractDocument(fixtures.word('交付：报告 &amp; 视频'), 'docx');
  assert.equal(doc.chunks[0].text, '交付：报告 & 视频');
  assert.match(doc.warnings[0], /内嵌图片/);
  const ppt = await extractDocument(fixtures.slides(), 'pptx');
  assert.deepEqual(ppt.chunks.map((c) => c.locator), ['第1张幻灯片', '第2张幻灯片', '第10张幻灯片']);
});
test('拒绝伪造格式、损坏文件、旧二进制Office、外部实体和路径上跳', async () => {
  for (const [buffer, kind] of [
    [Buffer.from('not-pdf'), 'pdf'], [Buffer.from('PKbroken'), 'docx'], [fixtures.word().subarray(0, 120), 'docx'],
    [fixtures.word('<!DOCTYPE x [<!ENTITY y SYSTEM "https://invalid.example/secret">]>&y;'), 'docx'],
    [fixtures.zip([{ name: '../word/document.xml', text: 'x' }]), 'docx'],
    [fixtures.zip([{ name: 'word/document.xml', text: 'x', encrypted: true }]), 'docx']
  ]) await assert.rejects(extractDocument(buffer, kind), { code: 'MATERIAL_INVALID' });
  assert.throws(() => extractDocument(fixtures.word(), 'doc'));
});
test('8MB输入、展开大小、页数和4万字均有硬上限', async () => {
  assert.throws(() => extractDocument(Buffer.alloc(8 * 1024 * 1024 + 1), 'pdf'));
  await assert.rejects(extractDocument(fixtures.pdf(Array(41).fill('page')), 'pdf'), /40页/);
  await assert.rejects(extractDocument(fixtures.zip([{ name: 'word/document.xml', text: 'a'.repeat(2 * 1024 * 1024 + 1), compress: true }]), 'docx'));
  await assert.rejects(extractDocument(Buffer.from('字'.repeat(40001)), 'text'), /4万字/);
  await assert.rejects(extractDocument(Buffer.from([255, 255]), 'text'), /UTF-8/);
  await assert.rejects(extractDocument(Buffer.from('text\0binary'), 'text'));
});
test('复杂解析到期后终止worker，不只让调用方放弃等待', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'material-worker-test-'));
  const workerPath = path.join(dir, 'blocked.cjs'); fs.writeFileSync(workerPath, 'while(true){}');
  try { await assert.rejects(extractDocument(Buffer.from('a'), 'text', { workerPath, timeout: 50 }), /读取超时/); }
  finally { fs.rmSync(dir, { recursive: true }); }
});
