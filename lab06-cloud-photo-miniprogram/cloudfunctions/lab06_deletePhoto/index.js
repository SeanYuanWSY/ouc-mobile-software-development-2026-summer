const cloud=require('wx-server-sdk')
const {allowed}=require('./policy')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
exports.main=async(event={})=>{
 let removed=false
 try{
  const owner=cloud.getWXContext().OPENID
  if(!owner)return {ok:false,code:'AUTH'}
  const db=cloud.database({throwOnNotFound:false}),collection=db.collection('lab06_photos')
  if(event.action==='pending'){
   const {data}=await collection.where({_openid:owner,deleted:true,fileCleaned:false}).limit(20).get()
   return {ok:true,pending:data.map(p=>({_id:p._id}))}
  }
  if(typeof event.photoId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(event.photoId))return {ok:false,code:'INPUT'}
  const ref=collection.doc(event.photoId)
  const fileID=await db.runTransaction(async tx=>{
   const row=tx.collection('lab06_photos').doc(event.photoId)
   const {data:p}=await row.get()
   if(!p)return null
   if(p._openid!==owner)throw new Error('OWNER')
   const cleanupFileID=p.deleted?p.cleanupFileID:p.photoUrl
   if(!allowed(Object.assign({},p,{photoUrl:cleanupFileID})))throw new Error('PATH')
   if(p.deleted&&p.fileCleaned)return null
   // Freeze this validated file path before any storage operation.
   await row.update({data:{deleted:true,fileCleaned:false,cleanupFileID,title:'',location:''}})
   return cleanupFileID
  })
  removed=true
  if(!fileID)return {ok:true}
  const {fileList}=await cloud.deleteFile({fileList:[fileID]})
  if(!Array.isArray(fileList)||fileList.length!==1||fileList[0].fileID!==fileID||fileList[0].status!==0)return {ok:false,removed:true,code:'CLEANUP'}
  await db.runTransaction(async tx=>{const row=tx.collection('lab06_photos').doc(event.photoId);const {data:p}=await row.get();if(!p||p._openid!==owner||!p.deleted||p.cleanupFileID!==fileID)throw new Error('CLEANUP');await row.update({data:{fileCleaned:true}})})
  return {ok:true}
 }catch(e){return {ok:false,removed,code:['OWNER','PATH'].includes(e.message)?e.message:removed?'CLEANUP':'UNAVAILABLE'}}
}
