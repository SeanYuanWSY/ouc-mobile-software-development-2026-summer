const ENV = require('./config/env');

App({
  globalData: {
    cloudReady: false,
    cloudStatus: 'idle',
    cloudError: '',
    aiSessionKey: '',
    aiReady: false,
    aiConfigRevision: 0,
    aiConsent: {},
    aiModel: ENV.DEFAULT_AI_MODEL,
    aiProvider: ENV.DEFAULT_AI_PROVIDER,
    visionModel: ENV.DEFAULT_VISION_MODEL,
    lastSyncAt: 0,
    dataMode: 'local',
    editMemoryId: '',
    pendingTimelineCategory: null
  },

  onLaunch() {
    this.cloudReadyPromise = this.initializeCloud();
    this.setupUpdateManager();
  },

  initializeCloud() {
    if (!ENV.ENABLE_CLOUD || !wx.cloud) {
      this.globalData.cloudReady = false;
      this.globalData.cloudStatus = 'disabled';
      this.globalData.dataMode = 'local';
      this.globalData.cloudError = '当前环境未启用微信云开发';
      return Promise.resolve(false);
    }
    try {
      const options = { traceUser: true };
      if (ENV.CLOUD_ENV_ID) options.env = ENV.CLOUD_ENV_ID;
      wx.cloud.init(options);
      this.globalData.cloudStatus = 'checking';
    } catch (error) {
      this.globalData.cloudReady = false;
      this.globalData.cloudStatus = 'unavailable';
      this.globalData.dataMode = 'local';
      this.globalData.cloudError = error && error.message ? error.message : '云开发初始化失败';
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready, message = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.globalData.cloudReady = ready;
        this.globalData.cloudStatus = ready ? 'ready' : 'unavailable';
        this.globalData.dataMode = ready ? 'cloud' : 'local';
        this.globalData.cloudError = ready ? '' : message || '未检测到已部署的数据服务';
        resolve(ready);
      };
      const timer = setTimeout(() => finish(false, '云开发连接检测超时'), 8000);
      wx.cloud.callFunction({
        name: 'dataService',
        data: { action: 'system.ping' },
        success: ({ result }) => finish(Boolean(result && result.ok), result && (result.error || result.message)),
        fail: (error) => finish(false, error && (error.errMsg || error.message))
      });
    });
  },

  awaitCloudReady() {
    return this.cloudReadyPromise || Promise.resolve(Boolean(this.globalData.cloudReady));
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
    this.resetAiConnection();
  },

  clearTemporaryApiKey() {
    this.globalData.aiSessionKey = '';
    this.resetAiConnection();
  },

  resetAiConnection() {
    this.globalData.aiReady = false;
    this.globalData.aiConsent = {};
    this.globalData.aiConfigRevision += 1;
  }
});
