const cloud = require('wx-server-sdk');
const { createGateway } = require('./service');
const { requireValue, failure } = require('./policy');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const run = createGateway(cloud.database({ throwOnNotFound: false }));
exports.main = async (event = {}) => {
  let result;
  try {
    requireValue(event.httpMethod === 'POST');
    requireValue(!event.isBase64Encoded && typeof event.body === 'string' && Buffer.byteLength(event.body) <= 16384);
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    requireValue(typeof headers['content-type'] === 'string' && /^application\/json(?:;|$)/i.test(headers['content-type']));
    requireValue(typeof headers.authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(headers.authorization), 'UNAUTHORIZED');
    result = await run(headers.authorization.slice(7), JSON.parse(event.body));
  } catch (e) { result = failure(e instanceof SyntaxError ? { code: 'BAD_REQUEST' } : e); }
  return { statusCode: result.ok ? 200 : result.code === 'UNAUTHORIZED' ? 401 : result.code === 'FORBIDDEN' ? 403 : result.code === 'LIMIT' ? 429 : 400,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(result) };
};
