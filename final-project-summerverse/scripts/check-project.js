const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildManifest } = require('./manifest');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const errors = [];
const notes = [];

const manifestFile = path.join(root, 'MANIFEST.sha256');
if (!fs.existsSync(manifestFile)) errors.push('缺少 MANIFEST.sha256 完整性清单');
else if (fs.readFileSync(manifestFile, 'utf8') !== buildManifest()) errors.push('MANIFEST.sha256 已过期；请先运行 npm run manifest');

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
if (app.permission?.['scope.record']) errors.push('app.json 不应声明无效的 permission["scope.record"]');
for (const [scope, permission] of Object.entries(app.permission || {})) {
  if ([...String(permission.desc || '')].length > 30) errors.push(`权限用途说明超过 30 字：${scope}`);
}
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
  for (const match of content.matchAll(/<canvas\b[^>]*>/g)) {
    if (!/\btype=["']2d["']/.test(match[0])) errors.push(`Canvas 应使用 2D 接口：${path.relative(root, file)}`);
  }

  const jsFile = file.replace(/\.wxml$/, '.js');
  if (fs.existsSync(jsFile)) {
    const code = fs.readFileSync(jsFile, 'utf8');
    const handlers = [...new Set([...content.matchAll(/(?:bind|catch)(?::?[a-zA-Z][\w-]*?)?=["']([A-Za-z_$][\w$]*)["']/g)].map((match) => match[1]))];
    handlers.forEach((handler) => {
      if (!code.includes(`${handler}(`)) errors.push(`WXML 事件缺少 JS 方法：${path.relative(root, file)} · ${handler}`);
    });
  }
}

const declaredPages = new Set(app.pages);
for (const file of walk(mini, (value) => value.endsWith('.js'))) {
  const content = fs.readFileSync(file, 'utf8');
  if (/\bwx\.createCanvasContext\s*\(/.test(content)) errors.push(`JS 使用旧版 Canvas 接口：${path.relative(root, file)}`);
  for (const match of content.matchAll(/["'`]\/(pages\/[^?"'`]+)(?:\?[^"'`]*)?["'`]/g)) {
    if (!declaredPages.has(match[1])) errors.push(`页面跳转目标未在 app.json 注册：${path.relative(root, file)} · ${match[1]}`);
  }
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
