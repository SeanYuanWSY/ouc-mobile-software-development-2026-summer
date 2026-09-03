const repository = require('../../services/repository');
const { CATEGORY_LIST } = require('../../utils/constants');
const { groupByDate, formatDate } = require('../../utils/date');
const { heatmap } = require('../../utils/stats');

Page({
  data: {
    loading: true,
    keyword: '',
    activeCategory: '',
    categories: [{ key: '', name: '全部', emoji: '📒' }, ...CATEGORY_LIST],
    allMemories: [],
    groups: [],
    heatmap: [],
    resultCount: 0
  },

  onLoad() {
    this.loadMemories();
  },

  onShow() {
    this.getTabBar?.().setSelected(1);
    const pending = getApp().globalData.pendingTimelineCategory;
    if (pending !== undefined && pending !== null) {
      getApp().globalData.pendingTimelineCategory = null;
      this.setData({ activeCategory: pending });
    }
    if (!this.data.loading) this.applyFilters();
  },

  onPullDownRefresh() {
    this.loadMemories().finally(() => wx.stopPullDownRefresh());
  },

  async loadMemories() {
    this.setData({ loading: true });
    try {
      const res = await repository.listMemories();
      const memories = res.data || [];
      const firstDate = memories.length ? memories[memories.length - 1].date : formatDate();
      this.setData({
        allMemories: memories,
        heatmap: heatmap(memories, firstDate, formatDate()).slice(-28),
        loading: false
      });
      this.applyFilters();
    } catch (error) {
      console.error(error);
      this.setData({ loading: false });
      wx.showToast({ title: '读取轨迹失败', icon: 'none' });
    }
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.applyFilters(), 160);
  },

  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.key });
    this.applyFilters();
  },

  applyFilters() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const category = this.data.activeCategory;
    const filtered = this.data.allMemories.filter((item) => {
      if (category && item.category !== category) return false;
      if (!keyword) return true;
      const text = `${item.title} ${item.content || ''} ${(item.tags || []).join(' ')} ${item.location?.name || ''}`.toLowerCase();
      return text.includes(keyword);
    });
    this.setData({ groups: groupByDate(filtered), resultCount: filtered.length });
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
});
