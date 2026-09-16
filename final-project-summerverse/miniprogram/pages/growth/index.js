const { withExperience } = require('../../utils/experience');
const { realMemories, realGoals } = require('../../utils/memory-source');
const repository = require('../../services/repository');
const wechatData = require('../../services/wechat-data');
const ai = require('../../services/ai');
const { CATEGORY_LIST, CATEGORIES } = require('../../utils/constants');
const { buildSummary, weeklyMoodSeries } = require('../../utils/stats');
const { formatDate } = require('../../utils/date');
const { normalizeGoal } = require('../../utils/validate');

Page(withExperience({
  data: {
    loading: true,
    goals: [],
    summary: {},
    step: null,
    moodSeries: [],
    addGoalOpen: false,
    savingGoal: false,
    pendingGoal: false,
    goalDraft: { title: '', category: 'life', target: 5, unit: '次' },
    categories: CATEGORY_LIST,
    syncingStep: false,
    insight: null,
    insightLoading: false
  },

  onLoad() { this.refresh(); },
  onShow() {
    this.getTabBar?.().setSelected(3);
    if (!this.data.loading) this.refresh(false);
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const [memoryRes, goalRes] = await Promise.all([repository.listMemories(), repository.listGoals()]);
      const memories = realMemories(memoryRes.data || []);
      this._memories = memories;
      const goals = (goalRes.data || []).map((goal) => {
        const current = Number(goal.current) || 0;
        const target = Math.max(1, Number(goal.target) || 1);
        return {
          ...goal,
          categoryMeta: CATEGORIES[goal.category] || CATEGORIES.life,
          percent: Math.min(100, Math.round((current / target) * 100)),
          completed: current >= target
        };
      });
      const step = repository.getStepSnapshot();
      const series = weeklyMoodSeries(memories, formatDate()).map((item) => ({
        ...item,
        label: item.date.slice(5).replace('-', '/'),
        height: item.value === null ? 6 : Math.max(12, Math.round(item.value * 0.72))
      }));
      this.setData({
        goals,
        step,
        summary: buildSummary(memories, goals, step),
        moodSeries: series,
        loading: false
      });
    } catch (error) {
      console.error(error);
      this.setData({ loading: false });
      wx.showToast({ title: '读取成长数据失败', icon: 'none' });
    }
  },

  toggleGoalForm() { this.setData({ addGoalOpen: !this.data.addGoalOpen }); },
  onGoalInput(event) { if (!this.data.savingGoal && !this._pendingGoal) this.setData({ [`goalDraft.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  selectGoalCategory(event) { if (!this.data.savingGoal && !this._pendingGoal) this.setData({ 'goalDraft.category': event.currentTarget.dataset.key }); },

  async saveGoal() {
    if (this.data.savingGoal) return;
    const retryingPending = Boolean(this._pendingGoal);
    const draft = this.data.goalDraft;
    if (!String(draft.title).trim()) {
      wx.showToast({ title: '先写下目标', icon: 'none' });
      return;
    }
    this.setData({ savingGoal: true });
    wx.showLoading({ title: '种下目标' });
    try {
      if (!this._pendingGoal) this._pendingGoal = { ...normalizeGoal(draft), requestId: repository.makeRequestId() };
      await repository.saveGoal(this._pendingGoal);
      this._pendingGoal = null;
      this.setData({ pendingGoal: false });
      this.setData({ addGoalOpen: false, goalDraft: { title: '', category: 'life', target: 5, unit: '次' } });
      await this.refresh(false);
      wx.showToast({ title: '目标已种下', icon: 'success' });
    } catch (error) {
      if (!retryingPending && !error.outcomeUnknown && !['WRITE_CONFLICT', 'WRITE_EXPIRED'].includes(error.code)) this._pendingGoal = null;
      this.setData({ pendingGoal: Boolean(this._pendingGoal) });
      wx.showModal({ title: '保存失败', content: error.message, showCancel: false });
    } finally { wx.hideLoading(); this.setData({ savingGoal: false }); }
  },

  async discardPendingGoal() {
    if (!this._pendingGoal || this.data.savingGoal) return;
    const choice = await new Promise((resolve) => wx.showModal({ title: '已核对目标列表？', content: '放弃这次草稿不会撤销已经保存的目标。请先核对列表，避免重复创建。', confirmText: '放弃草稿', success: resolve }));
    if (!choice.confirm) return;
    this._pendingGoal = null;
    this.setData({ pendingGoal: false, goalDraft: { title: '', category: 'life', target: 5, unit: '次' } });
    await this.refresh(false);
  },

  async incrementGoal(event) {
    const id = event.currentTarget.dataset.id;
    const goal = this.data.goals.find((item) => item._id === id);
    if (!goal || goal.completed) return;
    this._incrementBusy ||= new Set();
    this._incrementRequests ||= new Map();
    if (this._incrementBusy.has(id)) return;
    const retryingPending = this._incrementRequests.has(id);
    this._incrementBusy.add(id);
    if (!this._incrementRequests.has(id)) this._incrementRequests.set(id, repository.makeRequestId());
    wx.showLoading({ title: '更新进度' });
    try {
      await repository.incrementGoal(id, this._incrementRequests.get(id));
      this._incrementRequests.delete(id);
      await this.refresh(false);
      wx.showToast({ title: Number(goal.current) + 1 >= Number(goal.target) ? '目标完成！' : '进度 +1', icon: 'success' });
    } catch (error) {
      if (!retryingPending && !error.outcomeUnknown) this._incrementRequests.delete(id);
      if (retryingPending && error.code === 'WRITE_EXPIRED') {
        const choice = await new Promise((resolve) => wx.showModal({ title: '这次进度需要核对', content: '这次请求已超过可重试时间。请核对目标进度；结束核对不会增加或撤销进度。', confirmText: '结束核对', cancelText: '稍后核对', success: resolve }));
        if (choice.confirm) { this._incrementRequests.delete(id); await this.refresh(false); }
      } else wx.showToast({ title: error.outcomeUnknown || retryingPending ? '结果待确认，请稍后重试' : error.message || '更新失败', icon: 'none' });
    } finally { this._incrementBusy.delete(id); wx.hideLoading(); }
  },

  async removeGoal(event) {
    const id = event.currentTarget.dataset.id;
    const modal = await new Promise((resolve) => wx.showModal({ title: '移除这个目标？', content: '已完成的记录不会被删除。', success: resolve }));
    if (!modal.confirm) return;
    try {
      await repository.deleteGoal(id);
      await this.refresh(false);
    } catch (error) {
      wx.showModal({ title: '移除失败', content: error.message || '请检查网络后重试。', showCancel: false });
    }
  },

  async syncStep() {
    if (this.data.syncingStep) return;
    this.setData({ syncingStep: true });
    wx.showLoading({ title: '读取微信运动' });
    try {
      const step = await wechatData.syncWeRun();
      this.setData({ step, summary: { ...this.data.summary, todaySteps: step.steps } });
      wx.showToast({ title: '真实步数已同步', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '同步失败', content: error.errMsg || error.message || '请在真机中授权微信运动，并确认云函数已部署。', showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ syncingStep: false });
    }
  },

  async generateInsight() {
    if (this.data.insightLoading) return;
    this.setData({ insightLoading: true });
    try {
      const insight = await ai.insight(this._memories || []);
      this.setData({ insight });
    } catch (error) {
      wx.showModal({ title: '暂时无法生成洞察', content: error.message, showCancel: false });
    } finally { this.setData({ insightLoading: false }); }
  },

  openReport() { wx.navigateTo({ url: '/pages/report/index' }); }
}));
