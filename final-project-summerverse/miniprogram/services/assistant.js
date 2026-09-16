const { callFunction, invalidateReads } = require('./cloud');
async function request(action, values = {}, options = {}) {
  const result = await callFunction('assistantInbox', { action, ...values }, options);
  if (action === 'accept') { invalidateReads('memories'); invalidateReads('goals'); }
  if (!result.data || typeof result.data !== 'object') throw Object.assign(new Error('助手服务没有返回有效回执，请刷新核对'), { outcomeUnknown: true });
  return result.data;
}
module.exports = { request };
