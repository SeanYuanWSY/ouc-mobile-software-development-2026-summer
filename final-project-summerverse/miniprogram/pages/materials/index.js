const { withExperience } = require('../../utils/experience');
const materials = require('../../services/materials');
const ai = require('../../services/ai');
const policy = require('../../utils/material-policy');
const { backOrHome } = require('../../utils/navigation');
const MODES = [
  { id: 'requirements', label: '提取要求', hint: '找出要做什么、交什么，没写清的单独列出。', action: '找出关键要求' },
  { id: 'plan', label: '拆解计划', hint: '按资料拆成具体行动；你确认后，才加入任务。', action: '生成行动草稿' },
  { id: 'ask', label: '问资料', hint: '答案附原文出处；资料没有写的，不当作事实。', action: '查找答案' },
  { id: 'checklist', label: '提交前检查', hint: '整理提交前要核对的事，不替你判断作业已合格。', action: '生成检查清单' },
  { id: 'compare', label: '对比变更', hint: '至少两份资料，比较要求变化与相互冲突之处。', action: '对比这几份资料' },
  { id: 'minutes', label: '讨论纪要', hint: '区分已达成的决定、建议行动和尚待确认的问题。', action: '整理讨论结果' },
  { id: 'defense', label: '答辩演练', hint: '根据资料出题。先自己回答，再展开参考要点。', action: '准备练习题' }
];
const LABELS = { requirement: '明确要求', change: '变更 / 冲突', answer: '资料回答', check: '待检查', decision: '讨论决定', task: '建议任务', question: '待确认', practice: '练习题' };
function empty() { return { id: materials.makeId('w'), title: '我的资料', sources: [], analysis: null, tasks: [], revision: 0 }; }
function modal(options) { return new Promise((resolve) => wx.showModal({ ...options, success: resolve, fail: () => resolve({ confirm: false }) })); }
Page(withExperience({
  data: { workspace: null, sourceViews: [], resultViews: [], modes: MODES, selectedMode: 'requirements', question: '', busy: false, progress: '', error: '', notice: '', saveState: '', unsaved: false, storageMode: '',
    textOpen: false, textName: '', textDraft: '', linkOpen: false, linkDraft: '', sessions: [], libraryOpen: false, evidenceOpen: null, completed: 0, modeInfo: MODES[0], showAllModes: false },
  onLoad(options = {}) {
    this._alive = true; this._epoch = 0; this._operation = 0; this._libraryRequest = 0;
    this.setWorkspace(empty());
    const mode = MODES.find((m) => m.id === options.mode) || MODES[0];
    this.setData({ selectedMode: mode.id, modeInfo: mode, showAllModes: MODES.indexOf(mode) > 3 });
    if (options.workspaceId) this.restoreWorkspace(options.workspaceId);
    else this.refreshLibrary();
  },
  onShow() {
    const incoming = getApp().globalData.pendingMaterials;
    if (incoming?.length && !this.data.busy) {
      getApp().globalData.pendingMaterials = [];
      const files = [], links = [];
      incoming.forEach((item) => {
        try {
          const web = materials.webMeta(item);
          if (web) links.push(web.url); else files.push(item);
        } catch (e) { if (this._alive) this.setData({ error: e.message || '网页地址无法读取' }); }
      });
      if (links.length && this._alive) this.setData({ linkOpen: true, linkDraft: links[0], notice: '已收到这条聊天链接。确认后才会读取公开网页正文。' });
      if (files.length) this.importFiles(files);
    }
    const returning = this._returning;
    this._returning = false;
    if (returning && !incoming?.length) return this.refreshCurrentWorkspace();
  },
  onHide() { this._returning = true; this._resumeRequest = (this._resumeRequest || 0) + 1; },
  async refreshCurrentWorkspace() {
    const workspace = this.data.workspace;
    if (!this._alive || this.data.busy || this.data.unsaved || !workspace?.revision) return;
    const request = this._resumeRequest = (this._resumeRequest || 0) + 1;
    const epoch = this._epoch, operation = this._operation;
    const current = () => this._alive && request === this._resumeRequest && epoch === this._epoch && operation === this._operation && !this.data.busy && !this.data.unsaved && this.data.workspace === workspace;
    try {
      const latest = await materials.get(workspace.id);
      if (!current()) return;
      this.setWorkspace(latest);
      this.setData({ error: '', evidenceOpen: null });
      await this.refreshLibrary();
    } catch (e) {
      if (current()) this.setData({ error: e.message || '资料刷新失败，请重新打开核对最新状态', saveState: '' });
    }
  },
  onUnload() { this._alive = false; this._epoch += 1; this._operation += 1; this._libraryRequest += 1; },
  guard(epoch) { if (!this._alive || epoch !== this._epoch) throw new Error('已离开当前资料，本次处理停止'); },
  setWorkspace(workspace, unsaved = false) {
    const report = workspace.analysis;
    const previous = this.data.workspace?.analysis?.id === report?.id ? this.data.resultViews || [] : [];
    const sourceViews = workspace.sources.map((s) => ({ id: s.id, name: s.name, badge: s.kind.toUpperCase(), meta: `${s.domain ? `${s.domain} · ` : ''}${s.chunks.reduce((n, c) => n + c.text.length, 0)}字 · ${s.extraction === 'vision' ? 'AI识别文字' : '已提取文字'}`, warning: s.warnings.join('；') }));
    const resultViews = (report?.items || []).map((item) => ({ ...item, label: LABELS[item.kind], answerVisible: previous.find((v) => v.id === item.id)?.answerVisible || false, ownAnswer: previous.find((v) => v.id === item.id)?.ownAnswer || '',
      taskId: `${report.id}-${item.id}`, added: workspace.tasks.some((t) => t.id === `${report.id}-${item.id}`),
      references: item.evidence.map((ref, i) => { const source = workspace.sources.find((s) => s.id === ref.sourceId); const chunk = source?.chunks.find((c) => c.id === ref.chunkId); return { ...ref, index: i, label: `${source?.name || '资料'} · ${chunk?.locator || ''}` }; }) }));
    this.setData({ workspace, sourceViews, resultViews, unsaved, completed: workspace.tasks.filter((t) => t.done).length });
  },
  async refreshLibrary() {
    const request = ++this._libraryRequest;
    try {
      const storageMode = await materials.mode();
      const sessions = await materials.list();
      if (this._alive && request === this._libraryRequest) this.setData({ sessions, storageMode });
    } catch (e) { if (this._alive && request === this._libraryRequest) this.setData({ error: e.message || '资料列表暂不可用' }); }
  },
  async persist() {
    const workspace = this.data.workspace;
    const epoch = this._epoch;
    const result = await materials.save(workspace, workspace.revision || 0, () => this.guard(epoch));
    const storageMode = await materials.mode();
    if (this._alive && epoch === this._epoch && this.data.workspace.id === workspace.id) {
      this.setWorkspace({ ...workspace, ...result }, false);
      this.setData({ saveState: `已保存到${storageMode === 'cloud' ? '云端' : '本机'}` });
    }
  },
  async run(task) {
    if (this.data.busy) return;
    const epoch = this._epoch;
    const operation = ++this._operation;
    this.setData({ busy: true, error: '', notice: '', progress: '' });
    try { await task(() => this.guard(epoch)); }
    catch (e) { if (this._alive && operation === this._operation) this.setData({ error: e.message || e.errMsg || '处理失败，请重试' }); }
    finally { if (this._alive && operation === this._operation) { this.setData({ busy: false, progress: '' }); await this.refreshLibrary(); } }
  },
  async newWorkspace() {
    if (this.data.busy) return;
    if (this.data.unsaved && !(await modal({ title: '还有未保存的内容', content: '新建将放弃当前未保存修改，是否继续？', confirmText: '继续新建' })).confirm) return;
    this._epoch += 1; this.setWorkspace(empty());
    this.setData({ error: '', notice: '', saveState: '', question: '', libraryOpen: false, textOpen: false, linkOpen: false, linkDraft: '' });
  },
  async openWorkspace(event) {
    if (this.data.busy) return;
    if (this.data.unsaved && !(await modal({ title: '切换资料？', content: '当前未保存的修改将被放弃。' })).confirm) return;
    await this.restoreWorkspace(event.currentTarget.dataset.id);
  },
  async restoreWorkspace(id) {
    await this.run(async (guard) => {
      const workspace = await materials.get(id);
      guard();
      this._epoch += 1; this.setWorkspace(workspace);
      const mode = MODES.find((m) => m.id === workspace.analysis?.mode) || this.data.modeInfo;
      this.setData({ libraryOpen: false, question: workspace.analysis?.question || '', selectedMode: mode.id, modeInfo: mode, showAllModes: MODES.indexOf(mode) > 3, saveState: '已恢复资料', textOpen: false, linkOpen: false, linkDraft: '', evidenceOpen: null });
    });
  },
  async deleteWorkspace(event) {
    if (this.data.busy) return;
    const found = this.data.sessions.find((s) => s.id === event.currentTarget.dataset.id);
    if (!found || !(await modal({ title: '删除这份资料？', content: '会删除提取文字、分析和清单，不影响微信聊天中的原文件。', confirmText: '删除' })).confirm) return;
    await this.run(async (guard) => {
      await materials.remove(found.id, found.revision);
      guard();
      if (this.data.workspace.id === found.id) this.setWorkspace(empty());
    });
  },
  toggleLibrary() { if (!this.data.busy) this.setData({ libraryOpen: !this.data.libraryOpen }); },
  onTitle(event) { if (!this.data.busy) this.setData({ 'workspace.title': event.detail.value, unsaved: true, saveState: '' }); },
  retrySave() { return this.run(async () => this.persist()); },
  toggleText() { if (!this.data.busy) this.setData({ textOpen: !this.data.textOpen }); },
  toggleLink() { if (!this.data.busy) this.setData({ linkOpen: !this.data.linkOpen }); },
  onLink(event) { this.setData({ linkDraft: event.detail.value }); },
  onTextName(event) { this.setData({ textName: event.detail.value }); },
  onText(event) { this.setData({ textDraft: event.detail.value }); },
  pasteText() {
    if (this.data.busy) return;
    wx.getClipboardData({ success: ({ data }) => { if (this._alive) this.setData({ textDraft: data, textOpen: true }); }, fail: () => this.setData({ error: '剪贴板读取失败，可以直接粘贴到输入框' }) });
  },
  pasteLink() {
    if (this.data.busy) return;
    wx.getClipboardData({ success: ({ data }) => { if (this._alive) this.setData({ linkDraft: data, linkOpen: true }); }, fail: () => this.setData({ error: '剪贴板读取失败，可以直接粘贴到输入框' }) });
  },
  addLink() {
    return this.run(async (guard) => {
      if (this.data.workspace.sources.length >= policy.LIMITS.sources) throw new Error('一次最多6份资料，请新建另一份工作台');
      const url = materials.normalizeWebUrl(this.data.linkDraft);
      const choice = await modal({
        title: '读取这个公开网页？',
        content: '腾讯云将访问这个公开网页；并在本次使用期间，把提取的标题、域名、正文及后续分析和任务保存在你的云端账号。不会绕过登录、验证码或付费限制，也不会把完整网址交给 AI。请确认你有权处理其中内容。',
        confirmText: '同意读取'
      });
      if (!choice.confirm) return;
      guard(); materials.agreeCloudStorage();
      const { source } = await materials.importWeb(url, { guard, onProgress: (value) => { if (this._alive) this.setData({ progress: value }); } });
      guard();
      const sources = policy.sources([...this.data.workspace.sources, source]);
      this.setWorkspace({ ...this.data.workspace, sources, analysis: null }, true);
      this.setData({ linkOpen: false, linkDraft: '', saveState: '', notice: '网页正文已提取；需要登录或由脚本加载的内容不会被读取。' });
      await this.persist();
    });
  },
  addText() {
    return this.run(async () => {
      const source = materials.textSource(this.data.textName.trim() || `文字资料${this.data.workspace.sources.length + 1}`, this.data.textDraft);
      const sources = policy.sources([...this.data.workspace.sources, source]);
      this.setWorkspace({ ...this.data.workspace, sources, analysis: null }, true);
      this.setData({ textOpen: false, textDraft: '', textName: '', saveState: '' });
      await this.persist();
    });
  },
  chooseFiles() {
    if (this.data.busy) return;
    const remaining = policy.LIMITS.sources - this.data.workspace.sources.length;
    if (!remaining) { this.setData({ error: '一次最多6份资料，请新建另一份工作台' }); return; }
    if (!wx.chooseMessageFile) { this.setData({ error: '当前微信不支持聊天文件选择，请升级微信或粘贴文字' }); return; }
    wx.chooseMessageFile({ count: remaining, type: 'all', success: ({ tempFiles }) => this.importFiles(tempFiles), fail: (e) => { if (!/cancel/i.test(e.errMsg || '')) this.setData({ error: '未能打开聊天文件选择，请重试' }); } });
  },
  chooseImages() {
    if (this.data.busy) return;
    const remaining = policy.LIMITS.sources - this.data.workspace.sources.length;
    if (!remaining) { this.setData({ error: '一次最多6份资料' }); return; }
    wx.chooseMedia({ count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'], success: ({ tempFiles }) => this.importFiles(tempFiles.map((f, i) => ({ ...f, name: `截图${i + 1}.${policy.extension(f.tempFilePath) || 'jpg'}` }))), fail: (e) => { if (!/cancel/i.test(e.errMsg || '')) this.setData({ error: '图片选择失败，请重试' }); } });
  },
  async importFiles(files) {
    if (this.data.busy || !files?.length) return;
    await this.run(async (guard) => {
      if (files.length + this.data.workspace.sources.length > policy.LIMITS.sources) throw new Error('一次最多6份资料，请分批选择');
      const metas = files.map(materials.fileMeta);
      const needsCloud = metas.some((m) => m.kind !== 'text');
      let consent = false;
      if (needsCloud) {
        const choice = await modal({ title: '导入这些资料？', content: '文档和图片将上传腾讯云处理，提取后尝试删除临时云文件。提取文字、后续分析和任务保存在你的云端账号，可在资料库删除；发送至AI服务商另征求同意。请确认你有权上传。', confirmText: '同意导入' });
        if (!choice.confirm) return;
        guard(); materials.agreeCloudStorage();
        consent = true;
      }
      const errors = [], notices = [];
      for (let i = 0; i < files.length; i += 1) {
        guard();
        try {
          const { source, cleanupWarning } = await materials.importFile(files[i], { consent, guard, onProgress: (p) => { if (this._alive) this.setData({ progress: `${i + 1}/${files.length} · ${p}` }); } });
          guard();
          const sources = policy.sources([...this.data.workspace.sources, source]);
          this.setWorkspace({ ...this.data.workspace, sources, analysis: null }, true);
          if (cleanupWarning) notices.push(cleanupWarning);
        } catch (e) { errors.push(`${metas[i].name}：${e.message}`); }
      }
      guard();
      if (this.data.unsaved) { try { await this.persist(); } catch (e) { errors.push(e.message); } }
      this.setData({ error: errors.join('\n'), notice: notices.join('\n') });
    });
  },
  removeSource(event) {
    return this.run(async () => {
      const sources = this.data.workspace.sources.filter((s) => s.id !== event.currentTarget.dataset.id);
      this.setWorkspace({ ...this.data.workspace, sources, analysis: null }, true); await this.persist();
    });
  },
  selectMode(event) { const mode = MODES.find((m) => m.id === event.currentTarget.dataset.mode); if (!this.data.busy && mode) this.setData({ selectedMode: mode.id, modeInfo: mode }); },
  toggleModes() { this.setData({ showAllModes: !this.data.showAllModes }); },
  togglePractice(event) {
    const index = this.data.resultViews.findIndex((item) => item.id === event.currentTarget.dataset.id && item.kind === 'practice');
    if (index >= 0) this.setData({ [`resultViews[${index}].answerVisible`]: !this.data.resultViews[index].answerVisible });
  },
  onPracticeAnswer(event) {
    const index = this.data.resultViews.findIndex((item) => item.id === event.currentTarget.dataset.id && item.kind === 'practice');
    if (index >= 0) this.setData({ [`resultViews[${index}].ownAnswer`]: event.detail.value.slice(0, 2000) });
  },
  openFocus(event) {
    const id = event.currentTarget.dataset.id;
    return this.run(async (guard) => {
      if (!this.data.workspace.tasks.some((task) => task.id === id && !task.done)) return;
      if (this.data.unsaved) await this.persist();
      guard();
      wx.navigateTo({ url: `/pages/focus/index?workspaceId=${encodeURIComponent(this.data.workspace.id)}&taskId=${encodeURIComponent(id)}` });
    });
  },
  openRelay() {
    return this.run(async (guard) => {
      if (!this.data.workspace.sources.length) throw new Error('先添加要交给电脑助手的资料');
      if (this.data.unsaved) await this.persist();
      guard();
      wx.navigateTo({ url: `/pages/relay/index?workspaceId=${encodeURIComponent(this.data.workspace.id)}` });
    });
  },
  onQuestion(event) { this.setData({ question: event.detail.value }); },
  analyze() {
    return this.run(async (guard) => {
      if (!this.data.workspace.sources.length) throw new Error('先导入资料或粘贴文字');
      if (this.data.unsaved) await this.persist();
      const sources = policy.sources(this.data.workspace.sources);
      const mode = this.data.selectedMode;
      if (mode === 'compare' && sources.length < 2) throw new Error('至少添加两份资料才能对比');
      if (mode === 'ask' && !this.data.question.trim()) throw new Error('先写下你想问的问题');
      this.setData({ progress: '正在分析，通常需要几十秒…' });
      const report = await ai.analyzeMaterials(sources, mode, this.data.question);
      guard();
      const analysis = policy.analysis(report, sources);
      this.setWorkspace({ ...this.data.workspace, analysis }, true);
      await this.persist();
      guard();
      if (wx.pageScrollTo) wx.pageScrollTo({ selector: '.results', offsetTop: -16, duration: this.data.reduceMotion ? 0 : 260 });
    });
  },
  showSource(event) {
    const source = this.data.workspace.sources.find((s) => s.id === event.currentTarget.dataset.id);
    if (!source) return;
    this.setData({ evidenceOpen: { name: source.name, warning: source.warnings.join('；'), chunks: source.chunks } });
  },
  showEvidence(event) {
    const item = this.data.resultViews.find((i) => i.id === event.currentTarget.dataset.item);
    const ref = item?.references[event.currentTarget.dataset.ref];
    if (!ref) return;
    const source = this.data.workspace.sources.find((s) => s.id === ref.sourceId);
    const chunk = source?.chunks.find((c) => c.id === ref.chunkId);
    this.setData({ evidenceOpen: { name: source.name, warning: source.warnings.join('；'), quote: ref.quote, chunks: [chunk] } });
  },
  closeEvidence() { this.setData({ evidenceOpen: null }); },
  noop() {},
  async addTask(event) {
    if (this.data.busy) return;
    const item = this.data.resultViews.find((i) => i.id === event.currentTarget.dataset.id);
    if (!item || item.added) return;
    const epoch = this._epoch;
    if (!(await modal({ title: '加入我的任务？', content: `${item.title}\n${item.detail}`, confirmText: '确认加入' })).confirm) return;
    if (!this._alive || epoch !== this._epoch || this.data.workspace.tasks.some((t) => t.id === item.taskId)) return;
    await this.run(async () => {
      const task = { id: item.taskId, title: item.title, detail: item.detail, done: false, provenance: item.references.map((r) => `${r.label}：“${r.quote}”`).join('\n').slice(0, 1200) };
      this.setWorkspace({ ...this.data.workspace, tasks: [...this.data.workspace.tasks, task] }, true); await this.persist();
    });
  },
  toggleTask(event) { return this.run(async () => { this.setWorkspace({ ...this.data.workspace, tasks: this.data.workspace.tasks.map((t) => t.id === event.currentTarget.dataset.id ? { ...t, done: !t.done } : t) }, true); await this.persist(); }); },
  removeTask(event) { return this.run(async () => { this.setWorkspace({ ...this.data.workspace, tasks: this.data.workspace.tasks.filter((t) => t.id !== event.currentTarget.dataset.id) }, true); await this.persist(); }); },
  shareText() {
    const w = this.data.workspace;
    return `${w.title}\nAI辅助整理，请核对原资料\n\n${this.data.resultViews.map((item) => `${item.label}｜${item.title}\n${item.detail}\n${item.references.map((r) => `出处：${r.label}\n“${r.quote}”`).join('\n')}`).join('\n\n')}\n\n我的任务\n${w.tasks.map((t) => `${t.done ? '已手动完成' : '待完成'}：${t.title}`).join('\n')}`;
  },
  copyResult() { wx.setClipboardData({ data: this.shareText(), success: () => wx.showToast({ title: '已复制', icon: 'success' }), fail: () => this.setData({ error: '复制失败，请重试' }) }); },
  exportResult() {
    const filePath = `${wx.env.USER_DATA_PATH}/material-analysis.txt`;
    wx.getFileSystemManager().writeFile({ filePath, data: this.shareText(), encoding: 'utf8', success: () => {
      if (wx.shareFileMessage) wx.shareFileMessage({ filePath, fileName: '资料分析.txt', fail: (e) => { if (!/cancel/i.test(e.errMsg || '')) this.setData({ error: '分享失败，可使用复制结果' }); } });
      else this.setData({ error: '当前微信不支持文件分享，请使用复制结果' });
    }, fail: () => this.setData({ error: '文件导出失败，请检查本机空间' }) });
  },
  openSettings() { if (!this.data.busy) wx.navigateTo({ url: '/pages/settings/index' }); },
  async goBack() {
    if (this.data.busy && !(await modal({ title: '正在处理资料', content: '离开后不再显示本次结果。已发出的云端或 AI 请求可能继续执行并计费，临时文件仍会尝试清理。', confirmText: '离开' })).confirm) return;
    if (this.data.unsaved && !(await modal({ title: '还有未保存的内容', content: '离开后未保存修改可能丢失。', confirmText: '离开' })).confirm) return;
    backOrHome();
  }
}));
