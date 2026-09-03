const ENV = require('./config/env');

App({
  globalData: {
    cloudReady: false,
    cloudError: '',
    aiSessionKey: '',
    aiModel: ENV.DEFAULT_AI_MODEL,
    aiProvider: ENV.DEFAULT_AI_PROVIDER,
    visionModel: ENV.DEFAULT_VISION_MODEL,
    lastSyncAt: 0,
    dataMode: 'local',
    editMemoryId: '',
    pendingTimelineCategory: null
  },

  onLaunch() {
    this.initializeCloud();
    this.setupUpdateManager();
  },

  initializeCloud() {
    if (!ENV.ENABLE_CLOUD || !wx.cloud) {
      this.globalData.cloudReady = false;
      this.globalData.dataMode = 'local';
      this.globalData.cloudError = '当前环境未启用微信云开发';
      return;
    }
    try {
      const options = { traceUser: true };
      if (ENV.CLOUD_ENV_ID) options.env = ENV.CLOUD_ENV_ID;
      wx.cloud.init(options);
      this.globalData.cloudReady = true;
      this.globalData.dataMode = 'cloud';
    } catch (error) {
      console.warn('[SummerVerse] cloud init failed:', error);
      this.globalData.cloudReady = false;
      this.globalData.dataMode = 'local';
      this.globalData.cloudError = error?.message || '云开发初始化失败';
    }
  },

  setupUpdateManager() {
    if (!wx.getUpdateManager) return;
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '新的夏日版本已到达',
        content: '更新后可获得最新功能与修复，是否立即重启？',
        success: ({ confirm }) => {
          if (confirm) updateManager.applyUpdate();
        }
      });
    });
  },

  setTemporaryApiKey(value) {
    this.globalData.aiSessionKey = String(value || '').trim();
  },

  clearTemporaryApiKey() {
    this.globalData.aiSessionKey = '';
  }
});
