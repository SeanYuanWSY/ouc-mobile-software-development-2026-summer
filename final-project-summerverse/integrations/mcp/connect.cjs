#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Writable } = require('node:stream');
const readline = require('node:readline');
const { transport } = require('./server.cjs');
async function main() {
  if (!process.stdin.isTTY) throw new Error('请在电脑终端交互运行，不要把凭证写进命令参数。');
  let hidden = false;
  const output = new Writable({ write(chunk, _, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  const ask = text => new Promise(resolve => rl.question(text, resolve));
  let url, token;
  try {
    url = (await ask('小程序提供的 HTTPS 连接地址：')).trim();
    process.stdout.write('粘贴本人的连接凭证（不显示）：'); hidden = true;
    token = (await ask('')).trim(); hidden = false; process.stdout.write('\n');
  } finally { rl.close(); }
  transport({ SUMMERVERSE_URL: url, SUMMERVERSE_TOKEN: token }); // Validate without sending secrets during setup.
  const dir = path.join(os.homedir(), '.config', 'summerverse');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const parent = fs.lstatSync(dir);
  if (parent.isSymbolicLink() || !parent.isDirectory() || (process.platform !== 'win32' && ((parent.mode & 0o077) || parent.uid !== process.getuid()))) throw new Error('连接配置目录权限不安全，请使用仅当前用户可访问的目录。');
  const file = path.join(dir, `connection-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ url, token }), { mode: 0o600, flag: 'wx' });
  process.stdout.write('已保存个人连接。将下面这一项加入 Kimi 的 MCP 配置，保留已有配置：\n');
  process.stdout.write(JSON.stringify({ mcpServers: { summerverse: { command: process.execPath, args: [path.join(__dirname, 'personal.cjs')], env: { SUMMERVERSE_CONFIG: file } } } }, null, 2) + '\n');
}
if (require.main === module) main().catch(() => { process.stderr.write('配置未完成，请检查地址、凭证格式和私有目录权限。\n'); process.exitCode = 1; });
