// Local ingress policy only. A verified CloudBase transport must be injected before deployment.
const encoder = new TextEncoder();
const actions = new Set(['recent.read', 'draft.submit', 'draft.status']);
const codes = new Set(['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'LIMIT', 'UNAVAILABLE', 'NOT_FOUND', 'CONFLICT']);
function reply(status, code) {
  return new Response(JSON.stringify({ ok: false, code }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
async function limitedText(stream, maximum, signal) {
  if (!stream) throw new Error('Missing body');
  const reader = stream.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      if (signal.aborted) throw new Error('Aborted');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Too large');
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('Aborted');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}
async function allowed(binding, key) {
  return (await binding.limit({ key }))?.success === true;
}
export function createIngress(forward, { timeoutMs = 18000 } = {}) {
  return async function fetch(request, env = {}) {
    // No fallback to the public CloudBase route, including on deployment misconfiguration.
    if (env.ENABLED !== 'true' || typeof forward !== 'function' ||
        !['ENTRY_LIMIT', 'IP_LIMIT', 'TOKEN_LIMIT'].every(name => typeof env[name]?.limit === 'function')) {
      return reply(503, 'UNAVAILABLE');
    }
    const controller = new AbortController();
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(reply(503, 'UNAVAILABLE')); }, timeoutMs);
    });
    const run = async () => {
      try {
        if (!await allowed(env.ENTRY_LIMIT, 'assistant')) return reply(429, 'LIMIT');
        const url = new URL(request.url);
        if (url.pathname !== '/assistant' || url.search || request.method !== 'POST') return reply(400, 'BAD_REQUEST');
        // Trusted only at a Cloudflare Worker ingress; never substitute a client X-Forwarded-For.
        const ip = request.headers.get('CF-Connecting-IP');
        if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) return reply(400, 'BAD_REQUEST');
        if (!await allowed(env.IP_LIMIT, ip)) return reply(429, 'LIMIT');
        const authorization = request.headers.get('Authorization') || '';
        if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) return reply(401, 'UNAUTHORIZED');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '') ||
            request.headers.has('Content-Encoding')) return reply(400, 'BAD_REQUEST');
        const hash = await crypto.subtle.digest('SHA-256', encoder.encode(authorization.slice(7)));
        const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        if (!await allowed(env.TOKEN_LIMIT, key)) return reply(429, 'LIMIT');
        let payload;
        try { payload = JSON.parse(await limitedText(request.body, 16384, controller.signal)); }
        catch (_) { return reply(400, 'BAD_REQUEST'); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !actions.has(payload.action)) return reply(400, 'BAD_REQUEST');
        const fields = payload.action === 'recent.read' ? ['action'] : payload.action === 'draft.status' ? ['action', 'requestId'] : ['action', 'requestId', 'draft'];
        if (!Object.keys(payload).every(key => fields.includes(key))) return reply(400, 'BAD_REQUEST');
        if (controller.signal.aborted) return reply(503, 'UNAVAILABLE');
        // forward must target one fixed native API and return an unwrapped business Response.
        const response = await forward({ token: authorization.slice(7), payload, signal: controller.signal });
        if (controller.signal.aborted) { response?.body?.cancel().catch(() => {}); return reply(503, 'UNAVAILABLE'); }
        if (!(response instanceof Response)) return reply(503, 'UNAVAILABLE');
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type') || '')) {
          response.body?.cancel().catch(() => {});
          return reply(503, 'UNAVAILABLE');
        }
        const result = JSON.parse(await limitedText(response.body, 262144, controller.signal));
        if (response.status === 200 && result?.ok === true) {
          return new Response(JSON.stringify({ ok: true, data: result.data }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
          });
        }
        if (result?.ok === false && codes.has(result.code) && [400, 401, 403, 404, 409, 429, 503].includes(response.status)) {
          return reply(response.status, result.code);
        }
        return reply(503, 'UNAVAILABLE');
      } catch (_) { return reply(503, 'UNAVAILABLE'); }
    };
    try { return await Promise.race([run(), timeout]); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}
