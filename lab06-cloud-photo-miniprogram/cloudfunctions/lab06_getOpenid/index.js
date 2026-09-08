const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
exports.main = async () => {
 const openid = cloud.getWXContext().OPENID
 if (!openid) throw new Error('无法确认微信身份')
 return { openid }
}
