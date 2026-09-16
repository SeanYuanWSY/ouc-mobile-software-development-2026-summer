// Native WeChat simulator acceptance. All data, model replies and assistant jobs
// are synthetic, in an isolated stage; no cloud, user storage, credentials or model calls.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const policy = require('../miniprogram/utils/material-policy');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', `local-experience-demo-${Date.now()}`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-experience-demo-'));
fs.mkdirSync(output, { recursive: true });
let mp;
const runtimeErrors = [], checks = [], bounds = {}, screenshots = [], sourceHashes = {};
const write = (rel, text) => fs.writeFileSync(path.join(stage, rel), text);
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const longTitle = '课程汇报交付检查：整理真实页面截图、说明主要功能与目前进展，并核对所有引用资料和未完成事项';
const sources = [{ id: 'notice-ui-fixture', name: `合成通知：${longTitle}`, kind: 'text', extraction: 'plain', warnings: [],
  chunks: [{ id: 'c1', locator: '文字 · 片段1', text: '本条是本地界面验收的虚构通知。课程汇报需要包含真实页面截图、主要功能以及目前进展。请先整理页面截图，再根据截图核对说明；展示尚未完成的部分，不把测试样例说成真实上线结果。' }] }];
const reportFixture = policy.analysis({ id: 'analysis-ui-fixture', mode: 'plan', model: 'synthetic-no-model-call', generatedAt: new Date().toISOString(), items: [
  { kind: 'task', title: longTitle, detail: '整理首页、资料工作台和专注任务的页面截图，并依据截图说明它们如何帮助用户完成当前这一步。', evidence: [{ sourceId: sources[0].id, chunkId: 'c1', quote: '课程汇报需要包含真实页面截图、主要功能以及目前进展' }] },
  { kind: 'check', title: '核对演示中的功能和实际进展', detail: '逐项区分已实现、已在本地验证以及尚待云端验证的部分。', evidence: [{ sourceId: sources[0].id, chunkId: 'c1', quote: '展示尚未完成的部分，不把测试样例说成真实上线结果' }] }
] }, sources);

async function shot(name) { await mp.screenshot({ path: path.join(output, `${name}.png`) }); screenshots.push(`${name}.png`); }
async function scroll(selector) { await mp.evaluate((value) => new Promise((resolve) => wx.pageScrollTo({ selector: value, offsetTop: -18, duration: 0, complete: resolve })), selector); await (await mp.currentPage()).waitFor(180); }
async function measure(name, selectors) {
  const result = await mp.evaluate((values) => new Promise((resolve) => {
    const query = wx.createSelectorQuery(); values.forEach((selector) => query.selectAll(selector).boundingClientRect()); query.exec(resolve);
  }), selectors);
  const info = await mp.systemInfo();
  bounds[name] = { selectors, results: result };
  result.forEach((rows, i) => {
    assert(rows && rows.length, `${name}: missing ${selectors[i]}`);
    rows.forEach((r) => { assert(r.width > 0 && r.height > 0, `${name}: zero size ${selectors[i]}`); assert(r.left >= -1 && r.right <= info.windowWidth + 1, `${name}: horizontal overflow ${selectors[i]} ${JSON.stringify(r)}`); });
  });
}
async function waitReady(page, property = 'busy') { await page.waitFor(async () => !(await page.data(property))); await page.waitFor(120); assert.equal(await page.data('error'), ''); }

(async () => {
  fs.cpSync(path.join(root, 'miniprogram'), path.join(stage, 'miniprogram'), { recursive: true });
  const sourceFiles = files(path.join(root, 'miniprogram')).filter((file) => /\.(js|wxml|wxss|json)$/.test(file));
  for (const file of sourceFiles) sourceHashes[path.relative(root, file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json')));
  config.projectname = 'SummerVerse 三种体验与电脑接力本地验收'; delete config.cloudfunctionRoot;
  write('project.config.json', JSON.stringify(config));
  write('miniprogram/config/env.js', fs.readFileSync(path.join(stage, 'miniprogram/config/env.js'), 'utf8').replace('ENABLE_CLOUD: true', 'ENABLE_CLOUD: false'));
  assert.equal(require(path.join(stage, 'miniprogram/config/env.js')).ENABLE_CLOUD, false);
  // Substitute every sync-storage access before launch; existing app/user storage is never read.
  for (const file of files(path.join(stage, 'miniprogram')).filter((file) => file.endsWith('.js'))) {
    let text = fs.readFileSync(file, 'utf8');
    const rel = './' + path.relative(path.dirname(file), path.join(stage, 'miniprogram/ui-memory-store')).split(path.sep).join('/');
    text = text.replace(/wx\.(getStorageSync|setStorageSync|removeStorageSync|getStorageInfoSync)/g, (_, method) => `require('${rel}').${method}`);
    fs.writeFileSync(file, text);
  }
  write('miniprogram/ui-memory-store.js', `const store = Object.create(null); const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v)); module.exports = {getStorageSync:k=>clone(store[k]),setStorageSync:(k,v)=>{store[k]=clone(v)},removeStorageSync:k=>{delete store[k]},getStorageInfoSync:()=>({keys:Object.keys(store)})};`);
  const fixtureSource = `const storage=require('./ui-memory-store'); const clone=v=>JSON.parse(JSON.stringify(v)); const jobs=[]; let sequence=0;
const connection={id:'fixture-connection',name:'本地界面验收助手 · 无外部连接',workJobs:true,revoked:false,expiresAt:Date.now()+86400000};
module.exports={cloudAttempts:0,seed(){storage.setStorageSync('summerverse.onboarded.v1',true);storage.setStorageSync('summerverse.memories.v1',[{_id:'fixture-memory',title:'合成验收记录：三种模式共用这一条',content:'仅供本地界面验收，不是用户的真实记录。',date:'2026-09-12',time:'10:00',category:'life',mood:'happy',tags:[],media:[],source:'manual'}]);},snapshot(){return {memories:storage.getStorageSync('summerverse.memories.v1'),workspaces:storage.getStorageSync('summerverse.material-workspaces.v1'),keys:storage.getStorageInfoSync().keys}},async request(action,payload={}){
if(action==='capabilities')return {jobsProtocol:'relay-v1'};if(action==='list')return {connections:[connection],drafts:[]};if(action==='job.list')return {jobs:clone(jobs)};
if(action==='job.create'){let job=jobs.find(j=>j.requestId===payload.requestId);if(!job){const w=storage.getStorageSync('summerverse.material-workspaces.v1')[payload.workspaceId];job={id:'fixture-job-'+(++sequence),requestId:payload.requestId,status:'queued',title:w.title,prompt:payload.prompt,connectionName:connection.name,sourceCount:payload.sourceIds.length,sources:w.sources.filter(s=>payload.sourceIds.includes(s.id)),createdAt:Date.now()};jobs.push(job);}return {job:clone(job)};}
const job=jobs.find(j=>j.id===payload.id);if(!job)throw Error('合成任务不存在');if(action==='job.accept')job.status='accepted';if(action==='job.cancel')job.status='cancelled';return {job:clone(job)};},advanceJob(id){const j=jobs.find(j=>j.id===id);j.status='review';j.result={title:'合成回传：课程汇报检查结果与需要你核实的交付内容',text:'这是固定的本地界面测试回传，没有调用外部模型，也没有检查用户电脑。\\n\\n根据所选通知，可以先准备真实页面截图，再写主要功能和目前进展。云端情况需要另外核验。',evidence:[{sourceId:j.sources[0].id,chunkId:j.sources[0].chunks[0].id,quote:'课程汇报需要包含真实页面截图、主要功能以及目前进展'}]};return clone(j);}};`;
  write('miniprogram/ui-fixture.js', fixtureSource);
  const appFile = path.join(stage, 'miniprogram/app.js'); fs.writeFileSync(appFile, fs.readFileSync(appFile, 'utf8').replace('onLaunch(options = {}) {', "onLaunch(options = {}) { this._uiFixture = require('./ui-fixture'); this._uiFixture.seed();"));
  fs.appendFileSync(path.join(stage, 'miniprogram/services/cloud.js'), "\nmodule.exports.callFunction=async()=>{getApp()._uiFixture.cloudAttempts++;throw Error('本地验收禁止云端调用')};\n");
  fs.appendFileSync(path.join(stage, 'miniprogram/services/ai.js'), `\nmodule.exports.analyzeMaterials=async()=>(${JSON.stringify(reportFixture)});\n`);
  write('miniprogram/services/assistant.js', "const fixture=require('../ui-fixture');module.exports={request:(...args)=>fixture.request(...args)};\n");
  for (const name of ['island', 'materials', 'focus', 'relay']) {
    const file = path.join(stage, `miniprogram/pages/${name}/index.wxml`);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/>\n/, '>\n<text class="ui-fixture-label">本地验收 · 合成资料与回复</text>\n'));
  }
  fs.appendFileSync(path.join(stage, 'miniprogram/app.wxss'), '\n.ui-fixture-label{position:fixed;right:8rpx;bottom:4rpx;z-index:999;color:#59401f;background:#fff0c8;font-size:16rpx;padding:4rpx 8rpx;border-radius:6rpx;}\n');
  const r = createRequire(process.env.AUTOMATOR_PACKAGE || '/Users/wsy/学业/移动软件开发/实验报告/实验六/.制作记录/自动验收/node_modules/miniprogram-automator/package.json');
  const MP = r('./out/MiniProgram').default, cmp = r('licia/cmpVersion');
  // Defer this library compatibility check until mp exists, so a startup compiler
  // failure can still be captured and this specific project can always be closed.
  MP.prototype.checkVersion = async function () {};
  mp = await r('./').launch({ projectPath: stage, cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', timeout: 45000 });
  mp.on('exception', (e) => runtimeErrors.push(String(e.message || e)));
  const systemInfo = await mp.systemInfo();
  assert(cmp(systemInfo.SDKVersion, '2.7.3') >= 0);
  console.log(JSON.stringify({ stage, output, viewport: { width: systemInfo.windowWidth, height: systemInfo.windowHeight, model: systemInfo.model } }));
  assert(systemInfo.windowWidth <= 430, 'Use a phone-size simulator for this acceptance');
  let page = await mp.reLaunch('/pages/island/index'); await page.waitFor(900);
  assert.equal(await page.data('experienceMode'), 'minimal'); assert.equal(await page.data('dataMode'), 'local');
  const memoryIds = await mp.evaluate(() => getApp()._uiFixture.snapshot().memories.map((m) => m._id));
  for (const mode of ['minimal', 'journal', 'focus', 'minimal']) {
    await (await page.$(`[data-mode="${mode}"]`)).tap(); await page.waitFor(200);
    assert.equal(await page.data('experienceMode'), mode);
    assert.deepEqual(await mp.evaluate(() => getApp()._uiFixture.snapshot().memories.map((m) => m._id)), memoryIds);
    await measure(`home-${mode}`, mode === 'journal' ? ['.island-header', '.experience-selector', '.island-stage', '.materials-entry'] : ['.island-header', '.experience-selector', '.workspace-headline', '.workspace-primary']);
    if (!screenshots.includes(`01-home-${mode}.png`)) await shot(`01-home-${mode}`);
  }
  checks.push('three-native-mode-buttons-share-one-record', 'nonblank-first-screen-all-modes');
  console.log('PASS: three native homepage modes');
  await (await page.$('.studio-card[data-mode="plan"]')).tap(); await page.waitFor(500); page = await mp.currentPage();
  assert.equal(page.path, 'pages/materials/index'); assert.equal(await page.data('selectedMode'), 'plan');
  await page.callMethod('setWorkspace', { id: 'workspace-ui-fixture', title: longTitle, sources, analysis: null, tasks: [], revision: 0 }, true);
  await page.callMethod('retrySave'); await waitReady(page);
  await scroll('.analyze-button'); await (await page.$('.analyze-button')).tap(); await waitReady(page);
  assert.equal((await page.data('workspace')).tasks.length, 0); assert.equal((await page.data('resultViews')).length, 2);
  await scroll('.results'); await measure('plan-long-title', ['.finding', '.finding-title', '.task-add']); await shot('02-plan-results');
  await mp.mockWxMethod('showModal', { confirm: false, cancel: true }); await (await page.$('.task-add')).tap(); await page.waitFor(160); assert.equal((await page.data('workspace')).tasks.length, 0);
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false }); await (await page.$('.task-add')).tap(); await waitReady(page);
  assert.equal((await page.data('workspace')).tasks.length, 1); await (await page.$('.task-add')).tap(); assert.equal((await page.data('workspace')).tasks.length, 1);
  console.log('PASS: plan results and explicit task confirmation');
  await scroll('.task-focus'); await shot('03-confirmed-task'); await (await page.$('.task-focus')).tap(); await page.waitFor(550); page = await mp.currentPage();
  assert.equal(page.path, 'pages/focus/index'); await waitReady(page, 'loading'); assert.equal((await page.data('task')).done, false);
  await measure('focus-long-title', ['.focus-picker', '.focus-task-title', '.focus-clock', '.focus-primary']); await shot('04-focus-ready');
  await scroll('.focus-primary'); await (await page.$('.focus-primary')).tap(); await page.waitFor(1150); assert.equal(await page.data('sessionState'), 'running');
  const clockBeforeHide = await page.data('clock');
  await mp.navigateTo('/pages/materials/index'); await (await mp.currentPage()).waitFor(1800); await mp.navigateBack(); page = await mp.currentPage(); await waitReady(page, 'loading');
  assert.equal(await page.data('sessionState'), 'running'); assert((await page.data('clock')) < clockBeforeHide, 'timer must use real elapsed time after navigation hide/show');
  assert.equal((await page.data('task')).done, false); await scroll('.focus-clock'); await shot('05-focus-resumed');
  await scroll('.focus-complete'); await (await page.$('.focus-complete')).tap(); await waitReady(page); assert.equal((await page.data('task')).done, true);
  await shot('06-focus-manually-completed');
  checks.push('plan-no-automatic-task', 'task-confirm-refusal-and-acceptance', 'task-double-add-blocked', 'focus-native-timer', 'focus-navigation-hide-show-elapsed-recovery', 'focus-manual-only-completion');
  console.log('PASS: focus timer, hide/show recovery, manual completion');
  page = await mp.reLaunch('/pages/relay/index?workspaceId=workspace-ui-fixture'); await waitReady(page, 'loading');
  assert.equal(await page.data('ready'), true); assert.equal((await page.data('connections')).length, 1); assert.equal(await page.data('sourceCount'), 1);
  await measure('relay-dispatch-long-title', ['.relay-headline', '.relay-picker', '.relay-source']); await shot('07-relay-dispatch');
  await page.callMethod('onPrompt', { detail: { value: '合成验收任务：按照通知检查当前课程汇报，回传可核对的说明和资料出处。' } });
  await scroll('.relay-submit'); await mp.mockWxMethod('showModal', { confirm: false, cancel: true }); await (await page.$('.relay-submit')).tap(); await waitReady(page); assert.equal((await page.data('jobs')).length, 0);
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false }); await (await page.$('.relay-submit')).tap(); await waitReady(page); assert.equal((await page.data('jobs')).length, 1);
  const jobId = (await page.data('detail')).id; assert.equal((await page.data('detail')).status, 'queued'); await scroll('.relay-detail'); await shot('08-relay-queued');
  await mp.evaluate((id) => getApp()._uiFixture.advanceJob(id), jobId);
  await page.callMethod('refreshQueue'); await waitReady(page); await (await page.$('.relay-job')).tap(); await waitReady(page);
  assert.equal((await page.data('detail')).status, 'review'); await scroll('.relay-result'); await measure('relay-result-long-title', ['.relay-result-title', '.relay-result-text', '.relay-citation']); await shot('09-relay-result');
  await (await page.$('.relay-citation')).tap(); await page.waitFor(150); assert.equal((await page.data('evidenceOpen')).locator, '文字 · 片段1'); await shot('10-relay-evidence'); await page.callMethod('closeEvidence');
  await scroll('.relay-result .primary-button'); await (await page.$('.relay-result .primary-button')).tap(); await waitReady(page); assert.equal((await page.data('detail')).status, 'accepted'); await shot('11-relay-accepted');
  const finalSnapshot = await mp.evaluate(() => getApp()._uiFixture.snapshot()); assert.equal(finalSnapshot.memories.length, 1); assert.equal(finalSnapshot.workspaces['workspace-ui-fixture'].tasks.length, 1);
  assert.equal(finalSnapshot.workspaces['workspace-ui-fixture'].tasks[0].done, true); assert.equal(await mp.evaluate(() => getApp()._uiFixture.cloudAttempts), 0);
  checks.push('relay-explicit-consent', 'relay-queued-before-fixture-return', 'relay-manual-refresh', 'relay-evidence-drawer', 'relay-accept-does-not-create-record-or-task');
  assert.equal(runtimeErrors.length, 0);
  const report = { ok: true, stage, systemInfo, checks, bounds, screenshots, runtimeErrors, sourceHashes,
    runtimeErrorCaptureScope: 'automator exception events after connection; startup IDE console messages require separate inspection',
    cloudCall: false, modelCall: false, externalAssistantCall: false, storage: 'isolated in-memory fixture, existing wx storage not read',
    scope: 'Real native WeChat simulator and Page/WXML handlers; fixed material AI result and in-memory assistant job fixture. Focus recovery uses real navigateTo/navigateBack lifecycle, not an actual suspended OS process.' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: true, output, checks }));
})().catch(async (error) => {
  if (mp) { try { await shot('failure'); const page = await mp.currentPage(); console.error(JSON.stringify({ path: page.path, error: await page.data('error'), busy: await page.data('busy') })); } catch (_) {} }
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ ok: false, error: error.stack, checks, bounds, screenshots, runtimeErrors, stage }, null, 2));
  console.error(error.stack); console.error('Evidence: ' + output); process.exitCode = 1;
}).finally(async () => {
  if (mp) { try { await mp.close(); return; } catch (_) { try { await mp.disconnect(); } catch (_) {} } }
  // launch can fail before returning mp (e.g. a WXML compile failure).
  // Close only this exact isolated project, never all the user's DevTools windows.
  try { await promisify(execFile)('/Applications/wechatwebdevtools.app/Contents/MacOS/cli', ['close', '--project', stage], { timeout: 10000 }); } catch (_) {}
});
