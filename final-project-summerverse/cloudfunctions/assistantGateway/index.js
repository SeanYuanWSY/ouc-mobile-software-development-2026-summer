const cloud = require('wx-server-sdk');
const { createGateway } = require('./service');
const { requireValue, failure } = require('./policy');
const { createMcpHandler, sessionFor } = require('./mcp');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const run = createGateway(cloud.database({ throwOnNotFound: false }));
const mcp = createMcpHandler(run);
exports.main = async (event = {}) => {
  let result;
  try {
    requireValue(event.httpMethod === 'POST');
    requireValue(!event.isBase64Encoded && typeof event.body === 'string' && Buffer.byteLength(event.body) <= 16384);
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    requireValue(typeof headers['content-type'] === 'string' && /^application\/json(?:;|$)/i.test(headers['content-type']));
    requireValue(typeof headers.authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(headers.authorization), 'UNAUTHORIZED');
    const token = headers.authorization.slice(7);
    const input = JSON.parse(event.body);
    result = input && input.jsonrpc === '2.0' ? { ok: true, mcp: true, body: await mcp(token, input) } : await run(token, input);
  } catch (e) { result = failure(e instanceof SyntaxError ? { code: 'BAD_REQUEST' } : e); }
  const statusCode = result.mcp ? 200 : result.ok ? 200 : result.code === 'UNAUTHORIZED' ? 401 : result.code === 'FORBIDDEN' ? 403 : result.code === 'LIMIT' ? 429 : 400;
  return { statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(result.mcp ? { 'Mcp-Session-Id': sessionFor(headers.authorization.slice(7)) } : {}) }, body: JSON.stringify(result.mcp ? result.body : result) };
};
