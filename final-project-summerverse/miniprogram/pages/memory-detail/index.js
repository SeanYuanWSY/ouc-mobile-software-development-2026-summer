const repository = require('../../services/repository');
const { CATEGORIES, MOODS } = require('../../utils/constants');
const { friendlyDate } = require('../../utils/date');
const mediaService = require('../../services/media');

Page({
  data: {
    loading: true,
    memory: null,
    category: CATEGORIES.life,
    mood: MOODS.calm,
    dateLabel: '',
    images: [],
    videos: [],
    audios: [],
    audioPlaying: false,
    importanceStars: ''
  },

  onLoad(options) {
    this.id = options.id;
    this.load();
  },

  onUnload() {
    this.audioContext?.stop();
    this.audioContext?.destroy();
  },

  async load() {
    try {
      const res = await repository.getMemory(this.id);
      if (!res.data) throw new Error('没有找到这条记忆');
      const memory = res.data;
      const media = memory.media || [];
      this.setData({
        memory,
        category: CATEGORIES[memory.category] || CATEGORIES.life,
        mood: MOODS[memory.mood] || MOODS.calm,
        dateLabel: friendlyDate(memory.date),
        images: media.filter((item) => item.type === 'image'),
        videos: media.filter((item) => item.type === 'video'),
        audios: media.filter((item) => item.type === 'audio'),
        importanceStars: '★★★★★'.slice(0, memory.importance),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({ title: '无法打开记忆', content: error.message, showCancel: false, success: () => wx.navigateBack() });
    }
  },

  goBack() { wx.navigateBack(); },

  previewImage(event) {
    const current = event.currentTarget.dataset.url;
    const urls = this.data.images.map((item) => item.url || item.fileID);
    wx.previewImage({ current, urls });
  },

  async toggleAudio(event) {
    const rawUrl = event.currentTarget.dataset.url;
    const url = await mediaService.resolveUrl(rawUrl);
    if (this.data.audioPlaying) {
      this.audioContext?.stop();
      this.setData({ audioPlaying: false });
      return;
    }
    this.audioContext?.destroy();
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.src = url;
    this.audioContext.onPlay(() => this.setData({ audioPlaying: true }));
    this.audioContext.onEnded(() => this.setData({ audioPlaying: false }));
    this.audioContext.onError(() => {
      this.setData({ audioPlaying: false });
      wx.showToast({ title: '语音暂时无法播放', icon: 'none' });
    });
    this.audioContext.play();
  },

  openLocation() {
    const location = this.data.memory?.location;
    if (!location) return;
    wx.openLocation({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      name: location.name,
      address: location.address,
      scale: 17
    });
  },

  edit() {
    getApp().globalData.editMemoryId = this.id;
    wx.switchTab({ url: '/pages/record/index' });
  },

  async remove() {
    const modal = await new Promise((resolve) => wx.showModal({
      title: '删除这颗记忆？',
      content: '删除后，小岛、时间轴、统计和 SummerTwin 都会同步减少这条记忆。',
      confirmColor: '#b14f4a',
      success: resolve
    }));
    if (!modal.confirm) return;
    wx.showLoading({ title: '正在删除' });
    try {
      await repository.deleteMemory(this.id);
      wx.hideLoading();
      wx.showToast({ title: '记忆已删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.hideLoading();
      wx.showModal({ title: '删除失败', content: error.message, showCancel: false });
    }
  },

  onShareAppMessage() {
    const memory = this.data.memory || {};
    return { title: `暑假记忆｜${memory.title || 'SummerVerse'}`, path: `/pages/memory-detail/index?id=${this.id}` };
  }
});
