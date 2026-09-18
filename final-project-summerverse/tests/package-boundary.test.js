const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { includedFiles, buildManifest, assertRegular } = require('../scripts/manifest');
const { packageProject } = require('../scripts/package');
test('交付包不含私有配置、运行日志、树外链接或旧ZIP残留', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-package-fixture-'));
  try {
    for (const name of ['index.js', '.gitignore', '.env', 'private.js', 'project.private.config.json', '.git/config', '.mimosa/report.json', 'dist/old.txt', 'node_modules/a.js']) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), 'synthetic');
    }
    assert.deepEqual(includedFiles(root).map(file => path.relative(root, file)).sort(), ['.gitignore', 'index.js']);
    fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), buildManifest(root));
    fs.writeFileSync(path.join(root, 'dist/SummerVerse-WeChat-MiniProgram.zip'), 'old-archive-marker');
    const output = packageProject(root);
    const entries = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' }).trim().split('\n').map(file => file.slice(path.basename(root).length + 1)).sort();
    assert.deepEqual(entries, ['.gitignore', 'MANIFEST.sha256', 'index.js']);
    fs.symlinkSync('/outside-synthetic-target', path.join(root, 'link.js'));
    assert.throws(() => includedFiles(root), /不打包链接/);
    fs.unlinkSync(path.join(root, 'link.js'));
    fs.unlinkSync(path.join(root, 'MANIFEST.sha256'));
    fs.symlinkSync(path.join(root, 'index.js'), path.join(root, 'MANIFEST.sha256'));
    assert.throws(() => packageProject(root), /拒绝链接/);
    assert.throws(() => assertRegular(path.join(root, 'MANIFEST.sha256'), { missing: true }), /拒绝链接/);
    fs.unlinkSync(path.join(root, 'MANIFEST.sha256'));
    fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), buildManifest(root));
    fs.renameSync(path.join(root, 'dist'), path.join(root, '.old-dist'));
    fs.symlinkSync(path.join(root, '.old-dist'), path.join(root, 'dist'));
    assert.throws(() => packageProject(root), /拒绝链接/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
