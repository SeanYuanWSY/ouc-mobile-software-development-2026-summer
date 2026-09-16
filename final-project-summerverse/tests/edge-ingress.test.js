const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../integrations/cloudflare/ingress.mjs');
const token = 'a'.repeat(64); // Synthetic fixture, not a credential.
function request({ body = JSON.stringify({ action: 'recent.read' }), headers = {}, url = 'https://edge.example/assistant', method = 'POST' } = {}) {
  return new Request(url, { method, body, duplex: 'half', headers: {
    'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', Authorization: 'Bearer ' + token, ...headers
  } });
}
function environment() {
  return { ENABLED: 'true', ...Object.fromEntries(['ENTRY_LIMIT', 'IP_LIMIT', 'TOKEN_LIMIT'].map(name => [name, { limit: async () => ({ success: true }) }])) };
}
async function handler(forward, options) { return (await modulePromise).createIngress(forward, options); }
test('edge disabled, missing binding, limiter error and limits never call origin', async () => {
  let calls = 0;
  const run = await handler(async () => { calls++; throw Error('Should not forward'); });
  assert.equal((await run(request())).status, 503);
  for (const name of ['ENTRY_LIMIT', 'IP_LIMIT', 'TOKEN_LIMIT']) {
    const env = environment();
    delete env[name];
    assert.equal((await run(request(), env)).status, 503);
    env[name] = { limit: async () => { throw Error('private error'); } };
    assert.equal((await run(request(), env)).status, 503);
    env[name] = { limit: async () => ({ success: false }) };
    assert.equal((await run(request(), env)).status, 429);
  }
  assert.equal(calls, 0);
});
test('edge rejects malformed requests and identity injection without forwarding', async () => {
  let calls = 0;
  const run = await handler(async () => { calls++; });
  for (const options of [
    { url: 'https://edge.example/assistant?token=fixture' }, { method: 'PUT' },
    { headers: { Authorization: 'Bearer ' + token + ', other' } },
    { headers: { Authorization: 'Bearer ' + 'A'.repeat(64) } },
    { headers: { 'CF-Connecting-IP': '', 'X-Forwarded-For': '192.0.2.1' } },
    { headers: { 'Content-Type': 'text/plain' } }, { headers: { 'Content-Encoding': 'gzip' } },
    { body: 'invalid json' }, { body: '[]' }, { body: '{"action":"connection.create"}' },
    { body: '{"action":"recent.read","owner":"another-user"}' }
  ]) assert.ok([400, 401].includes((await run(request(options), environment())).status));
  assert.equal(calls, 0);
});
test('edge counts actual stream bytes and cancels oversized request despite false length', async () => {
  let cancelled = false, calls = 0;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16385)); }, cancel() { cancelled = true; } });
  const run = await handler(async () => { calls++; });
  assert.equal((await run(request({ body: stream, headers: { 'Content-Length': '1' } }), environment())).status, 400);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});
test('edge hashes limiter keys and forwards only explicit fields; strips origin headers', async () => {
  const env = environment(); let key;
  env.TOKEN_LIMIT = { limit: async input => { key = input.key; return { success: true }; } };
  const run = await handler(async input => {
    assert.deepEqual(Object.keys(input).sort(), ['payload', 'signal', 'token']);
    assert.equal(input.token, token);
    assert.deepEqual(input.payload, { action: 'recent.read' });
    return new Response(JSON.stringify({ ok: true, data: { memories: [] }, debug: 'private' }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'private', Location: 'https://other.example', 'Access-Control-Allow-Origin': '*' }
    });
  });
  const response = await run(request({ headers: { 'X-Origin-Token': 'untrusted' } }), env);
  assert.match(key, /^[a-f0-9]{64}$/); assert.notEqual(key, token);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { memories: [] } });
  for (const header of ['Set-Cookie', 'Location', 'Access-Control-Allow-Origin']) assert.equal(response.headers.has(header), false);
});
test('edge suppresses origin errors, redirects and oversized response', async () => {
  let cancelled = false;
  const nonJson = await handler(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/html' } }));
  assert.equal((await nonJson(request(), environment())).status, 503);
  assert.equal(cancelled, true);
  for (const origin of [
    () => { throw Error('private secret'); },
    () => new Response('private secret', { status: 302, headers: { Location: 'https://other.example' } }),
    () => new Response('x'.repeat(262145), { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ ok: false, code: 'UNKNOWN', error: 'private secret' })
  ]) {
    const response = await (await handler(origin))(request(), environment());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, code: 'UNAVAILABLE' });
  }
});
test('edge total deadline covers hanging request, forward and response; abort signal fired', async () => {
  let calls = 0;
  const run = await handler(async () => { calls++; }, { timeoutMs: 10 });
  const hanging = new ReadableStream({ pull() {} });
  assert.equal((await run(request({ body: hanging }), environment())).status, 503);
  assert.equal(calls, 0);
  let signal;
  const stalledForward = await handler(input => { signal = input.signal; return new Promise(() => {}); }, { timeoutMs: 10 });
  assert.equal((await stalledForward(request(), environment())).status, 503);
  assert.equal(signal.aborted, true);
  let cancelled = false;
  const stalledResponse = await handler(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }), { timeoutMs: 10 });
  assert.equal((await stalledResponse(request(), environment())).status, 503);
  assert.equal(cancelled, true);
});
