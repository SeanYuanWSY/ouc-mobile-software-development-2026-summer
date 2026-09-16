const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-release-'));
const manifest = [];
function copy(relative) {
  const source = path.join(root, relative);
  const name = path.basename(source);
  if (name.startsWith('.') || name === 'node_modules' || /private/i.test(name) || name === 'env.example') return;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Release cannot include symlinks: ' + relative);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(source)) copy(path.join(relative, child));
    return;
  }
  if (!/\.(js|json|wxml|wxss|jpg|jpeg|png|gif|webp|svg|ttf|woff2?)$/i.test(name)) return;
  const target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash(source) !== hash(target)) throw new Error('Copy mismatch: ' + relative);
  manifest.push({ path: relative, sha256: hash(target) });
}
for (const entry of ['project.config.json', 'miniprogram', 'cloudfunctions/dataService', 'cloudfunctions/deepseekProxy', 'cloudfunctions/assistantGateway', 'cloudfunctions/assistantInbox']) copy(entry);
fs.writeFileSync(path.join(destination, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ destination, files: manifest.length }));
