const photos = require('../services/photos')
const { mergePhotos } = require('./core')
const { message } = require('./ui')
module.exports = function feed(personal) {
 return {
  data:{ photos:[], loading:false, error:'', hasMore:true, owner:'', profile:null },
  onLoad(options) { this.owner = options.id || ''; this.mine = personal && !this.owner },
  onShow() { this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if(this.data.hasMore) this.load(false) },
  async load(reset) {
   if (this.data.loading) return
   this.setData({loading:true,error:''})
   try {
    if(this.mine) this.owner = await photos.identity()
    if(personal && !this.owner) throw new Error('未找到作者')
    const offset = reset ? 0 : this.offset || 0
    const rows = await photos.list(this.owner,offset)
    this.offset = offset + rows.length
    const merged = reset ? rows : mergePhotos(this.data.photos,rows)
    this.setData({photos:merged,hasMore:rows.length===20,profile:merged[0] || null})
   } catch(e) { this.setData({error:message(e)}) }
   finally { this.setData({loading:false}) }
  },
  retry() { this.load(true) },
  more() { this.load(false) },
  add() { wx.navigateTo({url:'/pages/add/add'}) },
  minePage() { wx.navigateTo({url:'/pages/homepage/homepage'}) },
  onShareAppMessage() { return {title:'海边相册 · 一起记录日常',path:'/pages/index/index'} }
 }
}
