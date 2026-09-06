const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const ignoredNames = new Set(['.DS_Store', 'MANIFEST.sha256', 'project.private.config.json', 'private.js']);
const ignoredDirs = new Set(['node_modules', 'dist']);

function includedFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredNames.has(entry.name) || (entry.isDirectory() && ignoredDirs.has(entry.name))) return [];
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return includedFiles(absolute);
    if (entry.name.endsWith('.log') || entry.name.endsWith('.zip')) return [];
    return [absolute];
  }).sort();
}

function buildManifest() {
  return includedFiles().map((file) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const relative = `./${path.relative(root, file).split(path.sep).join('/')}`;
    return `${hash}  ${relative}`;
  }).join('\n') + '\n';
}

if (require.main === module) {
  fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), buildManifest());
  console.log('已更新 MANIFEST.sha256');
}

module.exports = { buildManifest };
