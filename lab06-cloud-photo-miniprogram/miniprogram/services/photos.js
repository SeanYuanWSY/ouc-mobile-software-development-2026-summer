const config = require('../config')
const { cleanText, validateImage, stamp } = require('../utils/core')
let identityPromise
function ready() {
 if (!getApp().globalData.cloudReady) throw new Error('尚未连接云空间，请先配置本实验云环境')
}
function collection() { ready(); return wx.cloud.database().collection(config.collection) }
async function identity() {
 ready()
 if (!identityPromise) identityPromise = wx.cloud.callFunction({ name: config.loginFunction }).then(({ result }) => {
  if (!result || typeof result.openid !== 'string' || !result.openid) throw new Error('微信身份获取失败')
  return result.openid
 }).catch(err => { identityPromise = null; throw err })
 return identityPromise
}
function pendingKey(openid) { return 'lab06.pending.' + config.envId + '.' + openid }
async function pending() { return wx.getStorageSync(pendingKey(await identity())) || null }
async function list(owner, offset = 0) {
 let query = collection()
 if (owner) query = query.where({ _openid: owner })
 const { data } = await query.orderBy('createdAt','desc').orderBy('_id','desc').skip(offset).limit(20).get()
 return hydrate(data.map(p => Object.assign({},p,{ initial: (p.nickName || "摄").slice(0,1), dateLabel: stamp(p.createdAt) })))
}
async function detail(id) {
 if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('图片链接无效')
 const { data } = await collection().doc(id).get()
 if (!data || !data.photoUrl) throw new Error('图片不存在或已被移除')
 return (await hydrate([Object.assign({},data,{initial:(data.nickName || "摄").slice(0,1),dateLabel:stamp(data.createdAt)})]))[0]
}
async function hydrate(rows) {
 if (!rows.length) return rows
 const {result} = await wx.cloud.callFunction({name:config.accessFunction,data:{ids:rows.map(p=>p._id)}})
 if (!result || !Array.isArray(result.photos)) throw new Error('图片访问服务暂不可用')
 const links = new Map(result.photos.map(p=>[p._id,p.displayUrl]))
 return rows.map(p=>Object.assign({},p,{displayUrl:links.get(p._id)||'',imageError:!links.has(p._id)}))
}
async function commit(record, openid) {
 try { await collection().add({ data: Object.assign({}, record, {createdAt:wx.cloud.database().serverDate()}) }) }
 catch (err) {
  // A timeout can occur after a successful write. Confirm the stable ID before retrying.
  let existing
  try { existing = (await collection().doc(record._id).get()).data } catch (_) { /* Keep pending work when confirmation is unavailable. */ }
  if (!existing || existing._openid !== openid || existing.photoUrl !== record.photoUrl) throw new Error('发布结果尚未确认，请点击“重试发布”；不要重复上传')
 }
 wx.removeStorageSync(pendingKey(openid))
 return record._id
}
async function retry() {
 const openid = await identity(); const record = await pending()
 if (!record) throw new Error('没有待重试的作品')
 return commit(record, openid)
}
async function publish(file, input) {
 validateImage(file)
 const nickName = cleanText(input.nickName,24,true), title = cleanText(input.title,60,true)
 const location = cleanText(input.location,40,false)
 const openid = await identity()
 if (await pending()) throw new Error('请先重试上一次发布')
 const id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,12)
 const extension = /\.(png|jpe?g|webp|gif)$/i.exec(file.tempFilePath)
 const ext = extension ? extension[1].toLowerCase() : 'jpg'
 const { fileID } = await wx.cloud.uploadFile({ cloudPath: 'lab06/photos/' + openid + '/' + id + '.' + ext, filePath: file.tempFilePath })
 if (!fileID || !fileID.startsWith('cloud://')) throw new Error('云存储没有返回有效图片地址')
 const record = { _id:id, photoUrl:fileID, nickName, title, location }
 // Preserve only this upload before writing the database. Never delete on an ambiguous timeout.
 try { wx.setStorageSync(pendingKey(openid), record) }
 catch (_) { throw new Error('图片已上传，但本机无法保存重试记录；请在云存储 lab06/photos 中核对，尚未发布') }
 return commit(record, openid)
}
module.exports = { identity, list, detail, publish, retry, pending }
