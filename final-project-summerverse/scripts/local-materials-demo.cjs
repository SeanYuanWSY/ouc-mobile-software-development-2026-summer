// Native WeChat simulator acceptance. Synthetic documents + fixture model reply;
// real parser, policy, page bindings and local workspace persistence. No cloud/Key.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { word } = require('./demo/material-fixtures.cjs');
const { extractDocument } = require('../cloudfunctions/deepseekProxy/material-parser');
const { analyze } = require('../cloudfunctions/deepseekProxy/material-ai');
const { extractedSource } = require('../cloudfunctions/deepseekProxy/material-web');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', `local-materials-demo-${Date.now()}`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'summerverse-materials-demo-'));
fs.mkdirSync(output, { recursive: true });
let mp;
const write = (rel, value) => fs.writeFileSync(path.join(stage, rel), value);
(async () => {
  const doc = await extractDocument(word(), 'docx');
  const sources = [
    { id: 'doc-source', name: '演示资料：课程要求.docx', kind: 'docx', ...doc },
    { id: 'notice-source', name: '演示资料：老师补充通知', kind: 'text', extraction: 'plain', chunks: [{ id: 'c1', locator: '文字 · 片段1', text: '补充通知：截止时间改为周日20点，演示视频控制在3分钟以内。' }], warnings: [] }
  ];
  const data = await analyze({ sources, mode: 'compare' }, {}, async () => ({ model: 'local-fixture-no-model-call', content: JSON.stringify({ items: [
    { kind: 'change', title: '两份通知的截止时间不同', detail: '原要求为周五18点，补充通知写的是周日20点。建议核对补充通知是否为老师的最终安排。', evidence: [{ sourceId: 'doc-source', chunkId: 'c1', quote: '周五18点前提交报告和演示视频' }, { sourceId: 'notice-source', chunkId: 'c1', quote: '截止时间改为周日20点' }] },
    { kind: 'task', title: '准备报告和3分钟内的演示视频', detail: '整理报告，录制并检查演示视频时长。确认最终截止时间后提交。', evidence: [{ sourceId: 'doc-source', chunkId: 'c1', quote: '报告和演示视频' }, { sourceId: 'notice-source', chunkId: 'c1', quote: '演示视频控制在3分钟以内' }] },
    { kind: 'question', title: '还没有看到提交入口', detail: '这两份资料没有给出提交网址，需要向老师确认。', evidence: [] }
  ] }) }));
  fs.cpSync(path.join(root, 'miniprogram'), path.join(stage, 'miniprogram'), { recursive: true, filter: (p) => !/private/i.test(path.basename(p)) });
  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'))); project.projectname = 'SummerVerse 资料分析本地验收'; delete project.cloudfunctionRoot;
  write('project.config.json', JSON.stringify(project));
  write('miniprogram/config/env.js', fs.readFileSync(path.join(stage, 'miniprogram/config/env.js'), 'utf8').replace('ENABLE_CLOUD: true', 'ENABLE_CLOUD: false'));
  assert.equal(require(path.join(stage, 'miniprogram/config/env.js')).ENABLE_CLOUD, false);
  write('miniprogram/utils/storage.js', 'const data={}; module.exports={get:(k,f=null)=>data[k]===undefined?f:data[k],set:(k,v)=>{data[k]=v;return true},remove:k=>{delete data[k]},clearNamespace:()=>{Object.keys(data).forEach(k=>delete data[k])}};');
  const prefsFile = path.join(stage, 'miniprogram/services/ai-preferences.js'); fs.writeFileSync(prefsFile, fs.readFileSync(prefsFile, 'utf8').replace('wx.getStorageSync(STORAGE)', 'null'));
  const serviceFile = path.join(stage, 'miniprogram/services/materials.js');
  fs.writeFileSync(serviceFile, fs.readFileSync(serviceFile, 'utf8').replace("const LOCAL_KEY =", "const demoStorage = require('../utils/storage');\nconst LOCAL_KEY =").replace('wx.getStorageSync(LOCAL_KEY)', 'demoStorage.get(LOCAL_KEY)').replaceAll('wx.setStorageSync(LOCAL_KEY, all)', 'demoStorage.set(LOCAL_KEY, all)'));
  const webSource = { id: 'web-demo', name: '演示：课程网页', kind: 'web', ...extractedSource({ domain: 'course.example', mime: 'text/html', body: '<title>演示：课程网页</title><main><p>课程通知：周五18点前提交课程报告和源代码，报告需要包含页面介绍和主要功能。</p></main>' }) };
  fs.appendFileSync(serviceFile, `\n// UI-only synthetic network result. Actual extraction is tested separately.\nmodule.exports.importWeb = async (raw, options) => { normalizeWebUrl(raw); options.guard(); return { source: ${JSON.stringify(webSource)} }; };\n`);
  write('miniprogram/services/material-demo-fixture.js', `module.exports=${JSON.stringify(data)};`);
  const aiFile = path.join(stage, 'miniprogram/services/ai.js');
  fs.writeFileSync(aiFile, fs.readFileSync(aiFile, 'utf8').replace(/function analyzeMaterials\([^\n]+\n/, "function analyzeMaterials() { return Promise.resolve(require('./material-demo-fixture')); }\n"));
  const app = JSON.parse(fs.readFileSync(path.join(stage, 'miniprogram/app.json'))); app.pages = ['pages/materials/index', ...app.pages.filter((p) => p !== 'pages/materials/index')]; write('miniprogram/app.json', JSON.stringify(app));
  const pageWxml = path.join(stage, 'miniprogram/pages/materials/index.wxml');
  fs.writeFileSync(pageWxml, fs.readFileSync(pageWxml, 'utf8').replace('<view class="paper-card section import-section">', '<view style="background:#fff0be;color:#644514;padding:10rpx;text-align:center;font-size:20rpx;margin-bottom:20rpx;border-radius:14rpx">本地演示 · 虚构通知 · AI回复为测试样例</view><view class="paper-card section import-section">'));
  const r = createRequire(process.env.AUTOMATOR_PACKAGE || '/Users/wsy/学业/移动软件开发/实验报告/实验六/.制作记录/自动验收/node_modules/miniprogram-automator/package.json');
  const MP = r('./out/MiniProgram').default, cmp = r('licia/cmpVersion');
  MP.prototype.checkVersion = async function () { const info = await this.systemInfo(); assert(cmp(info.SDKVersion, '2.7.3') >= 0); };
  mp = await r('./').launch({ projectPath: stage, cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli', timeout: 45000 });
  const runtimeErrors = []; mp.on('exception', (e) => runtimeErrors.push(String(e.message || e)));
  let page = await mp.reLaunch('/pages/materials/index'); await page.waitFor(900);
  assert.equal(await page.data('error'), '');
  await mp.screenshot({ path: path.join(output, '01-import.png') });
  await (await page.$$('.import-buttons .secondary-button'))[2].tap();
  await page.setData({ linkDraft: 'https://course.example/homework?course=mobile#section' });
  await mp.mockWxMethod('showModal', { confirm: false, cancel: true });
  await (await page.$('.link-editor .primary-button')).tap(); await page.waitFor(200);
  assert.equal((await page.data('workspace')).sources.length, 0);
  await mp.screenshot({ path: path.join(output, '05-web-entry.png') });
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false });
  await (await page.$('.link-editor .primary-button')).tap(); await page.waitFor(250);
  assert.equal(await page.data('error'), '');
  assert.equal((await page.data('workspace')).sources[0].domain, 'course.example');
  assert.equal(await page.data('linkDraft'), '');
  assert.equal(await page.data('unsaved'), false);
  await mp.screenshot({ path: path.join(output, '06-web-source.png') });
  await page.callMethod('newWorkspace');
  await (await page.$$('.import-buttons .secondary-button'))[1].tap();
  await page.setData({ textName: '演示：老师通知', textDraft: '周五交报告' });
  await (await page.$('.text-editor .primary-button')).tap(); await page.waitFor(300);
  assert.equal((await page.data('workspace')).sources.length, 1); assert.equal(await page.data('unsaved'), false);
  // Load real DOCX extraction and a synthetic second notice into the actual workspace.
  await page.callMethod('setWorkspace', { id: 'demo-workspace', title: '演示：我的课程汇报', sources, tasks: [], analysis: null, revision: 0 });
  await page.callMethod('retrySave'); await page.waitFor(200);
  await page.callMethod('selectMode', { currentTarget: { dataset: { mode: 'compare' } } });
  await mp.evaluate(() => new Promise((resolve) => wx.pageScrollTo({ selector: '.analyze-button', duration: 0, complete: resolve }))); await page.waitFor(150);
  await (await page.$('.analyze-button')).tap(); await page.waitFor(400);
  assert.equal(await page.data('error'), '');
  assert.equal((await page.data('resultViews')).length, 3); assert.equal((await page.data('workspace')).tasks.length, 0); assert.equal(await page.data('error'), '');
  await mp.evaluate(() => new Promise((resolve) => wx.pageScrollTo({ selector: '.results', duration: 0, complete: resolve }))); await page.waitFor(200);
  await mp.screenshot({ path: path.join(output, '02-comparison.png') });
  await (await page.$('.citation')).tap(); await page.waitFor(200); assert.equal((await page.data('evidenceOpen')).chunks[0].locator, '文档正文');
  await mp.screenshot({ path: path.join(output, '03-evidence.png') }); await page.callMethod('closeEvidence');
  await mp.mockWxMethod('showModal', { confirm: true, cancel: false });
  await mp.evaluate(() => new Promise((resolve) => wx.pageScrollTo({ selector: '.task-add', duration: 0, complete: resolve }))); await page.waitFor(150);
  await (await page.$('.task-add')).tap(); await page.waitFor(300);
  assert.equal((await page.data('workspace')).tasks.length, 1); assert.equal((await page.data('workspace')).tasks[0].done, false);
  await (await page.$('.task-add')).tap(); await page.waitFor(150); assert.equal((await page.data('workspace')).tasks.length, 1);
  await mp.evaluate(() => new Promise((resolve) => wx.pageScrollTo({ scrollTop: 100000, duration: 0, complete: resolve }))); await page.waitFor(200);
  await (await page.$('.task-check')).tap(); await page.waitFor(200); assert.equal(await page.data('completed'), 1);
  await mp.screenshot({ path: path.join(output, '04-task.png') });
  page = await mp.reLaunch('/pages/materials/index'); await page.waitFor(400);
  await page.callMethod('openWorkspace', { currentTarget: { dataset: { id: 'demo-workspace' } } }); await page.waitFor(250);
  assert.equal(await page.data('completed'), 1); assert.equal((await page.data('sourceViews')).length, 2);
  await page.callMethod('newWorkspace'); await page.waitFor(100); assert.equal((await page.data('sourceViews')).length, 0);
  page = await mp.reLaunch('/pages/island/index'); await page.waitFor(450); await page.callMethod('skipOnboarding');
  await mp.evaluate(() => new Promise((resolve) => wx.pageScrollTo({ scrollTop: 0, duration: 0, complete: resolve }))); await page.waitFor(350);
  const bounds = await mp.evaluate(() => new Promise((resolve) => wx.createSelectorQuery().select('.materials-entry').boundingClientRect().exec((r) => resolve(r[0]))));
  const info = await mp.systemInfo(); assert(bounds.width > info.windowWidth * .8);
  await mp.screenshot({ path: path.join(output, '00-home-entry.png') });
  await (await page.$('.materials-entry')).tap(); await page.waitFor(850); assert.equal((await mp.currentPage()).path, 'pages/materials/index');
  const report = { ok: true, cloudCall: false, modelCall: false, scope: 'native WeChat simulator, real parsers and UI handlers; fixture AI and web network response, isolated in-memory storage', checks: ['web-entry-binding', 'web-consent-refusal', 'web-extracted-source-save', 'web-link-cleared', 'text-entry-binding', 'DOCX-parsing', 'comparison-citations', 'source-drawer', 'manual-task-confirmation', 'duplicate-prevention', 'manual-completion', 'workspace-reopen', 'homepage-entry'], runtimeErrors };
  assert.equal(runtimeErrors.length, 0); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, report }));
})().catch(async (e) => { if (mp) { try { await mp.screenshot({ path: path.join(output, 'failure.png') }); const p = await mp.currentPage(); console.error(JSON.stringify({ uiError: await p.data('error'), busy: await p.data('busy') })); } catch (_) {} } console.error(e.stack); console.error('Evidence directory: ' + output); process.exitCode = 1; }).finally(async () => {
  if (mp) { try { await mp.close(); } catch (_) { try { await mp.disconnect(); } catch (_) {} } }
});
