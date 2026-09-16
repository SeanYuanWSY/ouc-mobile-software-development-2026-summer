const crypto = require('node:crypto');
const { bad, fileKind } = require('./material-policy');
function validateMaterialFile(openid, fileID, authority = process.env.MATERIAL_STORAGE_AUTHORITY) {
  if (!authority || !/^[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(authority)) {
    throw Object.assign(new Error('资料上传服务尚未配置，请联系开发者；可先粘贴文字分析'), { code: 'MATERIAL_NOT_CONFIGURED' });
  }
  if (typeof fileID !== 'string' || fileID.length > 500) bad('资料文件标识无效');
  const prefix = `cloud://${authority}/summerverse/${crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32)}/material/`;
  if (!fileID.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}\/\d+-[a-z0-9]{5,12}\.(pdf|docx|pptx|txt|md|jpg|jpeg|png|webp)$/.test(fileID.slice(prefix.length))) {
    throw Object.assign(new Error('不能访问不属于你的资料'), { code: 'MEDIA_NOT_OWNED' });
  }
  return { kind: fileKind(fileID), cloudPath: fileID.slice(`cloud://${authority}/`.length) };
}
module.exports = { validateMaterialFile };
