const ENV = require('./config/env');
const aiPreferences = require('./services/ai-preferences');

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
    aiEndpoint: '',
    visionModel: ENV.DEFAULT_VISION_MODEL,
    lastSyncAt: 0,
    dataMode: ENV.ENABLE_CLOUD === false ? 'local' : 'cloud',
    cloudIntent: ENV.ENABLE_CLOUD !== false,
    cloudGeneration: 0,
    editMemoryId: '',
    pendingTimelineCategory: null,
    pendingMaterials: []
  },

  onLaunch(options = {}) {
    this.captureMaterials(options);
    const saved = aiPreferences.load();
    this.globalData.aiProvider = saved.provider;
    this.globalData.aiModel = saved.model;
    this.globalData.visionModel = saved.visionModel;
    this.globalData.aiEndpoint = saved.endpoint;
    this.reconnectCloud();
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange(({ isConnected }) => {
      if (isConnected && this.globalData.cloudIntent && !this.globalData.cloudReady) this.reconnectCloud();
    });
    this.setupUpdateManager();
  },

  onShow(options = {}) {
    this.captureMaterials(options);
    if (this.globalData.cloudIntent && this.globalData.cloudStatus === 'unavailable' && Date.now() - (this._lastCloudAttempt || 0) > 15000) this.reconnectCloud();
  },

  captureMaterials(options) {
    // Only accept WeChat's file-opening scene. A query string cannot supply files.
    if (options.scene !== 1173 || !Array.isArray(options.forwardMaterials)) return;
    const files = options.forwardMaterials.slice(0, 7).map(({ path, name, size, type }) => ({ path, name, size, type }));
    const signature = JSON.stringify(files);
    const now = Date.now();
    // Cold start calls onLaunch and onShow with the same material event.
    if (this._materialSignature === signature && now - this._materialCapturedAt < 1500) return;
    this._materialSignature = signature;
    this._materialCapturedAt = now;
    this.globalData.pendingMaterials = files;
  },

  reconnectCloud() {
    if (this._cloudConnecting) return this.cloudReadyPromise;
    this._cloudConnecting = true;
    this._lastCloudAttempt = Date.now();
    const generation = (this.globalData.cloudGeneration || 0) + 1;
    this.globalData.cloudGeneration = generation;
    this.cloudReadyPromise = this.initializeCloud(generation).finally(() => {
      if (this.globalData.cloudGeneration === generation) this._cloudConnecting = false;
    });
    return this.cloudReadyPromise;
  },

  initializeCloud(generation = this.globalData.cloudGeneration) {
    if (ENV.ENABLE_CLOUD === false) {
      this.globalData.cloudReady = false;
      this.globalData.cloudStatus = 'disabled';
      this.globalData.dataMode = 'local';
      this.globalData.cloudError = '当前环境未启用微信云开发';
      return Promise.resolve(false);
    }
    this.globalData.dataMode = 'cloud';
    this.globalData.cloudIntent = true;
    if (!wx.cloud) {
      this.globalData.cloudReady = false;
      this.globalData.cloudStatus = 'unavailable';
      this.globalData.cloudError = '当前微信不支持云开发，请升级微信后重新连接';
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
      this.globalData.cloudError = error && error.message ? error.message : '云开发初始化失败';
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready, message = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (generation !== this.globalData.cloudGeneration) { resolve(false); return; }
        this.globalData.cloudReady = ready;
        this.globalData.cloudStatus = ready ? 'ready' : 'unavailable';
        this.globalData.cloudError = ready ? '' : message || '未检测到已部署的数据服务';
        resolve(ready);
      };
      const timer = setTimeout(() => finish(false, '云开发连接检测超时'), 8000);
      try { wx.cloud.callFunction({
        name: 'dataService',
        data: { action: 'system.ping' },
        success: (response) => finish(response?.result?.ok === true, response?.result?.error || response?.result?.message),
        fail: (error) => finish(false, error && (error.errMsg || error.message))
      }); } catch (error) { finish(false, error?.message || '云开发连接检测失败'); }
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

  updateAiPreferences(input) {
    const next = aiPreferences.normalize(input);
    if (next.provider !== this.globalData.aiProvider || next.endpoint !== this.globalData.aiEndpoint) {
      this.globalData.aiSessionKey = '';
    }
    this.globalData.aiProvider = next.provider;
    this.globalData.aiEndpoint = next.endpoint;
    this.globalData.aiModel = next.model;
    this.globalData.visionModel = next.visionModel;
    this.resetAiConnection();
    return aiPreferences.save(input);
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
