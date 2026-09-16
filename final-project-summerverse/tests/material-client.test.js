const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
const policy = require('../miniprogram/utils/material-policy');
const experience = require('../miniprogram/utils/experience');
const source = { id: 's1', name: '通知', kind: 'text', extraction: 'plain', chunks: [{ id: 'c1', locator: '正文', text: '周五交报告' }], warnings: [] };
const report = { id: 'a1', mode: 'requirements', items: [{ kind: 'task', title: '提交报告', detail: '核对要求后上传', evidence: [{ sourceId: 's1', chunkId: 'c1', quote: '周五交报告' }] }] };
function loadService({ cloud = false, consent = true, failSave = false } = {}) {
  const calls = [], app = { globalData: {} }; let modalCount = 0, stored;
  const wx = { getStorageSync: () => stored, setStorageSync: (_, value) => { if (failSave) throw Error('storage full'); stored = structuredClone(value); }, showModal: (o) => { modalCount++; o.success({ confirm: consent }); }, getFileSystemManager: () => ({ getFileInfo: (o) => o.success({ size: 20 }), readFile: (o) => o.success({ data: '周五交报告' }) }) };
  prepareSubject({
    subject: '../miniprogram/services/materials',
    mocks: [
      { spec: '../utils/material-policy', value: policy },
      { spec: './cloud', value: { waitForCloudReady: async () => cloud, callFunction: async (name, args) => {
        calls.push({ name, args });
        if (args.action === 'capabilities') return { data: { materialsProtocol: 'materials-v1', webMaterials: true } };
        if (args.action === 'materialWebExtract') return { data: { title: '课程通知', domain: 'course.example', extraction: 'web-text', chunks: [{ id: 'c1', locator: '网页 · 片段1', text: '周五之前提交课程报告和源代码。' }], warnings: [] } };
        return { data: { revision: 1, updatedAt: '2026-09-11' } };
      } } },
      { spec: './media', value: {} },
      { spec: './ai', value: {} },
    ],
    globals: { getApp: () => app, wx },
  });
  return { api: require('../miniprogram/services/materials'), calls, app, wx, count: () => modalCount };
}
function loadPage(apiOverride = {}, modelOverride) {
  let page, saved = [], next = 0, confirms = true, modals = 0;
  const app = { globalData: {} };
  const api = { makeId: () => `w${++next}`, mode: async () => 'local', list: async () => [], textSource: (name, text) => ({ ...source, name, chunks: [{ ...source.chunks[0], text }] }), webMeta: () => null, normalizeWebUrl: (value) => value, agreeCloudStorage() {}, save: async (w, r) => { saved.push(structuredClone(w)); return { revision: r + 1 }; }, ...apiOverride };
  prepareSubject({
    subject: '../miniprogram/pages/materials/index',
    mocks: [
      { spec: '../../utils/experience', value: experience },
      { spec: '../../utils/material-policy', value: policy },
      { spec: '../../services/materials', value: api },
      { spec: '../../services/ai', value: { analyzeMaterials: modelOverride || (async () => report) } },
      { spec: '../../utils/navigation', value: {} },
    ],
    globals: { Page: (p) => { page = p; }, getApp: () => app, wx: { showModal: (o) => { modals++; o.success({ confirm: confirms }); }, getClipboardData: (o) => o.success({ data: 'https://course.example/notice' }) } },
  });
  require('../miniprogram/pages/materials/index');
  page.setData = (values) => { for (const [path, value] of Object.entries(values)) { const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.'); const last = keys.pop(); const target = keys.reduce((object, key) => object[key], page.data); target[last] = value; } }; page.onLoad();
  page.setWorkspace({ id: 'w1', title: '报告', sources: [source], tasks: [], analysis: null, revision: 0 });
  return { page, saved, app, setConfirm: (v) => { confirms = v; }, modals: () => modals };
}
test('TXT本地解析和粘贴文字首次云保存都需明确同意，拒绝不上传', async () => {
  const f = loadService({ cloud: true, consent: false });
  const imported = await f.api.importFile({ path: 'wxfile://tmp/test.txt', name: 'test.txt' });
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.api.save({ id: 'w', title: '资料', sources: [imported.source] }, 0), /尚未同意/);
  assert.equal(f.count(), 1); assert.equal(f.calls.length, 0);
  const yes = loadService({ cloud: true });
  await yes.api.save({ id: 'w', title: '文字', sources: [source] }, 0);
  await yes.api.save({ id: 'w', title: '文字', sources: [source] }, 1);
  assert.equal(yes.count(), 1); assert.equal(yes.calls.filter((c) => c.args.action === 'material.save').length, 2);
  assert.equal(yes.app.globalData.materialStorageConsent, true);
});
test('本机资料可恢复且不需云同意；存储失败不能伪装保存成功', async () => {
  const f = loadService(); await f.api.save({ id: 'w', title: '离线资料', sources: [source] }, 0);
  assert.equal((await f.api.get('w')).sources[0].chunks[0].text, '周五交报告'); assert.equal(f.count(), 0);
  assert.equal((await f.api.list()).length, 1); assert.equal(f.calls.length, 0);
  await assert.rejects(loadService({ failSave: true }).api.save({ id: 'w', title: '资料' }, 0), /storage full/);
});
test('页面离开后的迟到同意不留下全局保存权限，也不上传原资料', async () => {
  const f = loadService({ cloud: true }); let confirm, alive = true;
  f.wx.showModal = (o) => { confirm = () => o.success({ confirm: true }); };
  const save = f.api.save({ id: 'w', title: '资料', sources: [source] }, 0, () => { if (!alive) throw Error('已离开'); });
  while (!confirm) await Promise.resolve(); alive = false; confirm();
  await assert.rejects(save, /已离开/); assert.equal(f.calls.length, 0); assert.equal(f.app.globalData.materialStorageConsent, undefined);
});
test('文件入口拒绝远程地址、路径上跳和未实现格式', () => {
  const { api } = loadService();
  for (const path of ['https://evil.example/file.pdf', 'wxfile://tmp/../secret.pdf', 'file://tmp/a\\b.pdf']) assert.throws(() => api.fileMeta({ path, name: 'x.pdf' }));
  assert.throws(() => api.fileMeta({ path: 'wxfile://tmp/a', name: 'voice.mp3' }));
  assert.equal(api.fileMeta({ path: 'wxfile://tmp/noextension', name: '课件.pptx' }).kind, 'pptx');
});
test('公开网页地址只经专用入口读取，结果不保存完整网址', async () => {
  const f = loadService({ cloud: true });
  for (const bad of ['file:///etc/passwd', 'https://user:pass@example.com/a', 'https://example.com/a?token=secret', 'https://example.com/a?X-Amz-Signature=secret', 'https://localhost/a']) assert.throws(() => f.api.normalizeWebUrl(bad));
  const { source: imported } = await f.api.importWeb('https://course.example/notice?id=4#part');
  assert.equal(imported.kind, 'web'); assert.equal(imported.domain, 'course.example');
  assert(!JSON.stringify(imported).includes('notice?id=4'));
  assert.equal(f.calls.filter((call) => call.args.action === 'materialWebExtract').length, 1);
});
test('聊天网页只进入待确认状态，拒绝确认时不抓取也不保存', async () => {
  let imports = 0;
  const f = loadPage({
    webMeta: (item) => item.type === 'text/html' ? { url: item.path } : null,
    normalizeWebUrl: (value) => value,
    importWeb: async () => { imports++; return { source }; }
  });
  f.app.globalData.pendingMaterials = [{ type: 'text/html', path: 'https://course.example/notice' }];
  f.page.onShow();
  assert.equal(f.page.data.linkOpen, true); assert.equal(f.page.data.linkDraft, 'https://course.example/notice'); assert.equal(imports, 0);
  f.setConfirm(false); await f.page.addLink();
  assert.equal(imports, 0); assert.equal(f.saved.length, 0);
});
test('生成分析不会写任务，拒绝确认不加入，重复点击不重复加入，完成只能手动勾选', async () => {
  const f = loadPage(), p = f.page; await p.analyze(); assert.equal(p.data.workspace.tasks.length, 0);
  f.setConfirm(false); await p.addTask({ currentTarget: { dataset: { id: 'item-1' } } }); assert.equal(p.data.workspace.tasks.length, 0);
  f.setConfirm(true); await Promise.all([p.addTask({ currentTarget: { dataset: { id: 'item-1' } } }), p.addTask({ currentTarget: { dataset: { id: 'item-1' } } })]);
  assert.equal(p.data.workspace.tasks.length, 1); assert.equal(p.data.workspace.tasks[0].done, false);
  assert.match(p.data.workspace.tasks[0].provenance, /周五交报告/);
  await p.toggleTask({ currentTarget: { dataset: { id: p.data.workspace.tasks[0].id } } }); assert.equal(p.data.workspace.tasks[0].done, true);
});
test('分析中离开页面，迟到的模型回复不会保存或改变当前资料', async () => {
  let done; const f = loadPage({}, () => new Promise((resolve) => { done = resolve; }));
  const run = f.page.analyze(); await Promise.resolve(); f.page.onUnload(); done(report); await run;
  assert.equal(f.saved.length, 0); assert.equal(f.page.data.workspace.analysis, null);
});
test('答辩练习先隐藏参考答案，自己输入不会调用AI或保存，重新打开不会恢复练习输入', async () => {
  let calls = 0;
  const generated = { id: 'practice-report', mode: 'defense', items: [{ kind: 'practice', title: '什么时候提交报告？', detail: '通知要求周五提交。', evidence: [{ sourceId: 's1', chunkId: 'c1', quote: '周五交报告' }] }] };
  const f = loadPage({}, async () => { calls++; return generated; });
  f.page.selectMode({ currentTarget: { dataset: { mode: 'defense' } } });
  await f.page.analyze();
  assert.equal(f.page.data.resultViews[0].answerVisible, false);
  const savedCount = f.saved.length;
  f.page.onPracticeAnswer({ currentTarget: { dataset: { id: 'item-1' } }, detail: { value: '我记得是周五' } });
  f.page.togglePractice({ currentTarget: { dataset: { id: 'item-1' } } });
  assert.equal(f.page.data.resultViews[0].ownAnswer, '我记得是周五');
  assert.equal(f.page.data.resultViews[0].answerVisible, true);
  assert.equal(calls, 1); assert.equal(f.saved.length, savedCount);
  assert.equal(JSON.stringify(f.saved).includes('我记得是周五'), false);
  const reopened = loadPage(); reopened.page.setWorkspace(f.saved.at(-1));
  assert.equal(reopened.page.data.resultViews[0].ownAnswer, '');
  assert.equal(reopened.page.data.resultViews[0].answerVisible, false);
});
test('标题输入只传标题补丁，不重复传输资料正文', () => {
  const f = loadPage(); let update;
  f.page.setData = (value) => { update = value; };
  f.page.onTitle({ detail: { value: '课程汇报' } });
  assert.deepEqual(Object.keys(update).sort(), ['saveState', 'unsaved', 'workspace.title']);
});
test('云保存拒绝或冲突保留未保存内容；移除资料会清空过期分析', async () => {
  const f = loadPage({ save: async () => { throw Error('保存冲突'); } });
  f.page.data.textName = '通知'; f.page.data.textDraft = '周一交'; f.page.data.workspace.sources = [];
  await f.page.addText(); assert(f.page.data.unsaved); assert.equal(f.page.data.workspace.sources[0].chunks[0].text, '周一交'); assert.match(f.page.data.error, /保存冲突/);
  const g = loadPage(); await g.page.analyze(); await g.page.removeSource({ currentTarget: { dataset: { id: 's1' } } });
  assert.equal(g.page.data.workspace.analysis, null); assert.equal(g.page.data.resultViews.length, 0);
});
test('只有1173文件打开场景接收forwardMaterials，冷启动不重复入队，query不能伪造', () => {
  let app;
  prepareSubject({
    subject: '../miniprogram/app',
    mocks: [{ spec: './config/env', value: {} }, { spec: './services/ai-preferences', value: {} }],
    globals: { App: (a) => { app = a; } },
  });
  require('../miniprogram/app');
  const files = [{ path: 'wxfile://tmp/a', name: 'a.pdf', size: 50, type: 'application/pdf' }];
  app.captureMaterials({ scene: 1001, query: { forwardMaterials: files } }); assert.equal(app.globalData.pendingMaterials.length, 0);
  app.captureMaterials({ scene: 1173, forwardMaterials: files }); assert.equal(app.globalData.pendingMaterials.length, 1);
  app.globalData.pendingMaterials = []; app.captureMaterials({ scene: 1173, forwardMaterials: files }); assert.equal(app.globalData.pendingMaterials.length, 0);
});
