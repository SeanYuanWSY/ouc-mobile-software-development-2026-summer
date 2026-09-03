const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '..', 'SummerVerse-WeChat-MiniProgram.zip');
try {
  execFileSync('zip', ['-qr', output, path.basename(root), '-x', '*/node_modules/*', '*/.DS_Store', '*/project.private.config.json'], { cwd: path.dirname(root), stdio: 'inherit' });
  console.log(output);
} catch (error) {
  console.error('打包失败，请确认系统已安装 zip。', error.message);
  process.exit(1);
}
