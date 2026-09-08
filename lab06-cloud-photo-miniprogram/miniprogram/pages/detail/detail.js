const photos=require('../../services/photos')
const { message,showError,callNative }=require('../../utils/ui')
Page({
 data:{photo:null,error:'',loading:true,saving:false},
 onLoad(options){this.id=options.id;this.load()},
 async load(){this.setData({loading:true,error:''});try{this.setData({photo:await photos.detail(this.id)})}catch(e){this.setData({error:message(e)})}finally{this.setData({loading:false})}},
 async preview(){if(!this.data.photo || !this.data.photo.displayUrl)return;try{await callNative('previewImage',{current:this.data.photo.displayUrl,urls:[this.data.photo.displayUrl]})}catch(e){showError(e)}},
 async download(){
  if(!this.data.photo||this.data.saving)return
  this.setData({saving:true})
  try{const result=await callNative('downloadFile',{url:this.data.photo.displayUrl});if(result.statusCode!==200)throw new Error('图片下载失败，请刷新后重试');await callNative('saveImageToPhotosAlbum',{filePath:result.tempFilePath});wx.showToast({title:'已保存到相册'})}
  catch(e){
   if(/auth deny|authorize|denied/.test(e.errMsg||'')){
    try{const r=await callNative('showModal',{title:'需要相册权限',content:'请在设置中允许保存到相册，再重新下载。',confirmText:'打开设置'});if(r.confirm)await callNative('openSetting',{})}
    catch(settingsError){showError(settingsError)}
   }else showError(e)
  }
  finally{this.setData({saving:false})}
 },
 home(){wx.reLaunch({url:'/pages/index/index'})},
 onShareAppMessage(){const p=this.data.photo;return p?{title:p.title,path:'/pages/detail/detail?id='+encodeURIComponent(p._id)}:{title:'海边相册',path:'/pages/index/index'}}
})
