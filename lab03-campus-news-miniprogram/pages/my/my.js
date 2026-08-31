const common = require('../../utils/common.js')
const storage = require('../../utils/storage.js')

Page({
  data: {
    userProfile: null,
    profileInitial: '',
    hasProfile: false,
    favoriteList: [],
    likedList: [],
    displayList: [],
    favoriteCount: 0,
    likedCount: 0,
    activeMode: 'favorite',
    draftAvatarUrl: '',
    draftNickName: '',
    isSavingProfile: false,
    isLoggingOut: false
  },

  onShow() {
    this.refreshPage()
    this.syncTabBar()
  },

  syncTabBar() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 2 })
      }
    }
  },

  refreshPage() {
    const allNews = common.getAllNews()
    const userProfile = storage.getLocalProfile()
    const hasProfile = Boolean(userProfile)
    const favoriteList = storage.getFavoriteArticles(allNews)
    const likedList = storage.getLikedArticles(allNews)
    const displayList = this.data.activeMode === 'favorite' ? favoriteList : likedList

    this.setData({
      userProfile: userProfile,
      profileInitial: userProfile ? userProfile.nickName.slice(0, 1) : '',
      hasProfile: hasProfile,
      favoriteList: favoriteList,
      likedList: likedList,
      displayList: displayList,
      favoriteCount: favoriteList.length,
      likedCount: likedList.length
    })
  },

  onChooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl
    if (avatarUrl) {
      this.setData({ draftAvatarUrl: avatarUrl })
    }
  },

  onNicknameInput(event) {
    this.setData({ draftNickName: event.detail.value })
  },

  completeProfile(event) {
    const formValue = event && event.detail && event.detail.value
    const submittedNickName = formValue && typeof formValue.nickname === 'string' ? formValue.nickname : this.data.draftNickName
    const nickName = submittedNickName.trim()
    const avatarUrl = this.data.draftAvatarUrl
    if (!avatarUrl) {
      wx.showToast({ title: '请先选择头像', icon: 'none' })
      return
    }
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (this.data.isSavingProfile) {
      return
    }

    this.setData({ isSavingProfile: true })
    this.persistAvatar(avatarUrl, (savedAvatarUrl) => {
      const userProfile = storage.createLocalProfile({
        nickName: nickName,
        avatarUrl: savedAvatarUrl
      }, common.getAllNews())
      if (!userProfile) {
        this.removeSavedAvatar(savedAvatarUrl)
        this.setData({ isSavingProfile: false })
        wx.showToast({ title: '资料初始化失败，请重试', icon: 'none' })
        return
      }
      getApp().globalData.userProfile = userProfile
      this.setData({
        draftAvatarUrl: '',
        draftNickName: '',
        isSavingProfile: false
      })
      this.refreshPage()
      wx.showToast({ title: '资料已保存', icon: 'success' })
    }, () => {
      this.setData({ isSavingProfile: false })
      wx.showToast({ title: '头像保存失败，请重试', icon: 'none' })
    })
  },

  persistAvatar(tempFilePath, successCallback, failCallback) {
    if (!wx.getFileSystemManager) {
      failCallback()
      return
    }

    const fileSystem = wx.getFileSystemManager()
    if (!fileSystem || typeof fileSystem.saveFile !== 'function') {
      failCallback()
      return
    }

    fileSystem.saveFile({
      tempFilePath: tempFilePath,
      success(result) {
        if (result.savedFilePath) {
          successCallback(result.savedFilePath)
        } else {
          failCallback()
        }
      },
      fail() {
        failCallback()
      }
    })
  },

  removeSavedAvatar(savedAvatarUrl, callback) {
    const finish = typeof callback === 'function' ? callback : function () {}
    if (!savedAvatarUrl || !/^(wxfile|http):\/\/usr\//.test(savedAvatarUrl)) {
      finish(true, false)
      return
    }
    const cleanupQueued = storage.queueAvatarCleanup(savedAvatarUrl)
    if (!wx.getFileSystemManager) {
      finish(false, cleanupQueued)
      return
    }
    const fileSystem = wx.getFileSystemManager()
    if (!fileSystem || typeof fileSystem.unlink !== 'function') {
      finish(false, cleanupQueued)
      return
    }
    fileSystem.unlink({
      filePath: savedAvatarUrl,
      success() {
        storage.completeAvatarCleanup(savedAvatarUrl)
        finish(true, cleanupQueued)
      },
      fail(error) {
        const message = error && error.errMsg ? error.errMsg : ''
        if (/no such file|not exist/i.test(message)) {
          storage.completeAvatarCleanup(savedAvatarUrl)
          finish(true, cleanupQueued)
          return
        }
        finish(false, cleanupQueued)
      }
    })
  },

  requestLogout() {
    if (this.data.isLoggingOut) {
      return
    }
    wx.showModal({
      title: '退出本机资料？',
      content: '退出后将移除本机资料，并清空该资料的收藏与点赞。游客记录不会并入下次资料。',
      confirmText: '退出',
      confirmColor: '#b4233b',
      success: (result) => {
        if (result.confirm) {
          this.logoutProfile()
        }
      }
    })
  },

  logoutProfile() {
    this.setData({ isLoggingOut: true })
    const result = storage.logoutLocalProfile(common.getAllNews())
    if (!result.success) {
      this.setData({ isLoggingOut: false })
      wx.showToast({ title: '退出失败，请重试', icon: 'none' })
      return
    }

    const dataCleanupComplete = result.cleanupComplete !== false
    if (result.profile) {
      this.removeSavedAvatar(result.profile.avatarUrl, (avatarCleaned, cleanupQueued) => {
        let message = '已退出本机资料'
        if (!dataCleanupComplete) {
          message = '已退出，残留数据将在下次启动清理'
        } else if (!avatarCleaned) {
          message = cleanupQueued ? '已退出，头像将在下次启动重试清理' : '已退出，但头像文件清理失败'
        }
        this.finishLogout(message)
      })
      return
    }

    this.finishLogout('已退出本机资料')
  },

  finishLogout(message) {
    getApp().globalData.userProfile = null
    this.setData({
      activeMode: 'favorite',
      draftAvatarUrl: '',
      draftNickName: '',
      isLoggingOut: false
    })
    this.refreshPage()
    wx.showToast({ title: message, icon: 'none', duration: message.length > 8 ? 2600 : 1500 })
  },

  focusProfileEditor() {
    if (wx.pageScrollTo) {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 })
    }
  },

  switchMode(event) {
    const activeMode = event.currentTarget.dataset.mode
    this.setData({
      activeMode: activeMode,
      displayList: activeMode === 'favorite' ? this.data.favoriteList : this.data.likedList
    })
  },

  removeInteraction(event) {
    const id = event.currentTarget.dataset.id
    if (!id) {
      return
    }

    const mode = event.currentTarget.dataset.mode
    if (mode !== 'favorite' && mode !== 'liked') {
      return
    }

    const isFavoriteMode = mode === 'favorite'
    const removed = isFavoriteMode ? storage.removeFavorite(id) : storage.removeLike(id)
    this.refreshPage()
    wx.showToast({
      title: removed ? (isFavoriteMode ? '已取消收藏' : '已取消点赞') : '记录已更新',
      icon: 'none'
    })
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
  }
})
