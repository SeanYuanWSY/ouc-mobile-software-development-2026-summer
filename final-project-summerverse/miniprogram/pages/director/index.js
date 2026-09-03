const repository = require('../../services/repository');
const ai = require('../../services/ai');
const { formatDate } = require('../../utils/date');

Page({
  data: {
    loading: true,
    memories: [],
    themes: ['温暖成长', '安静日记', '夏日冒险', '学习与科研', '陪伴时光'],
    themeIndex: 0,
    storyboard: null,
    generating: false,
    playing: false,
    currentIndex: 0,
    currentChapter: null,
    posterSaving: false
  },

  onLoad() { this.load(); },
  onHide() { this.stopPlayback(); },
  onUnload() { this.stopPlayback(); },

  async load() {
    try {
      const res = await repository.listMemories();
      this.setData({ memories: res.data || [], loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '记忆读取失败', icon: 'none' });
    }
  },

  onThemeChange(event) { this.setData({ themeIndex: Number(event.detail.value) }); },

  enrichStoryboard(raw) {
    const memories = this.data.memories;
    const chapters = (raw.chapters || []).slice(0, 10).map((chapter, index) => {
      const id = (chapter.memoryIds || [])[0];
      const memory = memories.find((item) => item._id === id) || memories[index] || null;
      const cover = memory?.media?.find((item) => item.type === 'image');
      return {
        ...chapter,
        memory,
        cover: cover?.url || cover?.fileID || '/images/director-cover.jpg',
        index: index + 1
      };
    });
    return { ...raw, chapters };
  },

  async generate() {
    if (!this.data.memories.length) {
      wx.showToast({ title: '先记录几件真实发生的事', icon: 'none' });
      return;
    }
    this.setData({ generating: true, storyboard: null });
    try {
      const raw = await ai.director(this.data.memories, this.data.themes[this.data.themeIndex]);
      this.setData({ storyboard: this.enrichStoryboard(raw) });
    } catch (error) {
      wx.showModal({ title: '导演模式暂时不可用', content: error.message, showCancel: false });
    } finally { this.setData({ generating: false }); }
  },

  play() {
    if (!this.data.storyboard?.chapters?.length) return;
    this.stopPlayback();
    this.setData({ playing: true, currentIndex: 0, currentChapter: this.data.storyboard.chapters[0] });
    this.playTimer = setInterval(() => this.nextChapter(), 4200);
  },

  nextChapter() {
    const chapters = this.data.storyboard?.chapters || [];
    if (!chapters.length) return;
    const next = this.data.currentIndex + 1;
    if (next >= chapters.length) {
      this.stopPlayback();
      wx.showToast({ title: '夏日影片播放完毕', icon: 'success' });
      return;
    }
    this.setData({ currentIndex: next, currentChapter: chapters[next] });
  },

  previousChapter() {
    const chapters = this.data.storyboard?.chapters || [];
    const prev = Math.max(0, this.data.currentIndex - 1);
    this.setData({ currentIndex: prev, currentChapter: chapters[prev] });
  },

  stopPlayback() {
    clearInterval(this.playTimer);
    this.playTimer = null;
    if (this.data.playing) this.setData({ playing: false });
  },

  openMemory(event) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/memory-detail/index?id=${id}` });
  },

  savePoster() {
    if (!this.data.storyboard || this.data.posterSaving) return;
    this.setData({ posterSaving: true });
    wx.showLoading({ title: '绘制夏日封面' });
    const context = wx.createCanvasContext('posterCanvas', this);
    const title = this.data.storyboard.title || '我的 SummerVerse';
    context.setFillStyle('#f7f1e4');
    context.fillRect(0, 0, 750, 1000);
    context.drawImage('/images/director-cover.jpg', 50, 70, 650, 455);
    context.setFillStyle('rgba(255,250,239,.94)');
    context.fillRect(50, 470, 650, 420);
    context.setFillStyle('#2f2c27');
    context.setFontSize(44);
    context.fillText('SummerVerse', 85, 565);
    context.setFontSize(34);
    const lines = [title.slice(0, 18), title.slice(18, 36)].filter(Boolean);
    lines.forEach((line, index) => context.fillText(line, 85, 635 + index * 48));
    context.setFillStyle('#6f6a61');
    context.setFontSize(22);
    context.fillText(`${this.data.memories.length} 条真实记忆 · ${formatDate()}`, 85, 765);
    context.fillText('让每一个可见的夏天，都成为值得珍藏的宇宙。', 85, 830);
    context.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'posterCanvas',
        width: 750,
        height: 1000,
        destWidth: 750,
        destHeight: 1000,
        fileType: 'jpg',
        quality: 0.9,
        success: ({ tempFilePath }) => {
          wx.hideLoading();
          wx.previewImage({ urls: [tempFilePath], current: tempFilePath });
          this.setData({ posterSaving: false });
        },
        fail: (error) => {
          wx.hideLoading();
          this.setData({ posterSaving: false });
          wx.showModal({ title: '封面生成失败', content: error.errMsg || '请稍后重试', showCancel: false });
        }
      }, this);
    });
  },

  startRecord() { wx.switchTab({ url: '/pages/record/index' }); },
  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { title: this.data.storyboard?.title || '我的 SummerVerse 夏日故事', path: '/pages/director/index' };
  }
});
