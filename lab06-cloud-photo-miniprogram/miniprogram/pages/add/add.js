const photos = require('../../services/photos')
const { validateImage } = require('../../utils/core')
const { showError, message, callNative } = require('../../utils/ui')
Page({
 data:{ file:null,nickName:'',title:'',location:'',busy:false,pending:false,history:[],error:'',hasMore:false },
 async onLoad() { try { const p=wx.getStorageSync('lab06.profile') || {}; this.setData({nickName:p.nickName||'',location:p.location||''}) } catch(_) {} await this.refresh() },
 async refresh() {
  try { this.owner=await photos.identity(); this.setData({pending:!!(await photos.pending())}); const history=await photos.list(this.owner); this.offset=history.length; this.setData({history,pending:!!(await photos.pending()),error:'',hasMore:history.length===20}) }
  catch(e) { this.setData({error:message(e)}) }
 },
 async more() { if(this.loadingHistory) return; this.loadingHistory=true; try { const rows=await photos.list(this.owner,this.offset); this.offset+=rows.length; this.setData({history:require('../../utils/core').mergePhotos(this.data.history,rows),hasMore:rows.length===20}) }catch(e){showError(e)}finally{this.loadingHistory=false} },
 input(e) { const key=e.currentTarget.dataset.field; if(['nickName','title','location'].includes(key)) this.setData({[key]:e.detail.value}) },
 async choose() {
  try { const result=await callNative('chooseMedia',{count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed']}); this.setData({file:validateImage(result.tempFiles[0])}) }
  catch(e) { showError(e) }
 },
 async publish() {
  if(this.data.busy) return
  this.setData({busy:true})
  try {
   const id=this.data.pending ? await photos.retry() : await photos.publish(this.data.file,this.data)
   try{ wx.setStorageSync('lab06.profile',{nickName:this.data.nickName,location:this.data.location}) }catch(_){}
   this.setData({file:null,title:'',pending:false})
   wx.showToast({title:'发布成功'})
   await this.refresh()
   wx.navigateTo({url:'/pages/detail/detail?id='+encodeURIComponent(id)})
  } catch(e) { showError(e); try{this.setData({pending:!!(await photos.pending())})}catch(_){} }
  finally { this.setData({busy:false}) }
 }
})
