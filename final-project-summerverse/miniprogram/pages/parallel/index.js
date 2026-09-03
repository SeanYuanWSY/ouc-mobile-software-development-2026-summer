const repository = require('../../services/repository');
const ai = require('../../services/ai');
const { CATEGORIES } = require('../../utils/constants');
const { formatDate, formatTime } = require('../../utils/date');

Page({
  data: {
    loading: true,
    memories: [],
    memoryTitles: [],
    selectedIndex: 0,
    selectedMemory: null,
    alternative: '',
    result: null,
    generating: false,
    saved: false
  },

  onLoad() { this.load(); },

  async load() {
    try {
      const res = await repository.listMemories();
      const memories = res.data || [];
      this.setData({
        memories,
        memoryTitles: memories.map((item) => `${item.date} · ${item.title}`),
        selectedMemory: memories[0] || null,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '记忆读取失败', icon: 'none' });
    }
  },

  onMemoryChange(event) {
    const selectedIndex = Number(event.detail.value);
    this.setData({ selectedIndex, selectedMemory: this.data.memories[selectedIndex], result: null, saved: false });
  },

  onAlternativeInput(event) { this.setData({ alternative: event.detail.value }); },

  useAlternative(event) { this.setData({ alternative: event.currentTarget.dataset.value }); },

  async generate() {
    if (!this.data.selectedMemory) {
      wx.showToast({ title: '先选择一条真实记忆', icon: 'none' });
      return;
    }
    if (!this.data.alternative.trim()) {
      wx.showToast({ title: '写下另一种选择', icon: 'none' });
      return;
    }
    this.setData({ generating: true, result: null, saved: false });
    try {
      const result = await ai.parallel(this.data.selectedMemory, this.data.alternative);
      this.setData({ result });
    } catch (error) {
      wx.showModal({ title: '平行路线生成失败', content: error.message, showCancel: false });
    } finally { this.setData({ generating: false }); }
  },

  async saveReflection() {
    if (!this.data.result || this.data.saved) return;
    const result = this.data.result;
    const memory = {
      title: `平行思考：${result.title || this.data.selectedMemory.title}`,
      content: `${result.letter || ''}\n\n另一种选择：${this.data.alternative}`,
      category: 'life',
      mood: 'calm',
      date: formatDate(),
      time: formatTime(),
      importance: 3,
      tags: ['平行暑假', '反事实思考'],
      source: 'reflection'
    };
    wx.showLoading({ title: '保存思考' });
    try {
      await repository.saveMemory(memory);
      this.setData({ saved: true });
      wx.showToast({ title: '已保存为反思记忆', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally { wx.hideLoading(); }
  },

  startRecord() { wx.switchTab({ url: '/pages/record/index' }); },
  goBack() { wx.navigateBack(); }
});
