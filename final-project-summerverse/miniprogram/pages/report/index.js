const repository = require('../../services/repository');
const { CATEGORY_LIST, CATEGORIES, MOODS, DEFAULT_PROFILE } = require('../../utils/constants');
const { buildSummary, categoryCounts, moodAverage } = require('../../utils/stats');

function findHighlight(memories, getter) {
  return memories.reduce((best, item) => (!best || getter(item) > getter(best) ? item : best), null);
}

Page({
  data: {
    loading: true,
    memories: [],
    goals: [],
    summary: {},
    categoryBars: [],
    happiest: null,
    longest: null,
    completedGoals: [],
    profile: null,
    reportSentence: '',
    radarValues: [0, 0, 0, 0, 0]
  },

  onLoad() { this.load(); },

  async load() {
    try {
      const [memoryRes, goalRes, profileRes] = await Promise.all([repository.listMemories(), repository.listGoals(), repository.getProfile()]);
      const memories = memoryRes.data || [];
      const goals = goalRes.data || [];
      const step = repository.getStepSnapshot();
      const summary = buildSummary(memories, goals, step);
      const counts = categoryCounts(memories);
      const maxCount = Math.max(1, ...Object.values(counts));
      const categoryBars = CATEGORY_LIST.map((item) => ({
        ...item,
        count: counts[item.key],
        percent: Math.round((counts[item.key] / maxCount) * 100)
      }));
      const happiest = findHighlight(memories, (item) => MOODS[item.mood]?.score || 0);
      const longest = findHighlight(memories, (item) => Number(item.durationMinutes) || 0);
      const completedGoals = goals.filter((goal) => Number(goal.current) >= Number(goal.target));
      const dominant = summary.dominantCategory ? CATEGORIES[summary.dominantCategory]?.name : '尚未形成';
      const reportSentence = memories.length
        ? `这个暑假，你已经留下 ${memories.length} 条真实记忆；最常出现的主题是「${dominant}」，心情平均分为 ${summary.moodScore ?? '—'}。`
        : '这份报告还没有使用演示数字；记录第一件真实的事后，数据才会出现。';
      const radarValues = this.buildRadar(memories, goals);
      this.setData({
        memories,
        goals,
        profile: profileRes.data || DEFAULT_PROFILE,
        summary,
        categoryBars,
        happiest,
        longest,
        completedGoals,
        reportSentence,
        radarValues,
        loading: false
      });
      setTimeout(() => this.drawRadar(), 100);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '报告生成失败', icon: 'none' });
    }
  },

  buildRadar(memories, goals) {
    const counts = categoryCounts(memories);
    const total = Math.max(1, memories.length);
    const completed = goals.filter((goal) => Number(goal.current) >= Number(goal.target)).length;
    return [
      Math.min(100, 30 + Math.round(((counts.study + counts.research) / total) * 80)),
      Math.min(100, 25 + memories.length * 2),
      Math.min(100, 30 + Math.round((counts.family / total) * 100)),
      Math.min(100, 35 + completed * 18 + Math.round(moodAverage(memories) * 0.2 || 0)),
      Math.min(100, 30 + Math.round(((counts.explore + counts.health) / total) * 90))
    ];
  },

  drawRadar() {
    const values = this.data.radarValues;
    const ctx = wx.createCanvasContext('radarCanvas', this);
    const width = 600;
    const height = 520;
    const cx = width / 2;
    const cy = 260;
    const radius = 180;
    const labels = ['好奇心', '行动力', '陪伴感', '韧性', '探索欲'];
    const point = (index, ratio = 1) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
      return { x: cx + Math.cos(angle) * radius * ratio, y: cy + Math.sin(angle) * radius * ratio };
    };
    ctx.setStrokeStyle('rgba(72,93,67,.20)');
    ctx.setLineWidth(2);
    for (let level = 1; level <= 4; level += 1) {
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const p = point(i, level / 4);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setStrokeStyle('rgba(72,93,67,.15)');
    for (let i = 0; i < 5; i += 1) {
      const p = point(i, 1);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.beginPath();
    values.forEach((value, i) => {
      const p = point(i, value / 100);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.setFillStyle('rgba(79,139,92,.28)');
    ctx.setStrokeStyle('#3d7a55');
    ctx.setLineWidth(5);
    ctx.fill(); ctx.stroke();
    ctx.setFillStyle('#4f4a43');
    ctx.setFontSize(24);
    labels.forEach((label, i) => {
      const p = point(i, 1.18);
      ctx.setTextAlign(p.x < cx - 10 ? 'right' : p.x > cx + 10 ? 'left' : 'center');
      ctx.fillText(label, p.x, p.y);
    });
    ctx.draw();
  },

  copySummary() {
    wx.setClipboardData({ data: this.data.reportSentence });
  },

  startRecord() { wx.switchTab({ url: '/pages/record/index' }); },
  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { title: this.data.reportSentence || '我的 SummerVerse 成长报告', path: '/pages/report/index' };
  }
});
