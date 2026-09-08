const cloud = require('wx-server-sdk')
const {idsOf,allowed} = require('./policy')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
exports.main = async event => {
 if(!cloud.getWXContext().OPENID) throw new Error('需要微信身份')
 const ids=idsOf(event && event.ids), db=cloud.database()
 const {data}=await db.collection('lab06_photos').where({_id:db.command.in(ids)}).limit(20).get()
 const records=data.filter(allowed)
 if(!records.length)return {photos:[]}
 const names=new Map(await Promise.all([...new Set(records.map(p=>p._openid))].map(async owner=>{
  const {data}=await db.collection('lab06_photos').where({_openid:owner,deleted:db.command.neq(true)}).orderBy('createdAt','desc').orderBy('_id','desc').limit(1).get()
  return [owner,String(data[0]&&data[0].nickName||'摄影同学').slice(0,24)]
 })))
 const {fileList}=await cloud.getTempFileURL({fileList:records.map(p=>p.photoUrl)})
 const urls=new Map(fileList.filter(f=>f.status===0 && /^https:\/\//.test(f.tempFileURL||'')).map(f=>[f.fileID,f.tempFileURL]))
 return {photos:records.filter(p=>urls.has(p.photoUrl)).map(p=>({_id:p._id,displayUrl:urls.get(p.photoUrl),nickName:names.get(p._openid)}))}
}
