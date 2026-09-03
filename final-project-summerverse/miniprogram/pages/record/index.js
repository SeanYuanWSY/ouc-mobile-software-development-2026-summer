const repository = require('../../services/repository');
const ai = require('../../services/ai');
const wechatData = require('../../services/wechat-data');
const mediaService = require('../../services/media');
const { CATEGORY_LIST, MOOD_LIST } = require('../../utils/constants');
const { formatDate, formatTime } = require('../../utils/date');
const { normalizeMemory } = require('../../utils/validate');

function blankForm() {
  const now = new Date();
  return {
    _id: '',
    title: '',
    content: '',
    category: 'life',
    mood: 'calm',
    importance: 3,
    date: formatDate(now),
    time: formatTime(now),
    durationMinutes: '',
    location: null,
    media: [],
    tags: [],
    source: 'manual'
  };
}

Page({
  data: {
    form: blankForm(),
    categoryList: CATEGORY_LIST,
    moodList: MOOD_LIST,
    aiDraft: '',
    aiParsing: false,
    saving: false,
    recording: false,
    recordSeconds: 0,
    uploadProgress: '',
    editing: false,
    aiPhotoBusy: false,
    cloudReady: false,
    importanceOptions: [1, 2, 3, 4, 5]
  },

  onLoad(options) {
    this.setupRecorder();
    this.setData({ cloudReady: Boolean(getApp().globalData.cloudReady) });
    if (options.id) this.loadMemory(options.id);
  },

  onShow() {
    this.getTabBar?.().setSelected(2);
    this.setData({ cloudReady: Boolean(getApp().globalData.cloudReady) });
    const pendingId = getApp().globalData.editMemoryId;
    if (pendingId && pendingId !== this.data.form._id) {
      getApp().globalData.editMemoryId = '';
      this.loadMemory(pendingId);
    }
  },

  onUnload() {
    clearInterval(this.recordTimer);
    if (this.data.recording) this.recorderManager?.stop();
  },

  setupRecorder() {
    if (!wx.getRecorderManager) return;
    this.recorderManager = wx.getRecorderManager();
    this.recorderManager.onStop((result) => {
      clearInterval(this.recordTimer);
      const audio = {
        id: `audio-${Date.now()}`,
        type: 'audio',
        tempFilePath: result.tempFilePath,
        url: result.tempFilePath,
        duration: Math.round((result.duration || 0) / 1000)
      };
      this.setData({
        'form.media': [...this.data.form.media.filter((item) => item.type !== 'audio'), audio],
        recording: false,
        recordSeconds: audio.duration
      });
      wx.showToast({ title: '语音已加入记忆', icon: 'success' });
    });
    this.recorderManager.onError((error) => {
      clearInterval(this.recordTimer);
      this.setData({ recording: false });
      wx.showModal({ title: '录音失败', content: error.errMsg || '请检查麦克风权限', showCancel: false });
    });
  },

  async loadMemory(id) {
    wx.showLoading({ title: '翻开记忆' });
    try {
      const res = await repository.getMemory(id);
      if (!res.data) throw new Error('没有找到这条记忆');
      this.setData({ form: { ...blankForm(), ...res.data }, editing: true });
    } catch (error) {
      wx.showModal({ title: '无法编辑', content: error.message, showCancel: false, success: () => wx.navigateBack() });
    } finally {
      wx.hideLoading();
    }
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onAiDraftInput(event) {
    this.setData({ aiDraft: event.detail.value });
  },

  selectCategory(event) {
    this.setData({ 'form.category': event.currentTarget.dataset.key });
  },

  selectMood(event) {
    this.setData({ 'form.mood': event.currentTarget.dataset.key });
  },

  selectImportance(event) {
    this.setData({ 'form.importance': Number(event.currentTarget.dataset.value) });
  },

  onDateChange(event) {
    this.setData({ 'form.date': event.detail.value });
  },

  onTimeChange(event) {
    this.setData({ 'form.time': event.detail.value });
  },

  async parseWithAI() {
    const text = this.data.aiDraft.trim();
    if (!text) {
      wx.showToast({ title: '先说说发生了什么', icon: 'none' });
      return;
    }
    this.setData({ aiParsing: true });
    try {
      const parsed = await ai.parseMemory(text);
      this.setData({
        form: {
          ...this.data.form,
          title: parsed.title || this.data.form.title,
          content: parsed.content || text,
          category: parsed.category || this.data.form.category,
          mood: parsed.mood || this.data.form.mood,
          durationMinutes: parsed.durationMinutes || this.data.form.durationMinutes,
          importance: parsed.importance || this.data.form.importance,
          tags: parsed.tags || [],
          source: 'ai-assisted'
        }
      });
      wx.showToast({ title: '已整理成记忆草稿', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '整理失败', content: error.message || '请稍后再试', showCancel: false });
    } finally {
      this.setData({ aiParsing: false });
    }
  },

  chooseMedia() {
    wx.chooseMedia({
      count: Math.max(1, 9 - this.data.form.media.filter((item) => item.type !== 'audio').length),
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: ({ tempFiles }) => {
        const added = tempFiles.map((file) => ({
          id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: file.fileType === 'video' ? 'video' : 'image',
          tempFilePath: file.tempFilePath,
          url: file.tempFilePath,
          size: file.size || 0,
          duration: file.duration || 0
        }));
        this.setData({ 'form.media': [...this.data.form.media, ...added].slice(0, 9) });
      }
    });
  },

  previewMedia(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.form.media[index];
    if (!item) return;
    if (item.type === 'image') {
      const images = this.data.form.media.filter((media) => media.type === 'image').map((media) => media.url || media.fileID);
      wx.previewImage({ current: item.url || item.fileID, urls: images });
    } else if (item.type === 'video') {
      wx.previewMedia({ current: 0, sources: [{ url: item.url || item.fileID, type: 'video' }] });
    }
  },

  removeMedia(event) {
    const index = Number(event.currentTarget.dataset.index);
    const next = [...this.data.form.media];
    next.splice(index, 1);
    this.setData({ 'form.media': next });
  },

  toggleRecording() {
    if (!this.recorderManager) {
      wx.showToast({ title: '当前基础库不支持录音', icon: 'none' });
      return;
    }
    if (this.data.recording) {
      this.recorderManager.stop();
      return;
    }
    this.setData({ recording: true, recordSeconds: 0 });
    this.recorderManager.start({ duration: 60000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 });
    this.recordTimer = setInterval(() => this.setData({ recordSeconds: this.data.recordSeconds + 1 }), 1000);
  },

  async chooseLocation() {
    try {
      const location = await wechatData.chooseLocation();
      this.setData({ 'form.location': location });
    } catch (error) {
      if (!/cancel/.test(error.errMsg || '')) wx.showToast({ title: '没有选择地点', icon: 'none' });
    }
  },

  clearLocation() {
    this.setData({ 'form.location': null });
  },

  async analyzeFirstPhoto() {
    if (this.data.aiPhotoBusy) return;
    const index = this.data.form.media.findIndex((item) => item.type === 'image');
    if (index < 0) {
      wx.showToast({ title: '先添加一张照片', icon: 'none' });
      return;
    }
    if (!getApp().globalData.cloudReady) {
      wx.showModal({ title: '需要云开发', content: 'AI 看图会先把照片上传到你的云存储，再由 deepseekProxy 安全调用视觉模型。', showCancel: false });
      return;
    }
    this.setData({ aiPhotoBusy: true });
    wx.showLoading({ title: 'SummerTwin 正在看图' });
    try {
      const item = await mediaService.persistItem(this.data.form.media[index]);
      const media = [...this.data.form.media];
      media[index] = item;
      this.setData({ 'form.media': media });
      const parsed = await ai.analyzePhoto(item.fileID, this.data.form.content || this.data.aiDraft);
      this.setData({
        form: {
          ...this.data.form,
          title: parsed.title || this.data.form.title,
          content: parsed.content || this.data.form.content,
          category: parsed.category || this.data.form.category,
          mood: parsed.mood || this.data.form.mood,
          tags: parsed.tags || this.data.form.tags,
          source: 'ai-assisted'
        }
      });
      wx.showToast({ title: '照片已转成记忆草稿', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: 'AI 看图失败', content: error.message || '请检查 DeepSeek 视觉模型配置', showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ aiPhotoBusy: false });
    }
  },

  async save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!form.title.trim()) {
      wx.showToast({ title: '给这颗记忆起个名字', icon: 'none' });
      return;
    }
    this.setData({ saving: true, uploadProgress: '' });
    wx.showLoading({ title: '正在保存记忆' });
    try {
      const media = await mediaService.persistAll(form.media, (current, total) => {
        this.setData({ uploadProgress: total ? `正在保存附件 ${current}/${total}` : '' });
      });
      const memory = normalizeMemory({ ...form, media });
      await repository.saveMemory(memory);
      wx.hideLoading();
      await new Promise((resolve) => wx.showModal({
        title: this.data.editing ? '记忆已更新' : '小岛亮起了一盏新灯',
        content: this.data.editing ? '修改已经保存。' : '这条真实记录已经进入时间轴、统计和 SummerTwin 的记忆中。',
        showCancel: false,
        confirmText: '回到小岛',
        success: resolve
      }));
      this.setData({ form: blankForm(), aiDraft: '', editing: false });
      wx.switchTab({ url: '/pages/island/index' });
    } catch (error) {
      wx.hideLoading();
      wx.showModal({ title: '保存失败', content: error.message || error.errMsg || '请稍后重试', showCancel: false });
    } finally {
      this.setData({ saving: false, uploadProgress: '' });
    }
  }
});
