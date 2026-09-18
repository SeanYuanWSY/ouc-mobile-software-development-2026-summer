const crypto = require('node:crypto');
const { configFromEvent } = require('./config-policy');
const COLLECTION = 'ai_credentials';
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function keyFromEnv(env) {
  const raw = env.AI_VAULT_KEY || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) fail('AI_VAULT_UNAVAILABLE', '账号密钥保存服务尚未配置，可先使用本次会话 Key。');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) fail('AI_VAULT_UNAVAILABLE', '账号密钥保存服务暂不可用。');
  return key;
}
function metadata(row) {
  return row && !row.deleted ? { id: row._id, version: row.version, provider: row.provider, endpoint: row.endpoint,
    model: row.model, visionModel: row.visionModel, updatedAt: row.updatedAt } : null;
}
function aad(row) {
  return Buffer.from(JSON.stringify([1, row.appId, row._openid, row._id, row.version, row.provider, row.endpoint]));
}
function seal(config, row, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(row));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return { nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function unseal(row, key) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'));
    decipher.setAAD(aad(row)); decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    const config = JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    if (config.provider !== row.provider || config.endpoint !== row.endpoint) throw new Error('binding');
    return { ...config, source: 'byok-account' };
  } catch (_) { return fail('AI_VAULT_UNAVAILABLE', '保存的密钥暂不可用，请重新保存。'); }
}
function createVault(db, env = process.env, now = Date.now) {
  function identity(owner, appId) {
    if (!owner || !appId) fail('BAD_REQUEST', '无法确认账号身份。');
    return hash(`ai-vault-v1:${appId}:${owner}`);
  }
  async function rowFor(owner, appId) {
    const id = identity(owner, appId);
    let row = null;
    try { row = (await db.collection(COLLECTION).doc(id).get()).data; }
    catch (error) {
      // A fresh environment has no vault collection yet. Status is safe to read
      // as unconfigured; save still fails closed until the collection is provisioned.
      if (!/COLLECTION|collection.*not exist|不存在/i.test(String(error.code || error.message || ''))) throw error;
    }
    if (row && (row._openid !== owner || row.appId !== appId)) fail('BAD_REQUEST', '无法确认账号身份。');
    return row;
  }
  return {
    async manage(owner, appId, event) {
      const allowed = event.action === 'credential.save' ? ['action', 'config', 'expectedVersion'] : event.action === 'credential.delete' ? ['action', 'expectedVersion'] : ['action'];
      if (!Object.keys(event).every(k => allowed.includes(k))) fail('BAD_REQUEST', '密钥操作参数无效。');
      const id = identity(owner, appId);
      if (event.action === 'credential.status') {
        let configured = true; try { keyFromEnv(env); } catch (_) { configured = false; }
        const row = await rowFor(owner, appId);
        return { configured, credential: metadata(row), version: row?.version || 0 };
      }
      if (!['credential.save', 'credential.delete'].includes(event.action) || !Number.isSafeInteger(event.expectedVersion) || event.expectedVersion < 0) fail('BAD_REQUEST', '请刷新密钥状态后重试。');
      const config = event.action === 'credential.save' ? configFromEvent(event) : null;
      const key = config ? keyFromEnv(env) : null;
      return db.runTransaction(async tx => {
        const ref = tx.collection(COLLECTION).doc(id), previous = (await ref.get()).data;
        if (previous && (previous._openid !== owner || previous.appId !== appId)) fail('BAD_REQUEST', '无法确认账号身份。');
        if ((previous?.version || 0) !== event.expectedVersion) fail('AI_CREDENTIAL_CHANGED', '保存的密钥已更新，请刷新后重试。');
        const row = { _id: id, _openid: owner, appId, version: event.expectedVersion + 1, updatedAt: now(), deleted: !config };
        if (config) {
          Object.assign(row, { provider: config.provider, endpoint: config.endpoint, model: config.model, visionModel: config.visionModel }, seal(config, { ...row, provider: config.provider, endpoint: config.endpoint }, key));
        }
        const { _id, ...data } = row;
        await ref.set({ data });
        return { configured: true, credential: metadata(row), version: row.version };
      });
    },
    async resolve(owner, appId, event) {
      const client = event.config || {};
      if (!Object.hasOwn(client, 'credentialId')) return configFromEvent(event);
      if (!Object.keys(client).every(k => ['credentialId', 'credentialVersion'].includes(k))) fail('BAD_REQUEST', '保存的密钥不能更换接收地址。');
      if (client.credentialId !== identity(owner, appId)) fail('AI_KEY_MISSING', '当前账号没有此密钥。');
      const row = await rowFor(owner, appId);
      if (!row || row.deleted) fail('AI_KEY_MISSING', '请先保存或填写你的 API Key。');
      if (client.credentialVersion !== row.version) fail('AI_CREDENTIAL_CHANGED', '账号密钥已变更，请刷新设置。');
      return unseal(row, keyFromEnv(env));
    }
  };
}
module.exports = { createVault, seal, unseal, metadata };
