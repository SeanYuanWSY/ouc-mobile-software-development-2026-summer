const storage = require('./utils/storage.js')
const common = require('./utils/common.js')

function retryPendingAvatarCleanup() {
  if (!wx.getFileSystemManager) {
    return
  }
  const fileSystem = wx.getFileSystemManager()
  if (!fileSystem || typeof fileSystem.unlink !== 'function') {
    return
  }

  storage.getPendingAvatarCleanup().forEach(function (filePath) {
    fileSystem.unlink({
      filePath: filePath,
      success() {
        storage.completeAvatarCleanup(filePath)
      },
      fail(error) {
        const message = error && error.errMsg ? error.errMsg : ''
        if (/no such file|not exist/i.test(message)) {
          storage.completeAvatarCleanup(filePath)
        }
      }
    })
  })
}

App({
  onLaunch() {
    storage.migrateLegacyProfileInteractions(common.getAllNews())
    storage.retryPendingProfileCleanup(common.getAllNews())
    retryPendingAvatarCleanup()
    this.globalData.userProfile = storage.getLocalProfile()
  },

  globalData: {
    userProfile: null
  }
})
