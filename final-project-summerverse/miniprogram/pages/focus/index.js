const materials = require('../../services/materials');
const timer = require('../../utils/focus-session');
const { withExperience } = require('../../utils/experience');
const { backOrHome } = require('../../utils/navigation');

Page(withExperience({
  data: { loading: true, busy: false, error: '', notice: '', workspaces: [], tasks: [], workspaceTitle: '', task: null,
    workspaceIndex: 0, taskIndex: 0, minutes: 25, durations: timer.MINUTES, clock: '25:00', sessionState: 'idle', provenanceOpen: false },
  onLoad(query = {}) {
    this._alive = true; this._visible = false; this._epoch = 0;
    this._selection = { workspaceId: timer.validId(query.workspaceId) ? query.workspaceId : '', taskId: timer.validId(query.taskId) ? query.taskId : '' };
  },
  onShow() {
    this._visible = true;
    // Never redisplay task text saved in a previous page/account session before reading it again.
    this.setData({ task: null, tasks: [], workspaces: [], workspaceTitle: '', provenanceOpen: false });
    return this.refresh();
  },
  onHide() { this.leave(false); },
  onUnload() { this.leave(true); },
  leave(unload) {
    this.stopTick(); this._visible = false; this._epoch += 1;
    if (unload) this._alive = false;
    if (this._session && this.sameScope(this._scope)) {
      try { this._session = timer.save(this._session); } catch (_) { this._restoreWarning = '上次计时状态未能保存，请核对后再开始'; }
    }
    if (!unload) this.setData({ task: null, tasks: [], workspaces: [], workspaceTitle: '', provenanceOpen: false, busy: false });
  },
  scope() { const app = getApp(); return { app, generation: app.globalData.cloudGeneration || 0, mode: app.globalData.dataMode }; },
  sameScope(scope) { const current = this.scope(); return scope && current.app === scope.app && current.generation === scope.generation && current.mode === scope.mode; },
  guard(epoch, scope) {
    if (!this.sameScope(scope) && this._alive && this._visible) {
      this.stopTick(); this._session = null;
      this.setData({ task: null, tasks: [], workspaces: [], workspaceTitle: '', provenanceOpen: false, sessionState: 'idle' });
    }
    if (!this._alive || !this._visible || epoch !== this._epoch || !this.sameScope(scope)) throw Object.assign(new Error('连接或页面已变化，请重新读取任务'), { code: 'FOCUS_STALE' });
  },
  stopTick() { if (this._interval) clearInterval(this._interval); this._interval = null; },
  showTimer() {
    if (!this._session) return;
    this._session = timer.normalize(this._session);
    this.setData({ ...timer.display(this._session), minutes: this._session.minutes });
  },
  tick() {
    if (!this._alive || !this._visible) { this.stopTick(); return; }
    if (!this.sameScope(this._scope)) {
      this.stopTick(); this._epoch += 1; this._session = null;
      this.setData({ task: null, tasks: [], workspaces: [], workspaceTitle: '', sessionState: 'idle', error: '连接已变化，请重新读取任务', busy: false });
      return;
    }
    const wasRunning = this._session?.state === 'running';
    this.showTimer();
    if (wasRunning && this._session.state !== 'running') {
      this.stopTick();
      try { this._session = timer.save(this._session); } catch (e) { this.setData({ error: e.message }); }
      this.setData({ notice: this._session.state === 'finished' ? '时间到了。任务是否完成，由你确认。' : '系统时间发生变化，计时已暂停。' });
    }
  },
  startTick() { this.stopTick(); if (this._session?.state === 'running') this._interval = setInterval(() => this.tick(), 1000); },
  async refresh() {
    if (this.data.busy) return;
    const epoch = ++this._epoch, scope = this.scope();
    this.stopTick(); this.setData({ loading: true, error: '', task: null, tasks: [], workspaces: [], workspaceTitle: '' });
    try {
      const storageMode = await materials.mode(); this.guard(epoch, scope);
      const workspaces = await materials.list({ forceRefresh: true }); this.guard(epoch, scope);
      let saved = null;
      try { saved = timer.read(); } catch (_) { this._restoreWarning = '上次计时无法读取，可重新选择任务开始'; }
      const wanted = this._selection.workspaceId || (saved?.storageMode === storageMode ? saved.workspaceId : '');
      const selected = workspaces.find((w) => w.id === wanted) || (!wanted ? workspaces.find((w) => w.taskCount > 0) || workspaces[0] : null);
      this._scope = scope; this._storageMode = storageMode;
      this.setData({ workspaces, notice: this._restoreWarning || '' }); this._restoreWarning = '';
      if (!selected) {
        this._selection = { workspaceId: '', taskId: '' }; this._session = null;
        this.setData({ task: null, tasks: [], workspaceTitle: '', notice: wanted ? '上次任务所在的资料已不可用，请重新选择。' : '' });
        return;
      }
      await this.loadWorkspace(selected.id, this._selection.taskId || (saved?.workspaceId === selected.id && saved.storageMode === storageMode ? saved.taskId : ''), saved, epoch, scope);
    } catch (e) {
      if (this._alive && this._visible && epoch === this._epoch) this.setData({ error: e.message || '任务读取失败，请重试' });
    } finally { if (this._alive && this._visible && epoch === this._epoch) this.setData({ loading: false }); }
  },
  async loadWorkspace(workspaceId, taskId, saved, epoch, scope) {
    const workspace = await materials.get(workspaceId); this.guard(epoch, scope);
    const tasks = workspace.tasks || [];
    const selected = tasks.find((task) => task.id === taskId) || (!taskId ? tasks.find((task) => !task.done) || tasks[0] : null);
    this._selection = { workspaceId, taskId: selected?.id || '' };
    this._session = selected ? saved && saved.workspaceId === workspaceId && saved.taskId === selected.id && saved.storageMode === this._storageMode
      ? timer.normalize(saved) : timer.create(workspaceId, selected.id, this.data.minutes, this._storageMode) : null;
    if (selected?.done && this._session?.state === 'running') this._session = timer.pause(this._session);
    this.setData({ tasks, task: selected || null, workspaceTitle: workspace.title, provenanceOpen: false,
      workspaceIndex: Math.max(0, this.data.workspaces.findIndex((w) => w.id === workspaceId)), taskIndex: Math.max(0, tasks.findIndex((t) => t.id === selected?.id)),
      notice: taskId && !selected ? '上次选择的任务已不可用，请选择其他任务。' : this.data.notice });
    this.showTimer(); this.startTick();
  },
  async selectWorkspace(event) {
    if (this.data.busy || this.data.loading || this.data.sessionState === 'running') return;
    const workspace = this.data.workspaces[Number(event.detail.value)]; if (!workspace) return;
    const epoch = ++this._epoch, scope = this.scope(); this._scope = scope;
    this.stopTick(); this.setData({ loading: true, error: '', notice: '', task: null, tasks: [], workspaceTitle: '' });
    try { await this.loadWorkspace(workspace.id, '', null, epoch, scope); }
    catch (e) { if (this._alive && this._visible && epoch === this._epoch) this.setData({ error: e.message || '读取失败，请重试' }); }
    finally { if (this._alive && this._visible && epoch === this._epoch) this.setData({ loading: false }); }
  },
  selectTask(event) {
    if (this.data.busy || this.data.loading || this.data.sessionState === 'running') return;
    const task = this.data.tasks[Number(event.detail.value)]; if (!task) return;
    if (!this.sameScope(this._scope)) { this.refresh(); return; }
    this._selection.taskId = task.id; this.stopTick();
    this._session = timer.create(this._selection.workspaceId, task.id, this.data.minutes, this._storageMode);
    this.setData({ task, taskIndex: Number(event.detail.value), provenanceOpen: false, notice: '', error: '' }); this.showTimer();
  },
  selectDuration(event) {
    if (this.data.busy || !this.data.task || !['idle', 'finished'].includes(this.data.sessionState)) return;
    const minutes = Number(event.currentTarget.dataset.minutes); if (!timer.MINUTES.includes(minutes)) return;
    this._session = timer.create(this._selection.workspaceId, this._selection.taskId, minutes, this._storageMode); this.showTimer();
  },
  toggleTimer() {
    if (this.data.busy || this.data.loading || !this.data.task || this.data.task.done || !this._session) return;
    try {
      this.guard(this._epoch, this._scope);
      this._session = timer.save(this._session.state === 'running' ? timer.pause(this._session) : timer.start(this._session));
      this.setData({ error: '', notice: '' }); this.showTimer(); this.startTick();
    } catch (e) { this.setData({ error: e.message }); }
  },
  resetTimer() {
    if (this.data.busy || !this._session) return;
    try {
      this.guard(this._epoch, this._scope);
      const next = timer.create(this._selection.workspaceId, this._selection.taskId, this.data.minutes, this._storageMode);
      this._session = timer.save(next); this.stopTick(); this.showTimer(); this.setData({ notice: '本次计时已结束，任务状态没有改变。', error: '' });
    } catch (e) { this.setData({ error: e.message }); }
  },
  async completeTask() {
    if (this.data.busy || this.data.loading || !this.data.task || this.data.task.done) return;
    const epoch = this._epoch, scope = this._scope, selection = { ...this._selection };
    this.setData({ busy: true, error: '', notice: '' });
    try {
      this.guard(epoch, scope);
      const latest = await materials.get(selection.workspaceId); this.guard(epoch, scope);
      const task = latest.tasks.find((t) => t.id === selection.taskId);
      if (!task) throw new Error('这项任务已被删除，请刷新后重新选择');
      if (!task.done) {
        await materials.save({ ...latest, tasks: latest.tasks.map((t) => t.id === task.id ? { ...t, done: true } : t) }, latest.revision, () => this.guard(epoch, scope));
        this.guard(epoch, scope);
      }
      this.stopTick();
      if (this._session) {
        this._session = timer.pause(this._session);
        try { this._session = timer.save(this._session); } catch (_) { this.setData({ error: '任务已完成，但本机计时未能保存；刷新可核对任务状态。' }); }
      }
      this.setData({ task: { ...task, done: true }, tasks: latest.tasks.map((t) => t.id === task.id ? { ...t, done: true } : t), notice: '已按你的确认标记完成。' }); this.showTimer();
    } catch (e) {
      if (this._alive && this._visible && epoch === this._epoch) this.setData({ error: e.outcomeUnknown ? '完成状态尚未确认，请刷新任务核对后再操作。' : e.message || '保存失败，请重试' });
    } finally { if (this._alive && this._visible && epoch === this._epoch) this.setData({ busy: false }); }
  },
  toggleProvenance() { this.setData({ provenanceOpen: !this.data.provenanceOpen }); },
  openMaterials() { wx.navigateTo({ url: '/pages/materials/index' }); },
  goBack() { backOrHome(); }
}));
