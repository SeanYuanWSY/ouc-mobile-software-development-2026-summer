Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/island/index', text: '宇宙', icon: '🏝️' },
      { pagePath: '/pages/timeline/index', text: '轨迹', icon: '🧭' },
      { pagePath: '/pages/record/index', text: '记录', icon: '＋', primary: true },
      { pagePath: '/pages/growth/index', text: '成长', icon: '🌱' },
      { pagePath: '/pages/twin/index', text: '我的', icon: '🌿' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      wx.switchTab({ url: item.pagePath });
    },
    setSelected(index) { this.setData({ selected: index }); }
  }
});
