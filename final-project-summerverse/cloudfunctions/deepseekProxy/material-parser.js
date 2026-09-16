const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { LIMITS, bad } = require('./material-policy');
function extractDocument(buffer, kind, options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > LIMITS.fileBytes) bad('文件为空或超过8MB');
  if (!['pdf', 'docx', 'pptx', 'text'].includes(kind)) bad('不支持这种文档');
  return new Promise((resolve, reject) => {
    const worker = new Worker(options.workerPath || path.join(__dirname, 'material-parser-worker.js'), {
      workerData: { buffer, kind }, resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      // Do not pass deployment secrets to the parsing worker.
      env: {}, stdout: true, stderr: true
    });
    worker.stdout.resume(); worker.stderr.resume();
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer);
      worker.terminate().then(() => error ? reject(error) : resolve(result), () => reject(error || new Error('资料读取进程未能正常结束')));
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('资料过于复杂，读取超时；请拆分文件'), { code: 'MATERIAL_INVALID' })), options.timeout || 10000);
    worker.once('message', (message) => message.ok ? finish(null, message.data) : finish(Object.assign(new Error(message.error), { code: 'MATERIAL_INVALID' })));
    worker.once('error', () => finish(Object.assign(new Error('文件读取失败，请检查格式或拆分文件'), { code: 'MATERIAL_INVALID' })));
    worker.once('exit', () => { if (!done) finish(Object.assign(new Error('文件读取中断，请拆分文件'), { code: 'MATERIAL_INVALID' })); });
  });
}
module.exports = { extractDocument };
