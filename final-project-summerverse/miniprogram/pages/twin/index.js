const repository = require('../../services/repository');
const ai = require('../../services/ai');
const { TWIN_ASSETS, CATEGORIES, MOODS } = require('../../utils/constants');
const { getTwinStage, categoryCounts, moodAverage } = require('../../utils/stats');
const { formatDate } = require('../../utils/date');

function makeTraits(memories, goals) {
  const counts = categoryCounts(memories);
  const total = Math.max(1, memories.length);
  const completed = goals.filter((goal) => Number(goal.current) >= Number(goal.target)).length;
  return [
    { key: 'curiosity', name: '好奇心', value: Math.min(96, 35 + Math.round(((counts.study + counts.research) / total) * 80)), color: '#6e91c8' },
    { key: 'action', name: '行动力', value: Math.min(95, 28 + memories.length * 2 + completed * 8), color: '#d49a4e' },
    { key: 'company', name: '陪伴感', value: Math.min(95, 30 + Math.round((counts.family / total) * 100)), color: '#d57a75' },
    { key: 'explore', name: '探索欲', value: Math.min(95, 30 + Math.round(((counts.explore + counts.health) / total) * 90)), color: '#55a17f' }
  ];
}

function openingLine(memories, stage) {
  if (!memories.length) return '你好呀，我还在等待第一颗真实记忆。我们可以从今天发生的一件小事开始。';
  const latest = memories[0];
  if (stage === 2) return `我刚刚又翻到了「${latest.title}」。这座花园已经很茂盛了，但我仍然只会把你真正记录过的事情当作记忆。`;
  return `我记得你最近留下了「${latest.title}」。花园又长大了一点，要聊聊这件事吗？`;
}

Page({
  data: {
    loading: true,
    memories: [],
    goals: [],
    stage: 0,
    stageAsset: TWIN_ASSETS[0],
    stageLabel: '初生状态',
    opening: '',
    maturity: 0,
    moodScore: null,
    traits: [],
    chatMessages: [],
    chatInput: '',
    sending: false,
    aiReady: false,
    scrollIntoView: ''
  },

  onLoad() { this.refresh(); },
  onShow() {
    this.getTabBar?.().setSelected(4);
    if (!this.data.loading) this.refresh(false);
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const [memoryRes, goalRes] = await Promise.all([repository.listMemories(), repository.listGoals()]);
      const memories = memoryRes.data || [];
      const goals = goalRes.data || [];
      let chatMessages = repository.getChatHistory();
      if (!chatMessages.length) {
        chatMessages = [{ id: 'welcome', role: 'twin', content: '我是 SummerTwin。我的回答会尽量引用你的真实记忆；没有证据的部分，我会明确说这是推测。' }];
      }
      const stage = getTwinStage(memories.length, chatMessages.filter((item) => item.role === 'user').length);
      const labels = ['初生状态', '成长状态', '成熟状态'];
      this.setData({
        memories,
        goals,
        stage,
        stageAsset: TWIN_ASSETS[stage],
        stageLabel: labels[stage],
        opening: openingLine(memories, stage),
        maturity: Math.min(100, Math.round(memories.length * 1.4 + chatMessages.length * 1.2)),
        moodScore: moodAverage(memories),
        traits: makeTraits(memories, goals),
        chatMessages,
        aiReady: Boolean(getApp().globalData.cloudReady),
        loading: false
      });
    } catch (error) {
      console.error(error);
      this.setData({ loading: false });
      wx.showToast({ title: '花园暂时没有响应', icon: 'none' });
    }
  },

  onChatInput(event) { this.setData({ chatInput: event.detail.value }); },

  async sendChat() {
    const question = this.data.chatInput.trim();
    if (!question || this.data.sending) return;
    const userMessage = { id: `user-${Date.now()}`, role: 'user', content: question };
    const pending = { id: `pending-${Date.now()}`, role: 'twin', content: '我正在翻找与你问题有关的真实记忆…', pending: true };
    const messages = [...this.data.chatMessages, userMessage, pending];
    this.setData({ chatMessages: messages, chatInput: '', sending: true, scrollIntoView: pending.id });
    try {
      const answer = await ai.chat(question, this.data.memories);
      const finalMessages = messages.map((item) => item.id === pending.id
        ? { id: `twin-${Date.now()}`, role: 'twin', content: typeof answer === 'string' ? answer : answer.answer || JSON.stringify(answer) }
        : item);
      this.setData({ chatMessages: finalMessages, sending: false, scrollIntoView: finalMessages[finalMessages.length - 1].id });
      repository.saveChatHistory(finalMessages);
    } catch (error) {
      const finalMessages = messages.map((item) => item.id === pending.id
        ? { id: `twin-${Date.now()}`, role: 'twin', content: `这次没有连接成功：${error.message || '未知错误'}。你的真实记忆没有丢失。` }
        : item);
      this.setData({ chatMessages: finalMessages, sending: false });
      repository.saveChatHistory(finalMessages);
    }
  },

  askQuick(event) {
    this.setData({ chatInput: event.currentTarget.dataset.question });
    this.sendChat();
  },

  openTimePhone() { wx.navigateTo({ url: '/pages/time-phone/index' }); },
  openParallel() { wx.navigateTo({ url: '/pages/parallel/index' }); },
  openDirector() { wx.navigateTo({ url: '/pages/director/index' }); },
  openReport() { wx.navigateTo({ url: '/pages/report/index' }); },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }); },
  startRecord() { wx.switchTab({ url: '/pages/record/index' }); },

  onShareAppMessage() {
    return { title: '我的 SummerTwin 正住在一座由真实记忆长出的花园里', path: '/pages/twin/index' };
  }
});
