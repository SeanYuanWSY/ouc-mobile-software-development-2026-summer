const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSubject } = require('./helpers/subject-load');
const source = { id: 'source-a', name: '课程通知', kind: 'text', chunks: [{ id: 'c1', locator: '正文', text: '提交项目源代码和说明。' }] };
const workspace = { id: 'workspace-a', title: '课程项目', revision: 3, sources: [source] };
function harness(options = {}) {
  let page, serial = 0; const calls = [], updates = [];
  const app = { globalData: { cloudGeneration: 1 } };
  const wx = { showModal: (o) => o.success({ confirm: true }), ...options.wx };
  const api = { request: async (action, payload) => {
    calls.push({ action, payload: payload && structuredClone(payload) });
    if (options.request) { const result = options.request(action, payload); if (result !== undefined) return result; }
    if (action === 'capabilities') return { jobsProtocol: 'relay-v1' };
    if (action === 'list') return { drafts: [], connections: [{ id: 'connection-a', name: '我的电脑', workJobs: true, expiresAt: Date.now() + 3600000 }] };
    if (action === 'job.list') return { jobs: [] };
    if (action === 'job.create') return { job: { id: 'job-a', title: '课程项目', status: 'queued', sourceCount: 1 } };
    throw new Error('Unexpected action: ' + action);
  } };
  const materials = { list: async () => [{ id: 'workspace-a', title: '课程项目' }, { id: 'workspace-b', title: '另一个项目' }], get: options.get || (async () => structuredClone(workspace)), makeId: () => `request-${++serial}` };
  prepareSubject({
    subject: '../miniprogram/pages/relay/index',
    mocks: [
      { spec: '../../services/assistant', value: api },
      { spec: '../../services/materials', value: materials },
      { spec: '../../utils/navigation', value: {} },
    ],
    globals: { Page: (p) => { page = p; }, getApp: () => app, wx },
  });
  require('../miniprogram/pages/relay/index');
  page.setData = (value) => { updates.push(value); Object.assign(page.data, value); };
  page.onLoad();
  return { page, calls, app, wx, updates, start: async () => { page.onShow(); await new Promise(setImmediate); assert.equal(page.data.loading, false); page.onPrompt({ detail: { value: '核对本地项目的交付要求' } }); } };
}
test('手机发送前需明确同意，只传所选来源ID和版本，不接受客户端传入正文', async () => {
  const h = harness(); await h.start();
  h.wx.showModal = (o) => o.success({ confirm: false });
  await h.page.createJob(); assert.equal(h.calls.filter((c) => c.action === 'job.create').length, 0);
  h.wx.showModal = (o) => o.success({ confirm: true }); await h.page.createJob();
  const sent = h.calls.find((c) => c.action === 'job.create').payload;
  assert.deepEqual(sent.sourceIds, ['source-a']); assert.equal(sent.revision, 3);
  assert.equal('sources' in sent, false); assert.equal('token' in sent, false);
  assert.equal(h.page.data.detail.status, 'queued');
});
test('交接回执丢失后重试复用同一个请求，失败期间不允许修改原任务', async () => {
  let attempt = 0;
  const h = harness({ request: (action) => { if (action === 'job.create' && ++attempt === 1) return Promise.reject(Object.assign(new Error('timeout'), { outcomeUnknown: true })); } });
  await h.start(); await h.page.createJob();
  assert.equal(h.page.data.pending, true);
  h.page.onPrompt({ detail: { value: '不该换成另一件事' } });
  await h.page.createJob();
  const sent = h.calls.filter((c) => c.action === 'job.create');
  assert.deepEqual(sent[0].payload, sent[1].payload);
  assert.equal(h.page.data.pending, false); assert.equal(h.app.globalData.pendingRelayRequest, null);
});
test('交接回执丢失后网络重连仍保留去重身份，重新核对归属后复用原请求', async () => {
  let attempt = 0;
  const h = harness({ request: (action) => { if (action === 'job.create' && ++attempt === 1) return Promise.reject(Object.assign(new Error('timeout'), { outcomeUnknown: true })); } });
  await h.start(); await h.page.createJob();
  h.page.onHide(); h.app.globalData.cloudGeneration++; h.page.onShow();
  await new Promise(setImmediate);
  assert.equal(h.page.data.pending, true); assert.equal(h.page.data.pendingVerified, true);
  h.page.onPrompt({ detail: { value: '不应新建另一项任务' } });
  await h.page.createJob();
  const sent = h.calls.filter((c) => c.action === 'job.create');
  assert.equal(sent.length, 2); assert.deepEqual(sent[0].payload, sent[1].payload);
});
test('重连后原连接无法确权时保持待确认锁定，不自动改派给另一个连接', async () => {
  let disconnected = false;
  const h = harness({ request: (action) => {
    if (action === 'job.create') return Promise.reject(new Error('回执丢失'));
    if (action === 'list' && disconnected) return { connections: [{ id: 'connection-b', name: '另一台电脑', workJobs: true, expiresAt: Date.now() + 3600000 }] };
  } });
  await h.start(); await h.page.createJob();
  const requestId = h.app.globalData.pendingRelayRequest.payload.requestId;
  disconnected = true; h.page.onHide(); h.app.globalData.cloudGeneration++; h.page.onShow();
  await new Promise(setImmediate);
  assert.equal(h.page.data.pending, true); assert.equal(h.page.data.ready, false);
  assert.match(h.page.data.error, /无法确认/);
  await h.page.createJob();
  assert.equal(h.calls.filter((c) => c.action === 'job.create').length, 1);
  assert.equal(h.app.globalData.pendingRelayRequest.payload.requestId, requestId);
});
test('切换工作台失败后不发送上一份资料；超12k字拒绝不截断', async () => {
  const h = harness({ get: async (id) => { if (id === 'workspace-b') throw new Error('已删除'); return structuredClone(workspace); } });
  await h.start(); await h.page.selectWorkspace({ detail: { value: 1 } });
  await h.page.createJob(); assert.equal(h.calls.filter((c) => c.action === 'job.create').length, 0);
  const large = harness({ get: async () => ({ ...workspace, sources: [{ ...source, chunks: [{ ...source.chunks[0], text: '字'.repeat(12001) }] }] }) });
  await large.start(); await large.page.createJob();
  assert.match(large.page.data.error, /12000/); assert.equal(large.calls.filter((c) => c.action === 'job.create').length, 0);
});
test('授权弹窗期间连接代次变化，不向新连接派发旧资料', async () => {
  const h = harness(); await h.start();
  h.wx.showModal = (o) => { h.app.globalData.cloudGeneration++; o.success({ confirm: true }); };
  await h.page.createJob(); assert.equal(h.calls.filter((c) => c.action === 'job.create').length, 0);
  assert.equal(h.app.globalData.pendingRelayRequest, undefined);
});
test('离开后迟到的队列和资料不能回显；页面没有自动轮询', async () => {
  let done;
  const h = harness({ get: () => new Promise((resolve) => { done = resolve; }) });
  h.page.onShow(); await new Promise(setImmediate); h.page.onHide();
  const count = h.updates.length; done(structuredClone(workspace)); await new Promise(setImmediate);
  assert.equal(h.updates.length, count);
  assert.equal(h.calls.filter((c) => c.action === 'job.list').length, 1);
});
