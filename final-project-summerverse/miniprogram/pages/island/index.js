const repository = require('../../services/repository');
const wechatData = require('../../services/wechat-data');
const { CATEGORIES, CATEGORY_LIST, MOODS, ISLAND_ASSETS, DEFAULT_PROFILE, STORAGE_KEYS } = require('../../utils/constants');
const { buildSummary, categoryCounts } = require('../../utils/stats');
const { formatDate, friendlyDate } = require('../../utils/date');
const storage = require('../../utils/storage');

const HOTSPOTS = {
  study: { x: 28, y: 23 },
  research: { x: 79, y: 25 },
  family: { x: 84, y: 52 },
  explore: { x: 20, y: 56 },
  health: { x: 31, y: 82 },
  life: { x: 84, y: 83 }
};

function weatherMeta(code, isDay = true) {
  const value = Number(code);
  if (value === 0) return { icon: isDay ? '☀️' : '🌙', label: '晴朗' };
  if ([1, 2].includes(value)) return { icon: isDay ? '🌤️' : '☁️', label: '少云' };
  if (value === 3) return { icon: '☁️', label: '阴' };
  if ([45, 48].includes(value)) return { icon: '🌫️', label: '有雾' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { icon: '🌧️', label: '有雨' };
  if ([71, 73, 75, 77, 85, 86].includes(value)) return { icon: '❄️', label: '有雪' };
  if ([95, 96, 99].includes(value)) return { icon: '⛈️', label: '雷雨' };
  return { icon: '🌤️', label: '天气' };
}

Page({
  data: {
    loading: true,
    profile: DEFAULT_PROFILE,
    memories: [],
    latestMemories: [],
    goals: [],
    summary: {},
    stage: 0,
    stageAsset: ISLAND_ASSETS[0],
    stageLabel: '初生小岛',
    categories: [],
    step: null,
    weather: null,
    mood: null,
    todayLabel: friendlyDate(formatDate()),
    dataMode: 'local',
    aiReady: false,
    syncingStep: false,
    syncingWeather: false,
    stepProgress: 0,
    showOnboarding: false,
    onboardingStep: 0,
    onboardingSlides: [
      { emoji: '🏝️', title: '真实记忆，会长成一座岛', copy: '每保存一件真实发生的事，小岛才会出现新的建筑、道路与灯光。' },
      { emoji: '👟', title: '授权以后，才读取真实数据', copy: '步数、位置、照片和麦克风都只在你主动点击时请求；失败时不会补上模拟数字。' },
      { emoji: '🌱', title: 'AI 帮你理解，但不替你编造', copy: 'SummerTwin 会把事实、推测与生成故事分开显示，所有草稿都由你确认后保存。' }
    ]
  },

  onLoad() {
    this.setData({ showOnboarding: !storage.get(STORAGE_KEYS.ONBOARDED, false) });
    this.refresh();
  },

  onShow() {
    this.getTabBar?.().setSelected(0);
    if (!this.data.loading) this.refresh(false);
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const [memoryRes, goalRes, profileRes] = await Promise.all([
        repository.listMemories(),
        repository.listGoals(),
        repository.getProfile()
      ]);
      const memories = memoryRes.data || [];
      const goals = goalRes.data || [];
      const profile = profileRes.data || DEFAULT_PROFILE;
      const step = repository.getStepSnapshot();
      const weather = repository.getWeatherSnapshot();
      const summary = buildSummary(memories, goals, step);
      const counts = categoryCounts(memories);
      const categories = CATEGORY_LIST.map((item) => ({
        ...item,
        count: counts[item.key] || 0,
        style: `left:${HOTSPOTS[item.key].x}%;top:${HOTSPOTS[item.key].y}%`
      }));
      const latestMoodMemory = memories.find((item) => MOODS[item.mood]);
      const categoryMap = categories.reduce((map, item) => { map[item.key] = item; return map; }, {});
      const latestMemories = memories.slice(0, 3).map((item) => ({ ...item, categoryMeta: categoryMap[item.category] || CATEGORIES.life }));
      const stepProgress = step ? Math.min(100, Math.round((Number(step.steps) || 0) / 100)) : 0;
      const stage = summary.islandStage;
      const stageLabels = ['初生小岛', '成长中的岛', '丰盈夜岛'];
      this.setData({
        memories,
        latestMemories,
        goals,
        profile,
        summary,
        categories,
        stage,
        stageAsset: ISLAND_ASSETS[stage],
        stageLabel: stageLabels[stage],
        step,
        stepProgress,
        weather: weather ? { ...weather, meta: weatherMeta(weather.weatherCode, weather.isDay !== false) } : null,
        mood: latestMoodMemory ? MOODS[latestMoodMemory.mood] : null,
        dataMode: memoryRes.mode,
        aiReady: Boolean(getApp().globalData.cloudReady),
        loading: false
      });
    } catch (error) {
      console.error(error);
      this.setData({ loading: false });
      wx.showToast({ title: '读取小岛失败', icon: 'none' });
    }
  },


  nextOnboarding() {
    const next = this.data.onboardingStep + 1;
    if (next >= this.data.onboardingSlides.length) {
      storage.set(STORAGE_KEYS.ONBOARDED, true);
      this.setData({ showOnboarding: false, onboardingStep: 0 });
      return;
    }
    this.setData({ onboardingStep: next });
  },

  skipOnboarding() {
    storage.set(STORAGE_KEYS.ONBOARDED, true);
    this.setData({ showOnboarding: false, onboardingStep: 0 });
  },

  startRecord() {
    wx.switchTab({ url: '/pages/record/index' });
  },

  openCategory(event) {
    const category = event.currentTarget.dataset.category;
    getApp().globalData.pendingTimelineCategory = category;
    wx.switchTab({ url: '/pages/timeline/index' });
  },

  openMemory(event) {
    wx.navigateTo({ url: `/pages/memory-detail/index?id=${event.currentTarget.dataset.id}` });
  },

  openMap() {
    wx.navigateTo({ url: '/pages/map/index' });
  },

  openReport() {
    wx.navigateTo({ url: '/pages/report/index' });
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  openTwin() {
    wx.switchTab({ url: '/pages/twin/index' });
  },

  async syncStep() {
    if (this.data.syncingStep) return;
    this.setData({ syncingStep: true });
    wx.showLoading({ title: '同步微信步数' });
    try {
      const step = await wechatData.syncWeRun();
      this.setData({ step, stepProgress: Math.min(100, Math.round((Number(step.steps) || 0) / 100)), summary: { ...this.data.summary, todaySteps: step.steps } });
      wx.showToast({ title: '真实步数已同步', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '暂时无法读取微信步数', content: error?.errMsg || error?.message || '请检查云开发、微信运动授权及真机环境。', showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ syncingStep: false });
    }
  },

  async syncWeather() {
    if (this.data.syncingWeather) return;
    this.setData({ syncingWeather: true });
    wx.showLoading({ title: '定位天气' });
    try {
      const weather = await wechatData.syncWeather();
      this.setData({ weather: { ...weather, meta: weatherMeta(weather.weatherCode, weather.isDay !== false) } });
      wx.showToast({ title: '实时天气已更新', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '暂时无法获取天气', content: error?.errMsg || error?.message || '请检查位置授权和 weather 云函数。', showCancel: false });
    } finally {
      wx.hideLoading();
      this.setData({ syncingWeather: false });
    }
  },

  onShareAppMessage() {
    return {
      title: `我的暑假小岛已经收集了 ${this.data.memories.length} 颗真实记忆`,
      path: '/pages/island/index'
    };
  }
});
