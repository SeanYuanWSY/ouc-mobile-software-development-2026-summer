// Native simulator + loopback transport. All users, credentials and content are synthetic.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const database = require('./demo/database.cjs');
const { createInbox } = require('../cloudfunctions/assistantInbox/service');
const { createGateway } = require('../cloudfunctions/assistantGateway/service');
const { createProtocol } = require('../integrations/mcp/server.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'local-assistant-demo-' + Date.now());
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-local-demo-'));
fs.mkdirSync(output, { recursive: true });
const db = database(), inbox = createInbox(db), gateway = createGateway(db);
const session = crypto.randomBytes(32).toString('hex');
const owner = 'local-demo-synthetic-user';
let server, mp;
const write = (rel, text) => fs.writeFileSync(path.join(stage, rel), text);
(async () => {
  const connection = await inbox(owner, { action: 'connect', name: '本地演示助手', readRecent: false });
  server = http.createServer(async (req, res) => {
    
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'POST' || req.headers.authorization !== 'Bearer ' + session || !['/inbox', '/gateway'].includes(req.url)) throw Error('Denied');
      const chunks = []; let size = 0;
      for await (const part of req) { size += part.length; if (size > 16384) throw Error('Too large'); chunks.push(part); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = req.url === '/gateway' ? await gateway(connection.token, data) : { ok: true, data: await inbox(owner, data) };
      // Test-only bridge: expose only this synthetic user's accepted memories to isolated native storage.
      if (req.url === '/inbox' && data.action === 'accept') result.memories = Object.entries(db.snapshot().memories || {}).map(([id, m]) => ({ ...m, id }));
      res.end(JSON.stringify(result));
    } catch (e) {  res.statusCode = 400; res.end(JSON.stringify({ ok: false, code: 'DEMO_REQUEST_FAILED' })); }
  });
  server.requestTimeout = 5000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const send = async data => {
    const response = await fetch(origin + '/gateway', { method: 'POST', headers: { Authorization: 'Bearer ' + session, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000) });
    return response.json();
  };
  const protocol = createProtocol(send);
  await protocol({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  await protocol({ jsonrpc: '2.0', method: 'notifications/initialized' });
  fs.cpSync(path.join(root, 'miniprogram'), path.join(stage, 'miniprogram'), { recursive: true, filter: source => !/private/i.test(path.basename(source)) });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  config.projectname = 'SummerVerse 本地演示（不发布）';
  delete config.cloudfunctionRoot;
  write('project.config.json', JSON.stringify(config));
  write('miniprogram/config/env.js', fs.readFileSync(path.join(stage, 'miniprogram/config/env.js'), 'utf8').replace('ENABLE_CLOUD: true', 'ENABLE_CLOUD: false'));
  assert.equal(require(path.join(stage, 'miniprogram/config/env.js')).ENABLE_CLOUD, false);
  write('miniprogram/utils/storage.js', 'const data = {}; module.exports = {get:(k,f=null)=>data[k]===undefined?f:data[k],set:(k,v)=>{data[k]=v;return true},remove:k=>{delete data[k]},clearNamespace:()=>{Object.keys(data).forEach(k=>delete data[k])}};');
  const prefs = path.join(stage, 'miniprogram/services/ai-preferences.js');
  fs.writeFileSync(prefs, fs.readFileSync(prefs, 'utf8').replace('wx.getStorageSync(STORAGE)', 'null'));
  const app = JSON.parse(fs.readFileSync(path.join(stage, 'miniprogram/app.json')));
  app.pages = ['pages/inbox/index', ...app.pages.filter(p => p !== 'pages/inbox/index')];
  write('miniprogram/app.json', JSON.stringify(app));
  write('miniprogram/services/assistant.js', `const storage=require('../utils/storage'); const {STORAGE_KEYS}=require('../utils/constants');
module.exports.request=async(action,values={})=>{const r=await getApp().localDemoRequest({action,...values});if(!r.ok)throw new Error('Local demo failed');if(r.memories)storage.set(STORAGE_KEYS.MEMORIES,r.memories);return r.data};`);
  for (const name of ['inbox', 'timeline']) {
    const file = path.join(stage, `miniprogram/pages/${name}/index.wxml`);
    fs.writeFileSync(file, '<view style="background:#fff0be;color:#644514;padding:16rpx;text-align:center;font-size:24rpx">本地演示 · 测试内容 · 未连接云端</view>\n' + fs.readFileSync(file, 'utf8'));
  }
  const r = createRequire(process.env.AUTOMATOR_PACKAGE || '/Users/wsy/学业/移动软件开发/实验报告/实验六/.制作记录/自动验收/node_modules/miniprogram-automator/package.json');
  const MP = r('./out/MiniProgram').default;
  const cmp = r('licia/cmpVersion');
  MP.prototype.checkVersion = async function () { const info = await this.systemInfo(); assert(cmp(info.SDKVersion, '2.7.3') >= 0); };
  mp = await r('./').launch({ projectPath: stage, cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', timeout: 45000 });
  await mp.exposeFunction('localDemoBridge', async (id, data) => {
    let result;
    try {
      const res=await fetch(origin+'/inbox',{method:'POST',headers:{Authorization:'Bearer '+session,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});
      result=await res.json();
    } catch (_) {result={ok:false};}
    await mp.evaluate((id,result)=>{const done=getApp().localDemoPending[id];if(done){delete getApp().localDemoPending[id];done(result);}},id,result);
  });
  await mp.evaluate(() => {
    const app=getApp(); app.localDemoPending={}; let sequence=0;
    app.localDemoRequest=data=>new Promise(resolve=>{const id=++sequence;app.localDemoPending[id]=resolve;localDemoBridge(id,data);});
  });
  let page = await mp.reLaunch('/pages/inbox/index');
  await page.waitFor(1200);
  await page.callMethod('refresh');
  await page.waitFor(600);
  assert.equal((await page.data('drafts')).length, 0);
  assert.equal(await page.data('error'), '');
  await mp.screenshot({ path: path.join(output, '01-empty.png') });
  const draft = { kind: 'memory', title: '本地演示：完成课程汇报', content: '测试内容：今天介绍了小岛手账、成长目标，以及 AI 辅助整理记录的想法。', date: new Date().toISOString().slice(0, 10) };
  const submit = await protocol({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'summerverse_submit', arguments: { requestId: 'local-demo-1', draft } } });
  assert.equal(submit.result.isError, false);
  assert.equal(Object.keys(db.snapshot().memories || {}).length, 0);
  await page.callMethod('refresh');
  const drafts = await page.data('drafts'); assert.equal(drafts.length, 1);
  assert.equal(drafts[0].draft.title, draft.title);
  await mp.screenshot({ path: path.join(output, '02-draft.png') });
  await (await page.$('.inbox-actions .primary-button')).tap();
  await page.waitFor(200);
  assert.equal((await page.data('editing')).title, draft.title);
  await mp.screenshot({ path: path.join(output, '03-confirm.png') });
  await (await page.$('.editor .primary-button')).tap();
  await page.waitFor(700);
  assert.equal((await page.data('drafts')).length, 0);
  assert.equal(Object.keys(db.snapshot().memories).length, 1);
  const status = await protocol({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'summerverse_status', arguments: { requestId: 'local-demo-1' } } });
  assert.equal(JSON.parse(status.result.content[0].text).data.status, 'accepted');
  page = await mp.reLaunch('/pages/timeline/index'); await page.waitFor(700);
  const memories = await page.data('allMemories'); assert.equal(memories.length, 1); assert.equal(memories[0].title, draft.title);
  await mp.screenshot({ path: path.join(output, '04-memory.png') });
  const report = { ok: true, scope: 'native simulator + automator binding + loopback HTTP + production MCP protocol and business services + in-memory DB; stage-only local storage bridge', modelCall: false, cloudCall: false, draftBeforeAccept: 1, memoriesBeforeAccept: 0, memoriesAfterAccept: memories.length, mcpStatus: 'accepted' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, report }));
})().catch(e => { console.error(e.stack); console.error('Evidence directory: ' + output); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  // Remove the temporary session credential from the isolated stage after the server stops.
  const adapter = path.join(stage, 'miniprogram/services/assistant.js');
  if (fs.existsSync(adapter)) fs.writeFileSync(adapter, "module.exports.request=async()=>{throw new Error('本地演示已结束，请重新运行演示脚本')};");
  if (mp) {
    try { await mp.close(); }
    catch (_) { try { await mp.disconnect(); } catch (_) {} }
  }
});
