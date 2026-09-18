const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildManifest, includedFiles, assertRegular } = require('./manifest');
function packageProject(root) {
  const outputDir = path.join(root, 'dist');
  const output = path.join(outputDir, 'SummerVerse-WeChat-MiniProgram.zip');
  assertRegular(path.join(root, 'MANIFEST.sha256'));
  assertRegular(outputDir, { missing: true, directory: true });
  if (fs.readFileSync(path.join(root, 'MANIFEST.sha256'), 'utf8') !== buildManifest(root)) throw new Error('文件清单已过期，请重新生成');
  const files = [...includedFiles(root), path.join(root, 'MANIFEST.sha256')];
  fs.mkdirSync(outputDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(outputDir, 'package-'));
  try {
    const temporary = path.join(tempDir, 'delivery.zip');
    const entries = files.map(file => path.relative(path.dirname(root), file));
    if (entries.some(file => /[\r\n]/.test(file))) throw new Error('文件名包含换行');
    execFileSync('zip', ['-q', temporary, '-@'], { cwd: path.dirname(root), input: entries.join('\n') + '\n' });
    fs.renameSync(temporary, output);
    return output;
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}
if (require.main === module) {
  try { console.log(packageProject(path.resolve(__dirname, '..'))); }
  catch (error) { console.error('打包失败：', error.message); process.exitCode = 1; }
}
module.exports = { packageProject };
