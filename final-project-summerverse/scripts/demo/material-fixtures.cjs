// Synthetic fixtures for parser tests and the isolated native demo; no user material.
const zlib = require('node:zlib');
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const parts = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), body = Buffer.from(entry.text), data = entry.compress ? zlib.deflateRawSync(body) : body;
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(entry.encrypted ? 1 : 0, 6); header.writeUInt16LE(entry.compress ? 8 : 0, 8);
    header.writeUInt32LE(crc32(body), 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); header.copy(directory, 6, 4, 30);
    directory.writeUInt32LE(offset, 42); parts.push(header, name, data); central.push(directory, name); offset += header.length + name.length + data.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, index, end]);
}
function pdf(texts = ['Submit the report by Friday at 18:00.']) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (const text of texts) {
    const stream = `BT /F1 12 Tf 30 700 Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const start = Buffer.byteLength(out); out += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(out);
}
function word(text = '课程要求：周五18点前提交报告和演示视频。') { return zip([{ name: 'word/document.xml', text: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` }]); }
function slides() { return zip([10, 2, 1].map((n) => ({ name: `ppt/slides/slide${n}.xml`, text: `<p:sld xmlns:p="urn:test" xmlns:a="urn:test"><a:p><a:r><a:t>第${n}张：展示功能与当前进度</a:t></a:r></a:p></p:sld>` }))); }
module.exports = { zip, pdf, word, slides };
