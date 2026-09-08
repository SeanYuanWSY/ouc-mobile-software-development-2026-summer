const PREFIX = 'cloud://cloudbase-d5gdro8i30f1a4efd.636c-cloudbase-d5gdro8i30f1a4efd-1481960851/lab06/photos/'
function idsOf(value) {
 if (!Array.isArray(value) || !value.length || value.length > 20 || value.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))) throw new Error('无效的图片请求')
 return [...new Set(value)]
}
function allowed(record) {
 if (!record || record.deleted === true || typeof record._id !== 'string' || typeof record._openid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(record._id) || !/^[A-Za-z0-9_-]{1,128}$/.test(record._openid)) return false
 const base = PREFIX + record._openid + '/' + record._id
 return ['jpg','jpeg','png','webp','gif'].some(ext=>record.photoUrl === base + '.' + ext)
}
module.exports = {idsOf,allowed}
