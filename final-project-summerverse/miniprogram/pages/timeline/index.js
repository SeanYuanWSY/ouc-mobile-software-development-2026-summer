const { withExperience } = require('../../utils/experience');
const repository = require('../../services/repository');
const { CATEGORY_LIST } = require('../../utils/constants');
const { groupByDate, formatDate } = require('../../utils/date');
const { heatmap } = require('../../utils/stats');
const PAGE_SIZE = 40;

function cardMemory(memory) {
  const cover = (memory.media || []).find((item) => item.type === 'image');
  return {
    _id: memory._id, title: memory.title, date: memory.date, time: memory.time,
    category: memory.category, mood: memory.mood, source: memory.source,
    content: String(memory.content || '').slice(0, 180),
    location: memory.location ? { name: memory.location.name || '' } : null,
    media: cover ? [{ type: 'image', url: cover.url || cover.fileID || '' }] : []
  };
}

Page(withExperience({
  data: {
    loading: true,
    keyword: '',
    activeCategory: '',
    categories: [{ key: '', name: '全部', emoji: '📒' }, ...CATEGORY_LIST],
    groups: [],
    heatmap: [],
    resultCount: 0,
    visibleCount: 0,
    hasMore: false
  },

  onLoad() {
    this._alive = true;
    this._allMemories = [];
    this._visibleLimit = PAGE_SIZE;
    this.loadMemories();
  },

  onShow() {
    this.getTabBar?.().setSelected(1);
    const pending = getApp().globalData.pendingTimelineCategory;
    if (pending !== undefined && pending !== null) {
      getApp().globalData.pendingTimelineCategory = null;
      this.setData({ activeCategory: pending });
    }
    if (!this.data.loading) this.loadMemories({ showLoading: false });
  },

  onUnload() { this._alive = false; clearTimeout(this.filterTimer); },

  onHide() { clearTimeout(this.filterTimer); },

  onReachBottom() {
    if (!this.data.hasMore) return;
    this._visibleLimit += PAGE_SIZE;
    this.applyFilters();
  },

  onPullDownRefresh() {
    this.loadMemories({ forceRefresh: true }).finally(() => wx.stopPullDownRefresh());
  },

  loadMemories(options = {}) {
    if (this._readPromise) return this._readPromise;
    if (options.showLoading !== false) this.setData({ loading: true });
    this._readPromise = this.readMemories(options).finally(() => { this._readPromise = null; });
    return this._readPromise;
  },

  async readMemories(options) {
    try {
      const res = await repository.listMemories({}, { forceRefresh: Boolean(options.forceRefresh) });
      if (this._alive === false) return;
      const memories = res.data || [];
      this._allMemories = memories;
      this._visibleLimit = PAGE_SIZE;
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 27);
      this.setData({
        heatmap: heatmap(memories, formatDate(windowStart), formatDate()),
        loading: false
      });
      this.applyFilters();
    } catch (error) {
      if (this._alive === false) return;
      console.error(error);
      this.setData({ loading: false });
      wx.showToast({ title: '读取轨迹失败', icon: 'none' });
    }
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
    clearTimeout(this.filterTimer);
    this._visibleLimit = PAGE_SIZE;
    this.filterTimer = setTimeout(() => { if (this._alive !== false) this.applyFilters(); }, 160);
  },

  selectCategory(event) {
    this._visibleLimit = PAGE_SIZE;
    this.setData({ activeCategory: event.currentTarget.dataset.key });
    this.applyFilters();
  },

  applyFilters() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const category = this.data.activeCategory;
    const filtered = (this._allMemories || []).filter((item) => {
      if (category && item.category !== category) return false;
      if (!keyword) return true;
      const text = `${item.title} ${item.content || ''} ${(item.tags || []).join(' ')} ${item.location?.name || ''}`.toLowerCase();
      return text.includes(keyword);
    });
    const visible = filtered.slice(0, this._visibleLimit || PAGE_SIZE);
    this.setData({ groups: groupByDate(visible.map(cardMemory)), resultCount: filtered.length,
      visibleCount: visible.length, hasMore: visible.length < filtered.length });
  },

  openMemory(event) {
    wx.navigateTo({ url: `/pages/memory-detail/index?id=${event.detail.id}` });
  },

  startRecord() {
    wx.switchTab({ url: '/pages/record/index' });
  },

  openMap() {
    wx.navigateTo({ url: '/pages/map/index' });
  }
}));
