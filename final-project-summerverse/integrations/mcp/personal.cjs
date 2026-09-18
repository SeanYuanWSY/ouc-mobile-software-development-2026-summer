#!/usr/bin/env node
// User-facing stdio adapter. HTTPS + a personal token only; no cloud admin or DevTools fallback.
const fs = require('node:fs');
const { createInterface } = require('node:readline');
const { createProtocol, transport } = require('./server.cjs');
function readConfig(file) {
  if (!file || !require('node:path').isAbsolute(file)) throw new Error('Config path must be absolute');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096 || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))) throw new Error('Private config permissions required');
    const value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (!value || Object.keys(value).some(k => !['url', 'token'].includes(k))) throw new Error('Invalid config');
    return transport({ SUMMERVERSE_URL: value.url, SUMMERVERSE_TOKEN: value.token });
  } finally { fs.closeSync(fd); }
}
if (require.main === module) {
  let send;
  try { send = readConfig(process.env.SUMMERVERSE_CONFIG); }
  catch (_) { process.stderr.write('连接配置无效。请运行 connect.cjs 创建本人的连接配置。\n'); process.exit(1); }
  const handle = createProtocol(send), lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve(), queued = 0, length = 0;
  process.stdin.on('data', chunk => { for (const byte of chunk) { length = byte === 10 ? 0 : length + 1; if (length > 20000) process.exit(1); } });
  lines.on('line', line => {
    if (++queued > 50) process.exit(1);
    queue = queue.then(async () => {
      let reply;
      try { reply = await handle(JSON.parse(line)); }
      catch (_) { reply = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }; }
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
      queued--;
    });
  });
}
module.exports = { readConfig };
