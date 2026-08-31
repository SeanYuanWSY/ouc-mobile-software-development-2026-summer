const common = require('../../utils/common.js')
const storage = require('../../utils/storage.js')

function decorateNews(item) {
  return Object.assign({}, item, {
    isLiked: storage.isLiked(item.id),
    isFavorite: storage.isFavorite(item.id)
  })
}

Page({
  data: {
    newsList: [],
    currentIndex: 0,
    userProfile: null,
    profileInitial: '',
    topbarStyle: '',
    gestureMessage: '',
    gestureType: ''
  },

  onLoad() {
    this.updateTopbarPosition()
    this.refreshNews()
  },

  onShow() {
    this.refreshNews()
    const userProfile = storage.getLocalProfile()
    this.setData({
      userProfile: userProfile,
      profileInitial: userProfile ? userProfile.nickName.slice(0, 1) : ''
    })
    this.syncTabBar()
  },

  onHide() {
    this.clearFeedbackTimer()
    this.setData({
      gestureMessage: '',
      gestureType: ''
    })
  },

  onUnload() {
    this.clearFeedbackTimer()
  },

  onResize() {
    this.updateTopbarPosition()
  },

  syncTabBar() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 1 })
      }
    }
  },

  updateTopbarPosition() {
    if (!wx.getMenuButtonBoundingClientRect) {
      return
    }

    const menuButtonRect = wx.getMenuButtonBoundingClientRect()
    if (menuButtonRect && menuButtonRect.bottom) {
      this.setData({
        topbarStyle: 'top: ' + (menuButtonRect.bottom + 10) + 'px;'
      })
    }
  },

  refreshNews() {
    this.setData({
      newsList: common.getAllNews().map(decorateNews)
    })
  },

  onSwiperChange(event) {
    this.setData({
      currentIndex: event.detail.current,
      gestureMessage: '',
      gestureType: ''
    })
  },

  showPreviousStory() {
    const count = this.data.newsList.length
    if (!count) {
      return
    }
    this.setData({
      currentIndex: (this.data.currentIndex - 1 + count) % count,
      gestureMessage: '',
      gestureType: ''
    })
  },

  showNextStory() {
    const count = this.data.newsList.length
    if (!count) {
      return
    }
    this.setData({
      currentIndex: (this.data.currentIndex + 1) % count,
      gestureMessage: '',
      gestureType: ''
    })
  },

  onTouchStart(event) {
    const touch = event.touches && event.touches[0]
    if (!touch) {
      return
    }

    this.touchStartPoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    }
  },

  onTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (!touch || !this.touchStartPoint) {
      return
    }

    const deltaX = touch.clientX - this.touchStartPoint.x
    const deltaY = touch.clientY - this.touchStartPoint.y
    const elapsed = Date.now() - this.touchStartPoint.time
    this.touchStartPoint = null

    if (elapsed > 900 || Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return
    }

    const index = Number(event.currentTarget.dataset.index)
    const article = this.data.newsList[index]
    if (!article) {
      return
    }

    if (deltaX > 0) {
      this.favoriteByGesture(article)
    } else {
      this.likeByGesture(article)
    }
  },

  onTouchCancel() {
    this.touchStartPoint = null
  },

  favoriteByGesture(article) {
    if (storage.isFavorite(article.id)) {
      this.showGestureFeedback('已经收藏过啦', 'favorite')
      return
    }

    storage.toggleFavorite(article)
    this.updateArticleState(article.id)
    this.showGestureFeedback(storage.getLocalProfile() ? '右滑收藏成功' : '游客收藏暂存，保存资料时清空', 'favorite')
    this.vibrate()
  },

  likeByGesture(article) {
    if (storage.isLiked(article.id)) {
      this.showGestureFeedback('已经点过赞啦', 'like')
      return
    }

    storage.toggleLike(article.id)
    this.updateArticleState(article.id)
    this.showGestureFeedback(storage.getLocalProfile() ? '左滑点赞成功' : '游客点赞暂存，保存资料时清空', 'like')
    this.vibrate()
  },

  toggleFavorite(event) {
    const article = this.findArticle(event.currentTarget.dataset.id)
    if (!article) {
      return
    }

    const active = storage.toggleFavorite(article)
    this.updateArticleState(article.id)
    const message = active
      ? (storage.getLocalProfile() ? '收藏成功' : '游客收藏暂存，保存资料时清空')
      : '已取消收藏'
    this.showGestureFeedback(message, 'favorite')
    this.vibrate()
  },

  toggleLike(event) {
    const article = this.findArticle(event.currentTarget.dataset.id)
    if (!article) {
      return
    }

    const active = storage.toggleLike(article.id)
    this.updateArticleState(article.id)
    const message = active
      ? (storage.getLocalProfile() ? '点赞成功' : '游客点赞暂存，保存资料时清空')
      : '已取消点赞'
    this.showGestureFeedback(message, 'like')
    this.vibrate()
  },

  findArticle(newsId) {
    return this.data.newsList.find(function (item) {
      return item.id === String(newsId)
    })
  },

  updateArticleState(newsId) {
    const nextList = this.data.newsList.map(function (item) {
      return item.id === String(newsId) ? decorateNews(item) : item
    })
    this.setData({
      newsList: nextList
    })
  },

  showGestureFeedback(message, type) {
    this.clearFeedbackTimer()
    this.setData({
      gestureMessage: message,
      gestureType: type
    })
    this.feedbackTimer = setTimeout(() => {
      this.setData({
        gestureMessage: '',
        gestureType: ''
      })
    }, 2500)
  },

  clearFeedbackTimer() {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
      this.feedbackTimer = null
    }
  },

  vibrate() {
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }
  },

  goToDetail(event) {
    const id = event.currentTarget.dataset.id
    if (!id) {
      return
    }

    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id
    })
  },

  handleProfileTap() {
    wx.switchTab({ url: '/pages/my/my' })
  }
})
