#!/usr/bin/env node
// Personal local relay: the logged-in WeChat DevTools must stay open.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { createInterface } = require('node:readline');
const { createProtocol } = require('./server.cjs');
const APPID = 'wx7496879b949ceb28';
const ENV = 'cloudbase-d5gdro8i30f1a4efd';
const JOB_TOOLS = new Set(['summerverse_jobs', 'summerverse_claim_job', 'summerverse_complete_job']);
const ACTIONS = new Set(['job.list', 'job.claim', 'job.complete']);
function loadConfig(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192 || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error('Invalid private config');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(config.token || '') || !require('node:path').isAbsolute(config.automatorPackage || '')) throw new Error('Invalid private config');
  return config;
}
function createLocalProtocol(send) {
  const protocol = createProtocol(send);
  return async message => {
    if (message?.method === 'tools/call' && !JOB_TOOLS.has(message.params?.name)) return { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32602, message: 'Unknown tool' } };
    const response = await protocol(message);
    if (message?.method === 'tools/list' && response?.result?.tools) response.result.tools = response.result.tools.filter(tool => JOB_TOOLS.has(tool.name));
    return response;
  };
}
function devtoolsTransport(config, connect, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  return async data => {
    if (!data || !ACTIONS.has(data.action) || Buffer.byteLength(JSON.stringify(data)) > 16384) throw new Error('Invalid request');
    let mp; const slot = '_summerverseRelay_' + crypto.randomBytes(12).toString('hex');
    try {
      mp = await connect();
      const identity = await mp.evaluate(() => wx.getAccountInfoSync().miniProgram.appId);
      if (identity !== APPID) throw new Error('Wrong project');
      // This callback is static. Tool input is passed as data, never executable source.
      await mp.evaluate((slot, env, token, payload) => {
        const app = getApp(); app[slot] = { pending: true };
        wx.cloud.callFunction({ name: 'assistantGateway', config: { env }, data: {
          httpMethod: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(payload)
        } }).then(response => {
          if (!app[slot]) return;
          const envelope = response.result;
          if (typeof envelope?.body !== 'string' || envelope.body.length > 262144) app[slot] = { failed: true };
          else app[slot] = { body: envelope.body };
        }, () => { if (app[slot]) app[slot] = { failed: true }; });
      }, slot, ENV, config.token, data);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await mp.evaluate(slot => { return getApp()[slot] || { failed: true }; }, slot);
        if (!value || value.failed) throw new Error('Cloud call failed');
        if (!value.pending) {
          if (typeof value.body !== 'string' || Buffer.byteLength(value.body) > 262144) throw new Error('Invalid response');
          const result = JSON.parse(value.body);
          if (typeof result?.ok !== 'boolean') throw new Error('Invalid response');
          return result;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw Object.assign(new Error('Timeout'), { name: 'TimeoutError' });
    } finally {
      if (mp) {
        try { await mp.evaluate(slot => { delete getApp()[slot]; }, slot); } catch (_) {}
        // The official SDK disconnect() returns void, not a Promise.
        try { await mp.disconnect(); } catch (_) {}
      }
    }
  };
}
async function main() {
  let config;
  try { config = loadConfig(process.env.SUMMERVERSE_LOCAL_CONFIG); }
  catch (_) { process.stderr.write('请先完成晞屿手记本机接力配置。\n'); process.exitCode = 1; return; }
  const r = createRequire(config.automatorPackage);
  const automator = r('./');
  // Official package's compatibility check compares modern version strings incorrectly.
  // Validate the actual SDK version instead, without navigation or global cloud initialization.
  r('./out/MiniProgram').default.prototype.checkVersion = async function () {
    const info = await this.systemInfo();
    if (!/^([3-9]|[1-9]\d)\./.test(info.SDKVersion || '')) throw new Error('Unsupported SDK');
  };
  const send = devtoolsTransport(config, () => automator.connect({ wsEndpoint: 'ws://127.0.0.1:9422' }));
  const handle = createLocalProtocol(send);
  let queue = Promise.resolve(), queued = 0, bytes = 0;
  process.stdin.on('data', chunk => { for (const byte of chunk) { bytes = byte === 10 ? 0 : bytes + 1; if (bytes > 20000) process.exit(1); } });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', line => {
    if (++queued > 50) process.exit(1);
    queue = queue.then(async () => {
      let response;
      // Bound a disconnected/locked developer tool. No retry of a possibly applied write.
      const timer = setTimeout(() => { process.stderr.write('微信开发工具无响应，请打开正确工程后重连；先核对任务状态。\n'); process.exit(1); }, 35000);
      try { response = await handle(JSON.parse(line)); }
      catch (_) { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }; }
      finally { clearTimeout(timer); queued--; }
      if (response) process.stdout.write(JSON.stringify(response) + '\n');
    });
  });
}
if (require.main === module) main().catch(() => { process.stderr.write('本机接力启动失败，请检查开发工具和连接配置。\n'); process.exitCode = 1; });
module.exports = { createLocalProtocol, devtoolsTransport, loadConfig };
