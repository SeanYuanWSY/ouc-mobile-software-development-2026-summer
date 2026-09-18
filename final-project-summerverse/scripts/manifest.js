const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const ignoredNames = new Set(['.DS_Store', 'MANIFEST.sha256', 'project.private.config.json', 'private.js']);
const ignoredDirs = new Set(['node_modules', 'dist']);
function assertRegular(file, { missing = false, directory = false } = {}) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (missing && error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) throw new Error(`拒绝链接或特殊文件：${file}`);
}

function includedFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') return [];
    if (ignoredNames.has(entry.name) || (entry.isDirectory() && ignoredDirs.has(entry.name))) return [];
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error(`不打包链接或特殊文件：${absolute}`);
    if (/[\r\n]/.test(entry.name)) throw new Error(`文件名包含换行：${absolute}`);
    if (entry.isDirectory()) return includedFiles(absolute);
    if (entry.name.endsWith('.log') || entry.name.endsWith('.zip')) return [];
    return [absolute];
  }).sort();
}

function buildManifest(base = root) {
  return includedFiles(base).map((file) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const relative = `./${path.relative(base, file).split(path.sep).join('/')}`;
    return `${hash}  ${relative}`;
  }).join('\n') + '\n';
}

if (require.main === module) {
  assertRegular(path.join(root, 'MANIFEST.sha256'), { missing: true });
  fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), buildManifest());
  console.log('已更新 MANIFEST.sha256');
}

module.exports = { buildManifest, includedFiles, assertRegular };
