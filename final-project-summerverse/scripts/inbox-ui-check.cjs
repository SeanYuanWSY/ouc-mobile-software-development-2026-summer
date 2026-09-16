const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const r = createRequire(process.env.AUTOMATOR_PACKAGE);
const MP = r('./out/MiniProgram').default;
const cmp = r('licia/cmpVersion');
MP.prototype.checkVersion = async function () { const s = await this.systemInfo(); assert(cmp(s.SDKVersion, '2.7.3') >= 0); };
const automator = r('./');
let mp;
(async () => {
  const projectPath = process.env.QA_PROJECT;
  assert(projectPath && projectPath.includes('summerverse-release-'));
  assert(fs.readFileSync(path.join(projectPath, 'miniprogram/config/env.js'), 'utf8').includes('ENABLE_CLOUD: false'));
  mp = process.env.QA_CONNECT ? await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9422' }) : await automator.launch({ projectPath, cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', port: 9422, timeout: 45000 });
  const page = await mp.reLaunch('/pages/inbox/index');
  await page.waitFor(1200);
  assert(await page.$('.inbox-heading'));
  await page.callMethod('toggleConnections');
  assert.equal(await page.data('showConnections'), true);
  await mp.screenshot({ path: path.join(projectPath, 'inbox-empty.png') });
  // Explicit UI-only fixtures, no cloud requests or user data, not evidence of deployed operation.
  await page.setData({ error: '', drafts: [{ id: 'ui-only', connectionName: '界面测试助手', draft: { kind: 'memory', title: '界面测试：今天的学习收获', content: '这是一份用于检查排版的测试草稿，不会写入云端。', date: '2026-09-09' } }] });
  await page.callMethod('edit', { currentTarget: { dataset: { id: 'ui-only' } } });
  assert.equal(await page.data('editing.title'), '界面测试：今天的学习收获');
  await mp.screenshot({ path: path.join(projectPath, 'inbox-draft.png') });
  console.log(JSON.stringify({ ok: true, projectPath, evidence: 'native simulator UI with explicitly labelled fixture; no cloud writes' }));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => { if (mp) await mp.disconnect(); });
