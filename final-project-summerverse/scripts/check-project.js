const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const errors = [];
const notes = [];

function walk(dir, predicate = () => true) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(value, predicate) : predicate(value) ? [value] : [];
  });
}

for (const file of walk(root, (value) => value.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { errors.push(`JSON 无法解析：${path.relative(root, file)} · ${error.message}`); }
}

const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
for (const page of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    const file = path.join(mini, `${page}.${ext}`);
    if (!fs.existsSync(file)) errors.push(`页面缺少 ${path.relative(root, file)}`);
  }
}

for (const file of walk(root, (value) => value.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { errors.push(`JS 语法错误：${path.relative(root, file)}\n${String(error.stderr || error.message)}`); }
}

for (const file of walk(mini, (value) => value.endsWith('.wxml'))) {
  const content = fs.readFileSync(file, 'utf8');
  if (/\{\{[^}]*getApp\(/.test(content)) errors.push(`WXML 不能调用 getApp：${path.relative(root, file)}`);
  if (/\{\{[^}]*(?:\.slice\(|\.find\(|Math\.)/.test(content)) errors.push(`WXML 包含高风险方法调用：${path.relative(root, file)}`);
  if (/<\/?(?:strong|small|div|span|main|section)(?:\s|>)/.test(content)) errors.push(`WXML 包含 HTML 标签：${path.relative(root, file)}`);
}

const secretPattern = /sk-[A-Za-z0-9_-]{20,}/g;
for (const file of walk(root, (value) => /\.(?:js|json|md|example|txt)$/.test(value))) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(secretPattern) || [];
  if (matches.some((value) => !/sk-your-key/.test(value))) errors.push(`疑似 API Key：${path.relative(root, file)}`);
}

const imageFiles = walk(path.join(mini, 'images'));
const imageBytes = imageFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
notes.push(`静态插画 ${imageFiles.length} 个，共 ${(imageBytes / 1024).toFixed(1)} KiB`);
if (imageBytes > 1.5 * 1024 * 1024) errors.push('主包静态图片超过 1.5 MiB，可能挤压 2 MiB 主包预算');

if (errors.length) {
  console.error('\nSummerVerse 项目检查失败：');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log('SummerVerse 项目检查通过。');
notes.forEach((note) => console.log(`- ${note}`));
console.log(`- 页面 ${app.pages.length} 个，云函数 ${fs.readdirSync(path.join(root, 'cloudfunctions')).length} 个`);
