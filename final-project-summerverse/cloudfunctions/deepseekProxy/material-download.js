const https = require('node:https');
const { resolvePublic } = require('./safe-http');
const { LIMITS, bad } = require('./material-policy');
const { validateMaterialFile } = require('./material-storage-policy');

async function downloadUrl(rawUrl, deps = {}) {
  let url;
  try { url = new URL(rawUrl); } catch (_) { bad('资料下载地址无效'); }
  // Only SDK-issued signed storage URLs. No user URL, redirect or credential forwarding.
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port ||
      !/^[a-z0-9-]+\.(?:tcb\.qcloud\.la|cos\.[a-z0-9-]+\.myqcloud\.com)$/i.test(url.hostname)) bad('资料下载地址不受支持');
  const addresses = await resolvePublic(url.hostname, deps.lookup);
  const chosen = addresses.find((a) => a.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    let settled = false, response, timer, request;
    const finish = (error, data) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { response?.destroy(); request?.destroy(); reject(error); } else resolve(data);
    };
    request = (deps.request || https.request)(url, {
      method: 'GET', agent: false, servername: url.hostname, rejectUnauthorized: true,
      lookup: (_host, options, callback) => options?.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family)
    }, (res) => {
      response = res;
      if (res.statusCode !== 200) return finish(Object.assign(new Error('资料暂时无法下载，请重新导入'), { code: 'MATERIAL_INVALID' }));
      if (Number(res.headers['content-length']) > LIMITS.fileBytes) return finish(Object.assign(new Error('单个文件不能超过8MB'), { code: 'MATERIAL_INVALID' }));
      let bytes = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > LIMITS.fileBytes) return finish(Object.assign(new Error('单个文件不能超过8MB'), { code: 'MATERIAL_INVALID' }));
        chunks.push(chunk);
      });
      res.on('error', () => finish(Object.assign(new Error('资料下载中断，请重试'), { code: 'MATERIAL_INVALID' })));
      res.on('aborted', () => finish(Object.assign(new Error('资料下载中断，请重试'), { code: 'MATERIAL_INVALID' })));
      res.on('end', () => finish(null, Buffer.concat(chunks)));
    });
    timer = setTimeout(() => finish(Object.assign(new Error('资料下载超时，请重试'), { code: 'MATERIAL_INVALID' })), deps.timeout || 12000);
    request.on('error', () => finish(Object.assign(new Error('资料下载失败，请重试'), { code: 'MATERIAL_INVALID' })));
    request.end();
  });
}

async function ownedMaterial(cloud, db, openid, fileID, deps = {}) {
  const meta = validateMaterialFile(openid, fileID);
  const found = await db.collection('media_assets').where({ _openid: openid, fileID }).limit(1).get();
  if (!found.data?.length || found.data[0].status !== 'ready' || found.data[0].cloudPath !== meta.cloudPath) {
    throw Object.assign(new Error('资料未登记或已清理，请重新导入'), { code: 'MEDIA_NOT_OWNED' });
  }
  const signed = await cloud.getTempFileURL({ fileList: [fileID] });
  const item = signed.fileList?.find((f) => f.fileID === fileID);
  if (!item || !item.tempFileURL) bad('资料暂时无法下载');
  return { ...meta, buffer: await downloadUrl(item.tempFileURL, deps) };
}
module.exports = { validateMaterialFile, downloadUrl, ownedMaterial };
