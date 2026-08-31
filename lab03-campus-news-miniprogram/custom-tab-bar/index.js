Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        icon: '⌂'
      },
      {
        pagePath: '/pages/immersive/immersive',
        text: '沉浸',
        icon: '◈'
      },
      {
        pagePath: '/pages/my/my',
        text: '我的',
        icon: '◉'
      }
    ]
  },

  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item || index === this.data.selected) {
        return
      }

      wx.switchTab({
        url: item.pagePath
      })
    }
  }
})
