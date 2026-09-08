const photos=require('../../services/photos')
const { message,showError }=require('../../utils/ui')
Page({
 data:{photo:null,error:'',loading:true,saving:false},
 onLoad(options){this.id=options.id;this.load()},
 async load(){this.setData({loading:true,error:''});try{this.setData({photo:await photos.detail(this.id)})}catch(e){this.setData({error:message(e)})}finally{this.setData({loading:false})}},
 async preview(){if(!this.data.photo)return;try{await wx.previewImage({current:this.data.photo.photoUrl,urls:[this.data.photo.photoUrl]})}catch(e){showError(e)}},
 async download(){
  if(!this.data.photo||this.data.saving)return
  this.setData({saving:true})
  try{const result=await wx.cloud.downloadFile({fileID:this.data.photo.photoUrl});await wx.saveImageToPhotosAlbum({filePath:result.tempFilePath});wx.showToast({title:'已保存到相册'})}
  catch(e){if(/auth deny|authorize|denied/.test(e.errMsg||'')){const r=await wx.showModal({title:'需要相册权限',content:'请在设置中允许保存到相册，再重新下载。',confirmText:'打开设置'});if(r.confirm)wx.openSetting({})}else showError(e)}
  finally{this.setData({saving:false})}
 },
 home(){wx.reLaunch({url:'/pages/index/index'})},
 onShareAppMessage(){const p=this.data.photo;return p?{title:p.title,path:'/pages/detail/detail?id='+encodeURIComponent(p._id)}:{title:'海边相册',path:'/pages/index/index'}}
})
