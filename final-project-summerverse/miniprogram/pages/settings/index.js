const repository = require('../../services/repository');
const wechatData = require('../../services/wechat-data');
const ai = require('../../services/ai');
const mediaService = require('../../services/media');
const storage = require('../../utils/storage');
const { STORAGE_KEYS, DEFAULT_PROFILE } = require('../../utils/constants');
const { backOrHome } = require('../../utils/navigation');

Page({
  data: {
    profile: DEFAULT_PROFILE,
    cloudReady: false,
    cloudError: '',
    cloudErrorSummary: '',
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
    syncingStep: false,
    locationStatus: '未检查',
    demoImported: false,
    savingProfile: false
  },

  onLoad() { this.load(); },
  onShow() { this.setData({ tempApiKey: getApp().globalData.aiSessionKey || '', showKey: false }); },
  onHide() { this.setData({ tempApiKey: '', showKey: false }); },

  async load() {
    const app = getApp();
    const profileRes = await repository.getProfile();
    const modelIndex = Math.max(0, this.data.models.findIndex((item) => item.id === app.globalData.aiModel));
    this.setData({
      profile: profileRes.data || DEFAULT_PROFILE,
      cloudReady: Boolean(app.globalData.cloudReady),
      cloudError: app.globalData.cloudError || '',
      cloudErrorSummary: this.summarizeCloudError(app.globalData.cloudError),
      dataMode: app.globalData.dataMode || 'local',
      modelIndex,
      tempApiKey: app.globalData.aiSessionKey || '',
      demoImported: Boolean(storage.get(STORAGE_KEYS.DEMO_IMPORTED, false))
    });
    this.refreshPermissionStatus();
  },

  summarizeCloudError(error) {
    const text = String(error || '');
    if (!text) return '';
    if (text.includes('-601034') || text.includes('没有权限') || text.includes('开通云开发')) {
      return '尚未开通或绑定微信云开发环境。';
    }
    if (text.includes('FunctionName parameter could not be found') || text.includes('FUNCTION_NOT_FOUND')) {
      return '云环境已存在，但必需的云函数还没有部署。';
    }
    if (text.includes('timeout') || text.includes('超时')) return '云服务响应超时，请稍后重试。';
    return '云环境尚未通过连接检查。';
  },

  goBack() { backOrHome(); },

  onProfileInput(event) { this.setData({ [`profile.${event.currentTarget.dataset.field}`]: event.detail.value }); },

  onChooseAvatar(event) {
    const avatarUrl = event.detail.avatarUrl;
    if (avatarUrl) this.setData({ 'profile.avatarUrl': avatarUrl });
  },

  async saveProfile() {
    this.setData({ savingProfile: true });
    let persistedAvatar = null;
    try {
      let profile = { ...this.data.profile };
      if (profile.avatarUrl && !profile.avatarUrl.startsWith('/images/') && !profile.avatarUrl.startsWith('cloud://') && !profile.avatarUrl.startsWith(wx.env.USER_DATA_PATH)) {
        const saved = await mediaService.persistItem({ type: 'image', tempFilePath: profile.avatarUrl, url: profile.avatarUrl });
        persistedAvatar = saved;
        profile.avatarUrl = saved.fileID || saved.url;
        this.setData({ profile });
      }
      const saved = await repository.saveProfile(profile);
      const cleanup = saved.data && saved.data._mediaCleanup;
      if (cleanup && cleanup.failed && cleanup.failed.length) {
        wx.showModal({ title: '信息已保存', content: '旧头像未能自动清理，请稍后在云开发控制台检查。', showCancel: false });
      } else {
        wx.showToast({ title: '个人手账信息已保存', icon: 'success' });
      }
    } catch (error) {
      const rollback = persistedAvatar ? await mediaService.rollbackPersisted([persistedAvatar]) : null;
      if (rollback && rollback.failed.length) {
        wx.showModal({ title: '保存失败', content: '个人信息未保存，且新头像未能自动清理，请在云开发控制台检查。', showCancel: false });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } finally { this.setData({ savingProfile: false }); }
  },

  onModelChange(event) {
    const modelIndex = Number(event.detail.value);
    const model = this.data.models[modelIndex];
    getApp().globalData.aiModel = model.id;
    getApp().resetAiConnection();
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
      wx.showModal({ title: '云函数未连接', content: 'AI 服务尚未就绪，请稍后重试。无需提供开发者的 Key；服务就绪后只使用你在本页填写的个人 Key。', showCancel: false });
      return;
    }
    this.setData({ testingAI: true, connection: { type: 'pending', text: '正在通过云函数连接 DeepSeek…' } });
    try {
      const result = await ai.ping();
      this.setData({ connection: { type: 'success', text: `连接成功 · ${result.model || this.data.models[this.data.modelIndex].id} · 使用你的个人 Key` } });
    } catch (error) {
      this.setData({ connection: { type: 'error', text: this.friendlyAiError(error) } });
    } finally { this.setData({ testingAI: false }); }
  },

  friendlyAiError(error = {}) {
    const tips = {
      AI_AUTH_FAILED: 'API Key 无效或已失效，请重新填写你自己的 Key。',
      AI_BALANCE_INSUFFICIENT: 'DeepSeek 账户额度不可用，请先在开放平台充值或检查余额。',
      AI_UPSTREAM_RATE_LIMITED: 'DeepSeek 请求较多，请稍后再试。',
      AI_QUOTA_UNAVAILABLE: '暂时无法校验使用额度，本次未请求 DeepSeek，请稍后重试。',
      AI_TIMEOUT: 'DeepSeek 响应超时，请稍后再试。',
      AI_UPSTREAM_UNAVAILABLE: 'DeepSeek 服务暂时不可用，请稍后再试。',
      AI_KEY_MISSING: '请先填写你自己的 DeepSeek API Key。',
      FUNCTION_NOT_FOUND: 'deepseekProxy 尚未部署。'
    };
    return tips[error.code] || error.message || '连接失败，请检查云函数与网络。';
  },

  async refreshPermissionStatus() {
    wx.getSetting({
      success: ({ authSetting }) => this.setData({
        stepStatus: authSetting['scope.werun'] ? (this.data.stepStatus.startsWith('已同步') || this.data.stepStatus === '同步失败' ? this.data.stepStatus : '已授权，待同步') : '未授权',
        locationStatus: authSetting['scope.userLocation'] ? '已授权' : '未授权'
      })
    });
  },

  async authorizeStep() {
    if (this.data.syncingStep) return;
    this.setData({ syncingStep: true });
    wx.showLoading({ title: '验证微信运动' });
    try {
      const step = await wechatData.syncWeRun();
      this.setData({ stepStatus: `已同步 ${step.date} · ${step.steps} 步` });
      wx.showToast({ title: '微信运动已接通', icon: 'success' });
    } catch (error) {
      this.setData({ stepStatus: '同步失败' });
      wx.showModal({ title: '暂时无法接通', content: error.errMsg || error.message || '请使用真实 AppID、真机和已部署 weRunData 云函数。', showCancel: false });
    } finally { wx.hideLoading(); this.setData({ syncingStep: false }); this.refreshPermissionStatus(); }
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
    if (this.data.dataMode === 'cloud') {
      wx.showModal({ title: '演示数据仅用于本机预览', content: '当前正在使用微信云数据，为避免把示例混入真实账号，云模式不提供导入。', showCancel: false });
      return;
    }
    const modal = await new Promise((resolve) => wx.showModal({
      title: '导入明确标注的演示数据？',
      content: '所有演示记录都会显示“示例”标签，不会冒充真实步数、地图或生活经历。',
      confirmText: '导入',
      success: resolve
    }));
    if (!modal.confirm) return;
    try {
      const result = await repository.importDemoData();
      this.setData({ demoImported: true });
      wx.showToast({ title: `已导入 ${result.memories} 条示例`, icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '导入未完成', content: error.message, showCancel: false });
    }
  },

  async clearDemo() {
    if (this.data.dataMode === 'cloud') {
      wx.showModal({ title: '无需移除', content: '云数据库中不会自动导入本机演示数据。', showCancel: false });
      return;
    }
    const modal = await new Promise((resolve) => wx.showModal({
      title: '移除全部演示数据？',
      content: '只会移除带有“示例”标记的记忆和目标，你自己的记录会保留。',
      confirmText: '移除',
      confirmColor: '#b14f4a',
      success: resolve
    }));
    if (!modal.confirm) return;
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

  async importData() {
    const modal = await new Promise((resolve) => wx.showModal({
      title: '从剪贴板恢复备份？',
      content: '恢复会覆盖当前本机记忆、目标和个人信息。建议先导出一份现有备份。',
      confirmText: '继续恢复',
      confirmColor: '#b14f4a',
      success: resolve
    }));
    if (!modal.confirm) return;
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
      content: '位置、微信步数、照片和麦克风只在你主动操作时请求。AI 功能会在同意后将相关记忆或照片经腾讯云发送给 DeepSeek，费用由你自己的 API 账户承担。Key 仅在本次运行内使用，可随时清除；基础记录无需 Key。',
      showCancel: false
    });
  }
});
