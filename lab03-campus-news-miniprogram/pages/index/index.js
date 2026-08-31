const common = require('../../utils/common.js')
const storage = require('../../utils/storage.js')

function decorateNews(item) {
  return Object.assign({}, item, {
    isLiked: storage.isLiked(item.id),
    isFavorite: storage.isFavorite(item.id)
  })
}

function formatToday() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return month + '月' + day + '日'
}

Page({
  data: {
    today: '',
    userProfile: null,
    profileInitial: '',
    featuredNews: [],
    heroIndex: 0,
    isHeroPaused: false,
    allNews: [],
    filteredNews: [],
    categories: ['全部', '迎新', '校园', '志愿', '学习', '新生'],
    activeCategory: '全部',
    searchKeyword: '',
    favoriteCount: 0,
    likedCount: 0
  },

  onLoad() {
    this.setData({ today: formatToday() })
    this.refreshPage()
  },

  onShow() {
    this.refreshPage()
    this.syncTabBar()
  },

  syncTabBar() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 0 })
      }
    }
  },

  refreshPage() {
    const allNews = common.getNewsList().map(decorateNews)
    const fullNews = common.getAllNews()
    const userProfile = storage.getLocalProfile()
    this.setData({
      userProfile: userProfile,
      profileInitial: userProfile ? userProfile.nickName.slice(0, 1) : '',
      allNews: allNews,
      featuredNews: allNews.slice(0, 3),
      favoriteCount: storage.getFavoriteArticles(fullNews).length,
      likedCount: storage.getLikedArticles(fullNews).length
    })
    this.applyFilter()
  },

  onHeroChange(event) {
    this.setData({ heroIndex: event.detail.current })
  },

  toggleHeroAutoplay() {
    this.setData({ isHeroPaused: !this.data.isHeroPaused })
  },

  applyFilter() {
    const category = this.data.activeCategory
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    const filteredNews = this.data.allNews.filter(function (item) {
      const categoryMatched = category === '全部' || item.category === category
      const keywordMatched = !keyword || (item.title + item.summary).toLowerCase().includes(keyword)
      return categoryMatched && keywordMatched
    })
    this.setData({ filteredNews: filteredNews })
  },

  onSearchInput(event) {
    this.setData({ searchKeyword: event.detail.value })
    this.applyFilter()
  },

  chooseCategory(event) {
    this.setData({
      activeCategory: event.currentTarget.dataset.category
    })
    this.applyFilter()
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

  goToImmersive() {
    wx.switchTab({
      url: '/pages/immersive/immersive'
    })
  },

  toggleLike(event) {
    const id = event.currentTarget.dataset.id
    if (!id) {
      return
    }

    storage.toggleLike(id)
    this.refreshPage()
  },

  handleProfileTap() {
    wx.switchTab({ url: '/pages/my/my' })
  }
})
