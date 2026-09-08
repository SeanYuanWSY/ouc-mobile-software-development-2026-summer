const config = require('./config')
App({
 globalData: { cloudReady: false },
 onLaunch() {
  if (config.envId && wx.cloud) {
   try { wx.cloud.init({ env: config.envId, traceUser: false }); this.globalData.cloudReady = true }
   catch (_) { this.globalData.cloudReady = false }
  }
 }
})
