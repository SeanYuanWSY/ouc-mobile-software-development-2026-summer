const repository = require('../../services/repository');
const wechatData = require('../../services/wechat-data');
const { CATEGORIES } = require('../../utils/constants');
const { routeDistance } = require('../../utils/stats');
const { formatDate, friendlyDate } = require('../../utils/date');

function markerIcon(category) {
  if (category === 'study' || category === 'research') return '/images/map-pin-blue.png';
  if (category === 'family') return '/images/map-pin-rose.png';
  return '/images/map-pin.png';
}

Page({
  data: {
    loading: true,
    memories: [],
    locatedMemories: [],
    date: '',
    dateLabel: '全部日期',
    latitude: 36.0671,
    longitude: 120.3826,
    markers: [],
    points: [],
    polyline: [],
    routeKm: 0,
    currentLocation: null,
    activeMemory: null,
    sourceLabel: '等待真实地点'
  },

  onLoad(options) {
    if (options.date) this.setData({ date: options.date, dateLabel: friendlyDate(options.date) });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await repository.listMemories();
      const memories = res.data || [];
      this.setData({ memories, loading: false });
      this.buildMap();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '地图数据读取失败', icon: 'none' });
    }
  },

  buildMap() {
    const filtered = this.data.memories
      .filter((item) => item.location && Number.isFinite(Number(item.location.latitude)))
      .filter((item) => !this.data.date || item.date === this.data.date)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const markers = filtered.map((item, index) => ({
      id: index + 1,
      latitude: Number(item.location.latitude),
      longitude: Number(item.location.longitude),
      iconPath: markerIcon(item.category),
      width: 34,
      height: 34,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: `${CATEGORIES[item.category]?.emoji || '📍'} ${item.title}`,
        display: 'BYCLICK',
        padding: 8,
        borderRadius: 8,
        bgColor: '#fffaf0',
        color: '#2f2c27',
        fontSize: 12
      }
    }));
    const points = filtered.map((item) => ({ latitude: Number(item.location.latitude), longitude: Number(item.location.longitude) }));
    const center = points[points.length - 1] || this.data.currentLocation || { latitude: 36.0671, longitude: 120.3826 };
    this.markerMemoryIds = filtered.map((item) => item._id);
    this.setData({
      locatedMemories: filtered,
      markers,
      points,
      polyline: points.length > 1 ? [{ points, color: '#3d7a55dd', width: 5, dottedLine: false, arrowLine: true }] : [],
      routeKm: routeDistance(filtered),
      latitude: center.latitude,
      longitude: center.longitude,
      sourceLabel: filtered.length ? `${filtered.length} 个真实记录地点` : '没有真实地点数据'
    });
  },

  onDateChange(event) {
    const date = event.detail.value;
    this.setData({ date, dateLabel: friendlyDate(date) });
    this.buildMap();
  },

  clearDate() {
    this.setData({ date: '', dateLabel: '全部日期', activeMemory: null });
    this.buildMap();
  },

  async locateMe() {
    wx.showLoading({ title: '正在定位' });
    try {
      const point = await wechatData.getCurrentLocation('gcj02');
      this.setData({ currentLocation: point, latitude: point.latitude, longitude: point.longitude });
      this.mapContext?.moveToLocation();
    } catch (error) {
      wx.showModal({ title: '定位失败', content: error.errMsg || error.message || '请检查位置授权', showCancel: false });
    } finally { wx.hideLoading(); }
  },

  onReady() {
    this.mapContext = wx.createMapContext('memoryMap', this);
  },

  onMarkerTap(event) {
    const index = Number(event.detail.markerId) - 1;
    const memory = this.data.locatedMemories[index];
    if (memory) this.setData({ activeMemory: { ...memory, categoryMeta: CATEGORIES[memory.category] || CATEGORIES.life } });
  },

  openActiveMemory() {
    if (!this.data.activeMemory) return;
    wx.navigateTo({ url: `/pages/memory-detail/index?id=${this.data.activeMemory._id}` });
  },

  openActiveLocation() {
    const location = this.data.activeMemory?.location;
    if (!location) return;
    wx.openLocation({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      name: location.name,
      address: location.address,
      scale: 16
    });
  },

  startRecord() { wx.switchTab({ url: '/pages/record/index' }); },
  goBack() { wx.navigateBack(); }
});
