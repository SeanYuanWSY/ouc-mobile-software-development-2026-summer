const repository = require('../../services/repository');
const ai = require('../../services/ai');
const { formatDate, friendlyDate } = require('../../utils/date');

Page({
  data: {
    loading: true,
    memories: [],
    date: '2026-07-15',
    dateLabel: '',
    question: '你现在最担心什么？',
    eligibleMemories: [],
    answer: '',
    calling: false,
    connected: false,
    modeLabel: '本地时间分身',
    monthLabel: '',
    evidenceMemories: [],
    maxDate: formatDate()
  },

  onLoad() {
    const today = formatDate();
    this.setData({ date: today, dateLabel: friendlyDate(today), monthLabel: today.slice(5, 7) });
    this.load();
  },

  async load() {
    try {
      const res = await repository.listMemories();
      this.setData({ memories: res.data || [], loading: false });
      this.updateEligible();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '记忆读取失败', icon: 'none' });
    }
  },

  onDateChange(event) {
    const date = event.detail.value;
    this.setData({ date, dateLabel: friendlyDate(date), answer: '', connected: false });
    this.updateEligible();
  },

  onQuestionInput(event) { this.setData({ question: event.detail.value }); },

  updateEligible() {
    const eligibleMemories = this.data.memories
      .filter((item) => item.date <= this.data.date)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    this.setData({ eligibleMemories, evidenceMemories: eligibleMemories.slice(0, 3) });
  },

  async call() {
    const question = this.data.question.trim();
    if (!question || this.data.calling) return;
    this.setData({ calling: true, answer: '', connected: false, modeLabel: getApp().globalData.cloudReady ? 'DeepSeek 时间分身' : '本地时间分身' });
    try {
      const answer = await ai.timePhone(this.data.date, question, this.data.memories);
      this.setData({ answer: typeof answer === 'string' ? answer : answer.answer || JSON.stringify(answer), connected: true });
    } catch (error) {
      this.setData({ answer: `电话没有接通：${error.message || '未知错误'}`, connected: false });
    } finally { this.setData({ calling: false }); }
  },

  useQuestion(event) { this.setData({ question: event.currentTarget.dataset.question }); },
  goBack() { wx.navigateBack(); }
});
