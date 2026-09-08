function cleanText(value, limit, required) {
 const text = typeof value === 'string' ? value.trim() : ''
 if (required && !text) throw new Error('请填写昵称和图片标题')
 if (text.length > limit) throw new Error('输入内容过长')
 return text
}
function validateImage(file) {
 if (!file || !file.tempFilePath || !Number.isFinite(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的图片')
 return file
}
function stamp(value) {
 const date = new Date(value)
 if (isNaN(date.getTime())) return ''
 return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('.')
}
function mergePhotos(old, next) {
 const seen = new Set(old.map(x => x._id))
 return old.concat(next.filter(x => !seen.has(x._id) && seen.add(x._id)))
}
module.exports = { cleanText, validateImage, stamp, mergePhotos }
