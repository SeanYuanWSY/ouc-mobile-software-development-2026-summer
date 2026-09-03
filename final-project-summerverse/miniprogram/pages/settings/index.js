const repository = require('../../services/repository');
const wechatData = require('../../services/wechat-data');
const ai = require('../../services/ai');
const mediaService = require('../../services/media');
const storage = require('../../utils/storage');
const { STORAGE_KEYS, DEFAULT_PROFILE } = require('../../utils/constants');

Page({
  data: {
    profile: DEFAULT_PROFILE,
    cloudReady: false,
    cloudError: '',
    dataMode: 'local',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', note: '默认，速度与成本更适合日常交互' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: '复杂平行推演和长报告可选' }
    ],
    modelIndex: 0,
    tempApiKey: '',
    showKey: false,
    testingAI: false,
    connection: null,
    stepStatus: '未检查',
    locationStatus: '未检查',
    demoImported: false,
    savingProfile: false
  },

  onLoad() { this.load(); },

  async load() {
    const app = getApp();
    const profileRes = await repository.getProfile();
    const modelIndex = Math.max(0, this.data.models.findIndex((item) => item.id === app.globalData.aiModel));
    this.setData({
      profile: profileRes.data || DEFAULT_PROFILE,
      cloudReady: Boolean(app.globalData.cloudReady),
      cloudError: app.globalData.cloudError || '',
      dataMode: app.globalData.dataMode || 'local',
      modelIndex,
      tempApiKey: app.globalData.aiSessionKey || '',
      demoImported: Boolean(storage.get(STORAGE_KEYS.DEMO_IMPORTED, false))
    });
    this.refreshPermissionStatus();
  },

  goBack() { wx.navigateBack(); },

  onProfileInput(event) { this.setData({ [`profile.${event.currentTarget.dataset.field}`]: event.detail.value }); },

  onChooseAvatar(event) {
    const avatarUrl = event.detail.avatarUrl;
    if (avatarUrl) this.setData({ 'profile.avatarUrl': avatarUrl });
  },

  async saveProfile() {
    this.setData({ savingProfile: true });
    try {
      let profile = { ...this.data.profile };
      if (profile.avatarUrl && !profile.avatarUrl.startsWith('/images/') && !profile.avatarUrl.startsWith('cloud://') && !profile.avatarUrl.startsWith(wx.env.USER_DATA_PATH)) {
        const saved = await mediaService.persistItem({ type: 'image', tempFilePath: profile.avatarUrl, url: profile.avatarUrl });
        profile.avatarUrl = saved.fileID || saved.url;
        this.setData({ profile });
      }
      await repository.saveProfile(profile);
      wx.showToast({ title: '个人手账信息已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally { this.setData({ savingProfile: false }); }
  },

  onModelChange(event) {
    const modelIndex = Number(event.detail.value);
    const model = this.data.models[modelIndex];
    getApp().globalData.aiModel = model.id;
    this.setData({ modelIndex, connection: null });
  },

  onApiKeyInput(event) {
    const tempApiKey = event.detail.value.trim();
    getApp().setTemporaryApiKey(tempApiKey);
    this.setData({ tempApiKey, connection: null });
  },

  toggleKey() { this.setData({ showKey: !this.data.showKey }); },

  clearKey() {
    getApp().clearTemporaryApiKey();
    this.setData({ tempApiKey: '', connection: null });
  },

  async testAI() {
    if (!this.data.cloudReady) {
      wx.showModal({ title: '云函数未连接', content: '请先创建云开发环境并部署 deepseekProxy；正式 API Key 必须保存在云函数环境变量中。', showCancel: false });
      return;
    }
    this.setData({ testingAI: true, connection: { type: 'pending', text: '正在通过云函数连接 DeepSeek…' } });
    try {
      const result = await ai.ping();
      this.setData({ connection: { type: 'success', text: `连接成功 · ${result.model || this.data.models[this.data.modelIndex].id} · ${result.source || 'cloud-env'}` } });
    } catch (error) {
      this.setData({ connection: { type: 'error', text: error.message || '连接失败' } });
    } finally { this.setData({ testingAI: false }); }
  },

  async refreshPermissionStatus() {
    wx.getSetting({
      success: ({ authSetting }) => this.setData({
        stepStatus: authSetting['scope.werun'] ? '已授权' : '未授权',
        locationStatus: authSetting['scope.userLocation'] ? '已授权' : '未授权'
      })
    });
  },

  async authorizeStep() {
    wx.showLoading({ title: '验证微信运动' });
    try {
      const step = await wechatData.syncWeRun();
      this.setData({ stepStatus: `已同步 ${step.steps} 步` });
      wx.showToast({ title: '微信运动已接通', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '暂时无法接通', content: error.errMsg || error.message || '请使用真实 AppID、真机和已部署 weRunData 云函数。', showCancel: false });
    } finally { wx.hideLoading(); this.refreshPermissionStatus(); }
  },

  async authorizeLocation() {
    wx.showLoading({ title: '验证位置接口' });
    try {
      const point = await wechatData.getCurrentLocation('gcj02');
      this.setData({ locationStatus: `已授权 · 精度约 ${Math.round(point.accuracy || 0)}m` });
      wx.showToast({ title: '真实定位已接通', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '定位暂不可用', content: error.errMsg || error.message || '请检查 app.json 声明和公众平台接口权限。', showCancel: false });
    } finally { wx.hideLoading(); this.refreshPermissionStatus(); }
  },

  async importDemo() {
    const modal = await new Promise((resolve) => wx.showModal({
      title: '导入明确标注的演示数据？',
      content: '所有演示记录都会显示“示例”标签，不会冒充真实步数、地图或生活经历。',
      confirmText: '导入',
      success: resolve
    }));
    if (!modal.confirm) return;
    const result = await repository.importDemoData();
    this.setData({ demoImported: true });
    wx.showToast({ title: `已导入 ${result.memories} 条示例`, icon: 'success' });
  },

  clearDemo() {
    repository.clearDemoData();
    this.setData({ demoImported: false });
    wx.showToast({ title: '演示数据已移除', icon: 'success' });
  },

  exportData() {
    const json = JSON.stringify(repository.exportLocalData());
    wx.setClipboardData({
      data: json,
      success: () => wx.showModal({ title: '备份已复制', content: '这是本机数据备份 JSON，请妥善保存；照片云文件不会被复制为原始二进制。', showCancel: false })
    });
  },

  importData() {
    wx.getClipboardData({
      success: ({ data }) => {
        try {
          repository.importLocalData(JSON.parse(data));
          wx.showModal({ title: '导入成功', content: '本机记忆、目标和设置已经恢复。', showCancel: false });
        } catch (error) {
          wx.showModal({ title: '无法导入', content: error.message || '剪贴板不是有效的 SummerVerse 备份', showCancel: false });
        }
      }
    });
  },

  openPrivacy() {
    wx.showModal({
      title: '隐私原则',
      content: '位置、微信步数、照片和麦克风都只在你主动操作时请求；DeepSeek Key 不写入前端源码。正式版应在小程序后台完善隐私保护指引。',
      showCancel: false
    });
  }
});
