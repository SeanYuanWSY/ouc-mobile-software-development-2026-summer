const common = require('../../utils/common.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    article: {},
    isFavorite: false,
    isLiked: false,
    readingProgress: 0,
    notFound: false
  },

  onLoad(options) {
    this.articleId = options.id
    const result = common.getNewsDetail(this.articleId)
    const article = result.code === '200' ? result.news : null

    if (!article || !article.id) {
      this.setData({ notFound: true })
      return
    }

    this.setData({
      article: article,
      notFound: false
    })
    this.syncInteractionState()
  },

  onShow() {
    if (this.articleId) {
      this.syncInteractionState()
    }
  },

  onReady() {
    this.measureTimer = setTimeout(() => {
      this.measureArticle()
    }, 80)
  },

  onUnload() {
    if (this.measureTimer) {
      clearTimeout(this.measureTimer)
      this.measureTimer = null
    }
  },

  measureArticle() {
    if (!wx.createSelectorQuery) {
      return
    }

    wx.createSelectorQuery().select('.article-shell').boundingClientRect((rect) => {
      if (!rect) {
        return
      }
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.scrollRange = Math.max(1, rect.height - windowInfo.windowHeight)
    }).exec()
  },

  onPageScroll(event) {
    if (!this.scrollRange) {
      return
    }

    const progress = Math.min(100, Math.max(0, Math.round(event.scrollTop / this.scrollRange * 100)))
    if (Math.abs(progress - this.data.readingProgress) >= 2) {
      this.setData({ readingProgress: progress })
    }
  },

  syncInteractionState() {
    const article = this.data.article
    if (!article.id) {
      return
    }

    this.setData({
      isFavorite: storage.isFavorite(article.id),
      isLiked: storage.isLiked(article.id)
    })
  },

  toggleFavorite() {
    const active = storage.toggleFavorite(this.data.article)
    this.syncInteractionState()
    const activeTitle = storage.getLocalProfile() ? '已加入收藏' : '游客收藏已暂存'
    wx.showToast({
      title: active ? activeTitle : '已取消收藏',
      icon: active ? 'success' : 'none'
    })
  },

  toggleLike() {
    const active = storage.toggleLike(this.data.article.id)
    this.syncInteractionState()
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }
    const activeTitle = storage.getLocalProfile() ? '感谢你的点赞' : '游客点赞已暂存'
    wx.showToast({
      title: active ? activeTitle : '已取消点赞',
      icon: 'none'
    })
  },

  copySourceUrl() {
    const sourceUrl = this.data.article.source_url
    if (!sourceUrl || !wx.setClipboardData) {
      wx.showToast({ title: '原文链接暂不可用', icon: 'none' })
      return
    }

    wx.setClipboardData({ data: sourceUrl })
  },

  onShareAppMessage() {
    const article = this.data.article
    if (!article.id) {
      return {
        title: '海大 NOW',
        path: '/pages/index/index'
      }
    }

    return {
      title: article.title || '海大 NOW',
      path: '/pages/detail/detail?id=' + article.id,
      imageUrl: article.poster || ''
    }
  }
})
