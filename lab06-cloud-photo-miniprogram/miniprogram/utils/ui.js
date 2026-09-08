function message(error) {
 const text = error && (error.message || error.errMsg) || '操作失败，请重试'
 if (/cancel/.test(text)) return ''
 if (/permission|auth deny|authorize/.test(text)) return '权限未获允许，请检查相册授权或云空间权限'
 if (/cloud function|FUNCTION_NOT_FOUND/.test(text)) return '云函数尚未部署，请完成云空间配置'
 return text.slice(0,160)
}
function showError(error) { const content = message(error); if(content) wx.showModal({title:'暂时无法完成',content,showCancel:false}) }
// Task-returning wx APIs (for example downloadFile) require callback completion.
function callNative(method, options = {}) {
 return new Promise((resolve, reject) => wx[method](Object.assign({}, options, {success:resolve, fail:reject})))
}
module.exports = { message, showError, callNative }
