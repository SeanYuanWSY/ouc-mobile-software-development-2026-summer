const { withExperience } = require('../../utils/experience');
const assistant = require('../../services/assistant');
const { backOrHome } = require('../../utils/navigation');
Page(withExperience({
  data: { gatewayUrl: '', results: [], drafts: [], connections: [], busy: false, error: '', name: '', readWorkspace: false, readSources: false, allowResults: true, supportsLibrary: false, readRecent: false, workJobs: false, supportsJobs: false, token: '', showConnections: false, editing: null },
  onLoad(options = {}) { if (options.connections === '1') this.setData({ showConnections: true }); },
  onShow() { this.visible = true; this.refresh(); },
  onHide() { this.visible = false; this.epoch = (this.epoch || 0) + 1; this.setData({ token: '' }); },
  onUnload() { this.onHide(); },
  goBack() { backOrHome(); },
  async refresh() {
    const epoch = this.epoch || 0;
    try {
      const result = await assistant.request('list');
      if (!this.visible || epoch !== (this.epoch || 0)) return;
      this.setData({ results: result.results || [], drafts: result.drafts, connections: result.connections.map(c => ({ ...c, permissionLabel: c.scopeVersion === 2 ? c.scopes.map(s => ({ 'tasks.read': '工作区任务', 'materials.read': '资料正文', 'results.submit': '成果回传', 'memories.read': '近期记忆', 'jobs.execute': '指定接力读写' })[s]).join(' · ') : '原有连接权限', expiryLabel: new Date(c.expiresAt).toLocaleDateString() })), error: '' });
      const capabilities = await assistant.request('capabilities').catch(() => null);
      if (this.visible && epoch === (this.epoch || 0)) this.setData({ supportsJobs: capabilities?.jobsProtocol === 'relay-v1', supportsLibrary: capabilities?.libraryProtocol === 'workspace-v1', gatewayUrl: capabilities?.gatewayUrl || '' });
    } catch (_) { if (this.visible && epoch === (this.epoch || 0)) this.setData({ error: '收件箱暂未连接，请确认云端已开通此功能后刷新。' }); }
  },
  toggleConnections() { this.setData({ showConnections: !this.data.showConnections }); },
  onName(e) { this.setData({ name: e.detail.value }); },
  onReadChange(e) { this.setData({ readRecent: e.detail.value }); },
  onWorkspaceChange(e) { this.setData({ readWorkspace: e.detail.value === true, ...(e.detail.value ? {} : { readSources: false }) }); },
  onSourcesChange(e) { this.setData({ readSources: e.detail.value === true, ...(e.detail.value ? { readWorkspace: true } : {}) }); },
  onResultsChange(e) { this.setData({ allowResults: e.detail.value === true }); },
  onJobsChange(e) { if (this.data.supportsJobs) this.setData({ workJobs: e.detail.value === true }); },
  openRelay() { wx.navigateTo({ url: '/pages/relay/index' }); },
  async connect() {
    if (this.data.busy) return;
    if (!this.data.name.trim()) return wx.showToast({ title: '给这个连接起个名字', icon: 'none' });
    const selection = { name: this.data.name, readRecent: this.data.readRecent, ...(this.data.supportsJobs ? { workJobs: this.data.workJobs } : {}) };
    if (this.data.supportsLibrary) {
      selection.scopes = [ ...(this.data.readWorkspace ? ['tasks.read'] : []), ...(this.data.readSources ? ['materials.read'] : []), ...(this.data.allowResults ? ['results.submit'] : []), ...(this.data.readRecent ? ['memories.read'] : []), ...(this.data.workJobs ? ['jobs.execute'] : []) ];
      if (!selection.scopes.length) return wx.showToast({ title: '至少选择一项权限', icon: 'none' });
    }
    const epoch = this.epoch || 0;
    this.setData({ busy: true, token: '' });
    const permissions = selection.scopes ? [] : ['投递待确认草稿'];
    if (selection.scopes?.includes('results.submit')) permissions.push('投递待确认草稿');
    if (this.data.readWorkspace) permissions.push('读取本人所有已保存工作区的任务与进度（含以后新增的工作区）');
    if (this.data.readSources) permissions.push('读取本人工作区的资料正文（含以后新增的资料）');
    if (selection.readRecent) permissions.push('读取最近20条记忆正文和20项目标');
    if (selection.workJobs) permissions.push('领取你指定给此连接的资料快照和任务，并回传结果');
    const confirmed = await new Promise(resolve => wx.showModal({ title: '允许连接这个助手？', content: `允许：${permissions.join('；')}。内容会提供给你的外部助手及其模型服务商。授权30天，可随时撤销；已被读取的内容无法收回。不会授权执行电脑命令或读取模型Key。`, success: r => resolve(r.confirm), fail: () => resolve(false) }));
    if (!confirmed || !this.visible || epoch !== (this.epoch || 0)) { this.setData({ busy: false }); return; }
    try { const r = await assistant.request('connect', selection, { beforeDispatch: () => { if (!this.visible || epoch !== (this.epoch || 0)) throw new Error('已离开连接页面'); } }); if (this.visible && epoch === (this.epoch || 0)) this.setData({ token: r.token, name: '' }); await this.refresh(); }
    catch (_) { wx.showToast({ title: '创建失败，请刷新后查看连接', icon: 'none' }); }
    finally { this.setData({ busy: false }); }
  },
  copyGatewayUrl() { if (this.data.gatewayUrl) wx.setClipboardData({ data: this.data.gatewayUrl }); },
  copyToken() { if (this.data.token) wx.setClipboardData({ data: this.data.token }); },
  clearToken() { this.setData({ token: '' }); },
  async revoke(e) {
    if (this.data.busy) return;
    this.setData({ busy: true, token: '' });
    try { await assistant.request('revoke', { id: e.currentTarget.dataset.id }); await this.refresh(); }
    catch (_) { wx.showToast({ title: '撤销失败，请重试', icon: 'none' }); }
    finally { this.setData({ busy: false }); }
  },
  edit(e) { const item = this.data.drafts.find(d => d.id === e.currentTarget.dataset.id); if (item) this.setData({ editing: { id: item.id, ...item.draft } }); },
  onEdit(e) { this.setData({ ['editing.' + e.currentTarget.dataset.field]: e.detail.value }); },
  onDate(e) { this.setData({ 'editing.date': e.detail.value }); },
  cancelEdit() { this.setData({ editing: null }); },
  async accept() {
    if (!this.data.editing || this.data.busy) return;
    const { id, ...draft } = this.data.editing;
    if (draft.kind === 'goal') draft.target = Number(draft.target);
    await this.resolveDraft('accept', id, draft);
  },
  async dismiss(e) { await this.resolveDraft('dismiss', e.currentTarget.dataset.id); },
  async resolveDraft(action, id, draft) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await assistant.request(action, { id, ...(draft ? { draft } : {}) }); this.setData({ editing: null }); await this.refresh(); wx.showToast({ title: action === 'accept' ? '已保存' : '已忽略', icon: 'success' }); }
    catch (_) { wx.showToast({ title: '未完成，请检查内容后重试', icon: 'none' }); }
    finally { this.setData({ busy: false }); }
  }
}));
