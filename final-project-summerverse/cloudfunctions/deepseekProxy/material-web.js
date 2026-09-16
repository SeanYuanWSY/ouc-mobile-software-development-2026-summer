const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const { isPublicAddress } = require('./safe-http');

const URL_MAX = 1500;
const BODY_MAX = 1024 * 1024;
const TEXT_MAX = 40000;
const REDIRECT_MAX = 3;
const TOTAL_TIMEOUT = 10000;
const SENSITIVE_QUERY_NAMES = new Set(['access_token', 'token', 'auth', 'authorization', 'api_key', 'apikey', 'key', 'password', 'passwd', 'secret', 'session', 'sessionid', 'cookie', 'signature', 'sig', 'x-amz-signature', 'x-amz-security-token', 'x-goog-signature', 'key-pair-id', 'policy']);

function webError(code, message) { return Object.assign(new Error(message), { code }); }

function validateWebUrl(raw, previousProtocol = '') {
  if (typeof raw !== 'string' || !raw || raw.length > URL_MAX || /[\s\x00-\x1f\x7f\\]/.test(raw)) throw webError('WEB_INVALID', '请使用不含空格的完整公开网页地址');
  let url;
  try { url = new URL(raw); } catch (_) { throw webError('WEB_INVALID', '网页地址格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw webError('WEB_INVALID', '请使用标准端口的公网网页地址');
  if (previousProtocol === 'https:' && url.protocol !== 'https:') throw webError('WEB_INVALID', '安全网页不能跳转到非加密地址');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname)) throw webError('WEB_INVALID', '请使用公网网站域名');
  for (const name of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_NAMES.has(name.toLowerCase())) throw webError('WEB_INVALID', '链接含登录或密钥参数，请改用不含敏感参数的公开地址');
  }
  url.hash = '';
  return url;
}

function remaining(deadline) {
  const value = deadline - Date.now();
  if (value <= 0) throw webError('WEB_UNAVAILABLE', '网页读取超时，请稍后再试');
  return value;
}

async function resolvePublic(hostname, deadline, lookup = dns.lookup) {
  let timer;
  try {
    const records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(webError('WEB_UNAVAILABLE', '网页域名解析超时')), remaining(deadline)); })
    ]);
    if (!Array.isArray(records) || !records.length || records.some((record) => !isPublicAddress(record.address))) throw webError('WEB_INVALID', '网页地址没有指向可访问的公网服务');
    return records;
  } catch (error) {
    if (error.code && error.code.startsWith('WEB_')) throw error;
    throw webError('WEB_UNAVAILABLE', '网页域名暂时无法解析');
  } finally { clearTimeout(timer); }
}

function contentType(headers = {}) {
  const value = String(headers['content-type'] || '').toLowerCase();
  const mime = value.split(';')[0].trim();
  const charset = (value.match(/charset\s*=\s*["']?([^;"'\s]+)/i) || [])[1];
  if (!['text/html', 'text/plain'].includes(mime)) throw webError('WEB_UNSUPPORTED', '这个链接不是可读取的网页文字');
  if (charset && !['utf-8', 'utf8'].includes(charset.toLowerCase())) throw webError('WEB_UNSUPPORTED', '网页不是 UTF-8 编码，请复制文字后粘贴');
  return mime;
}

function requestOnce(url, chosen, deadline, deps = {}) {
  const initialTimeout = remaining(deadline);
  return new Promise((resolve, reject) => {
    let settled = false, timer, request;
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
    const transport = deps.request || (url.protocol === 'https:' ? https.request : http.request);
    const options = {
      method: 'GET', agent: false, rejectUnauthorized: true,
      lookup: (_hostname, opts, callback) => opts && opts.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      headers: { Accept: 'text/html, text/plain;q=0.9', 'Accept-Encoding': 'identity', 'User-Agent': 'SummerVerse-MaterialReader/1.0' }
    };
    if (url.protocol === 'https:') options.servername = url.hostname;
    request = transport(url, options, (response) => {
      const stop = (error) => {
        if (response.destroy) response.destroy(error);
        if (request.destroy) request.destroy(error);
      };
      const status = Number(response.statusCode) || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = Array.isArray(response.headers.location) ? '' : response.headers.location;
        if (!location) { const error = webError('WEB_INVALID', '网页跳转地址无效'); stop(error); finish(reject, error); return; }
        stop(); finish(resolve, { redirect: location }); return;
      }
      if ([401, 403].includes(status)) { const error = webError('WEB_AUTH_REQUIRED', '这个网页需要登录或授权，请复制文字或截图导入'); stop(error); finish(reject, error); return; }
      if (status !== 200) { const error = webError('WEB_UNAVAILABLE', '网页暂时无法读取，请稍后再试'); stop(error); finish(reject, error); return; }
      const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      if (encoding !== 'identity') { const error = webError('WEB_UNSUPPORTED', '网页使用了暂不支持的压缩格式'); stop(error); finish(reject, error); return; }
      let mime;
      try { mime = contentType(response.headers); } catch (error) { stop(error); finish(reject, error); return; }
      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && (declared < 0 || declared > BODY_MAX)) { const error = webError('WEB_TOO_LARGE', '网页内容超过1MB，请复制需要的部分'); stop(error); finish(reject, error); return; }
      let size = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > BODY_MAX) {
          const error = webError('WEB_TOO_LARGE', '网页内容超过1MB，请复制需要的部分');
          if (response.destroy) response.destroy(error);
          if (request.destroy) request.destroy(error);
          finish(reject, error);
          return;
        }
        chunks.push(buffer);
      });
      response.on('aborted', () => finish(reject, webError('WEB_UNAVAILABLE', '网页连接中断，请重试')));
      response.on('error', () => finish(reject, webError('WEB_UNAVAILABLE', '网页读取失败，请重试')));
      response.on('end', () => finish(resolve, { mime, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', (error) => finish(reject, error.code && error.code.startsWith('WEB_') ? error : webError('WEB_UNAVAILABLE', '网页连接失败，请稍后再试')));
    const timeout = Math.min(initialTimeout, deadline - Date.now());
    if (timeout <= 0) {
      const error = webError('WEB_UNAVAILABLE', '网页读取超时，请稍后再试');
      if (request.destroy) request.destroy(error);
      finish(reject, error);
      return;
    }
    timer = setTimeout(() => {
      const error = webError('WEB_UNAVAILABLE', '网页读取超时，请稍后再试');
      if (request.destroy) request.destroy(error);
      finish(reject, error);
    }, timeout);
    request.end();
  });
}

async function fetchPublicPage(raw, deps = {}) {
  const deadline = Date.now() + (deps.timeout || TOTAL_TIMEOUT);
  let url = validateWebUrl(raw);
  const visited = new Set();
  for (let redirects = 0; redirects <= REDIRECT_MAX; redirects += 1) {
    const key = url.href;
    if (visited.has(key)) throw webError('WEB_UNAVAILABLE', '网页发生循环跳转');
    visited.add(key);
    const records = await resolvePublic(url.hostname, deadline, deps.lookup);
    const chosen = records.find((record) => record.family === 4) || records[0];
    const result = await requestOnce(url, chosen, deadline, deps);
    if (!result.redirect) return { ...result, domain: url.hostname };
    if (redirects === REDIRECT_MAX) throw webError('WEB_UNAVAILABLE', '网页跳转次数过多');
    let next;
    try { next = new URL(result.redirect, url); } catch (_) { throw webError('WEB_INVALID', '网页跳转地址无效'); }
    url = validateWebUrl(next.href, url.protocol);
  }
  throw webError('WEB_UNAVAILABLE', '网页跳转次数过多');
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi, (all, decimal, hex, name) => {
    if (name) return named[name.toLowerCase()] ?? all;
    const code = parseInt(decimal || hex, decimal ? 10 : 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

function titleFromHtml(html) {
  const lower = html.toLowerCase();
  const start = lower.indexOf('<title');
  if (start < 0) return '';
  const open = lower.indexOf('>', start);
  const close = open >= 0 ? lower.indexOf('</title', open + 1) : -1;
  if (open < 0 || close < 0 || close - open > 1000) return '';
  return decodeEntities(html.slice(open + 1, close)).replace(/\s+/g, ' ').trim().slice(0, 100);
}

function ensureExtractDeadline(deadline) {
  if (Date.now() > deadline) throw webError('WEB_UNAVAILABLE', '网页读取超时，请稍后再试');
}

function htmlToText(html, deadline = Infinity) {
  const lower = html.toLowerCase();
  const skipTags = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object']);
  const blockTags = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'figcaption', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul']);
  let out = '', cursor = 0;
  while (cursor < html.length) {
    if ((cursor & 4095) === 0) ensureExtractDeadline(deadline);
    const open = html.indexOf('<', cursor);
    if (open < 0) { out += html.slice(cursor); break; }
    out += html.slice(cursor, open);
    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4); cursor = close < 0 ? html.length : close + 3; continue;
    }
    let close = -1, nextOpen = -1;
    const scanEnd = Math.min(html.length, open + 4097);
    for (let i = open + 1; i < scanEnd; i += 1) {
      if (html[i] === '<') { nextOpen = i; break; }
      if (html[i] === '>') { close = i; break; }
    }
    if (close < 0) {
      const end = nextOpen >= 0 ? nextOpen : scanEnd;
      out += html.slice(open, end);
      cursor = end;
      continue;
    }
    const tag = (lower.slice(open + 1, close).match(/^\/?\s*([a-z0-9]+)/) || [])[1] || '';
    if (skipTags.has(tag) && !/^\//.test(lower.slice(open + 1, close).trim())) {
      const endStart = lower.indexOf(`</${tag}`, close + 1);
      if (endStart < 0) { cursor = html.length; continue; }
      const end = html.indexOf('>', endStart + tag.length + 2);
      cursor = end < 0 ? html.length : end + 1; continue;
    }
    if (blockTags.has(tag)) out += '\n';
    cursor = close + 1;
  }
  ensureExtractDeadline(deadline);
  const text = decodeEntities(out).replace(/\r/g, '').split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  ensureExtractDeadline(deadline);
  return text;
}

function extractedSource(page, deadline = Infinity) {
  const title = page.mime === 'text/html' ? titleFromHtml(page.body) : '';
  ensureExtractDeadline(deadline);
  const text = page.mime === 'text/html' ? htmlToText(page.body, deadline) : page.body.replace(/\r/g, '').trim();
  if (text.length > TEXT_MAX) throw webError('WEB_TOO_LARGE', '网页正文超过4万字，请复制需要的部分后导入');
  if (text.length < 220 && /(?:登录|扫码|验证码|sign\s*in|log\s*in)/i.test(text)) throw webError('WEB_AUTH_REQUIRED', '这个网页可能需要登录，请复制文字或截图导入');
  if (!text || text.length < 20) throw webError('WEB_UNAVAILABLE', '网页没有可读取的正文，可能需要登录或依赖脚本显示；请复制文字或截图导入');
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push({ id: `c${chunks.length + 1}`, locator: `网页 · 片段${chunks.length + 1}`, text: text.slice(i, i + 2000) });
  return {
    title: title || page.domain,
    domain: page.domain,
    extraction: 'web-text',
    chunks,
    warnings: ['网页内容是抓取时的纯文字快照，可能缺少登录后、脚本加载或后续更新的内容；请核对原网页']
  };
}

async function extractWebPage(raw, deps = {}) {
  const startedAt = Date.now();
  const timeout = deps.timeout || TOTAL_TIMEOUT;
  const page = await fetchPublicPage(raw, deps);
  const result = extractedSource(page, startedAt + timeout);
  ensureExtractDeadline(startedAt + timeout);
  return result;
}

module.exports = { validateWebUrl, resolvePublic, fetchPublicPage, htmlToText, extractedSource, extractWebPage };
