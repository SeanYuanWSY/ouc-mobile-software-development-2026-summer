const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');

function endpointError() { return Object.assign(new Error('接口地址不可用，请使用公网 HTTPS 地址（不含 Key 或参数）。'), { code: 'AI_ENDPOINT_INVALID' }); }
function normalizeEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 500 || /[\s\x00-\x1f\x7f\\]/.test(raw)) throw endpointError();
  let url;
  try { url = new URL(raw); } catch (_) { throw endpointError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw endpointError();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname) || !/^\/[A-Za-z0-9._~/-]*$/.test(url.pathname)) throw endpointError();
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.href;
}
function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Use a conservative global-unicast subset. Reject mapped/translated IPv4 and special ranges.
  if (net.isIP(address) === 6) {
    const h = address.toLowerCase();
    const [first, second] = h.split(':').map((part) => parseInt(part || '0', 16));
    return first >= 0x2000 && first <= 0x3fff &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
      first !== 0x2002 && first !== 0x3fff;
  }
  return false;
}
async function resolvePublic(hostname, lookup = dns.lookup) {
  let timer;
  try {
    const records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(endpointError()), 4000); })
    ]);
    if (!records.length || records.some((r) => !isPublicAddress(r.address))) throw endpointError();
    return records;
  } catch (_) { throw endpointError(); }
  finally { clearTimeout(timer); }
}
async function postJson(endpoint, apiKey, body, timeout = 50000, deps = {}) {
  const url = new URL(normalizeEndpoint(endpoint));
  const records = await resolvePublic(url.hostname, deps.lookup);
  const chosen = records.find((r) => r.family === 4) || records[0];
  return new Promise((resolve, reject) => {
    let timer;
    const request = (deps.request || https.request)(url, {
      method: 'POST', agent: false, servername: url.hostname, rejectUnauthorized: true,
      lookup: (_host, opts, callback) => opts && opts.all
        ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
    }, (response) => {
      let size = 0;
      const chunks = [];
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume(); request.destroy(endpointError()); return;
      }
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { request.destroy(new Error('AI response too large')); return; }
        chunks.push(chunk);
      });
      response.on('error', (error) => { clearTimeout(timer); reject(error); });
      response.on('end', () => {
        clearTimeout(timer);
        try { resolve({ status: response.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (_) { reject(new Error('AI response is not JSON')); }
      });
    });
    timer = setTimeout(() => request.destroy(Object.assign(new Error('AI timeout'), { name: 'AbortError' })), timeout);
    request.on('error', (error) => { clearTimeout(timer); reject(error); });
    request.end(JSON.stringify(body));
  });
}
module.exports = { normalizeEndpoint, isPublicAddress, resolvePublic, postJson };
