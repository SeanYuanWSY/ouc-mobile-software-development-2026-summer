const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpHandler, tools, sessionFor } = require('../cloudfunctions/assistantGateway/mcp');

test('cloud MCP exposes standard handshake and the same personal tools', async () => {
  const calls = [];
  const run = async (token, input) => { calls.push({ token, input }); return { ok: true, data: { accepted: true } }; };
  const handle = createMcpHandler(run);
  const token = 'a'.repeat(64);
  const init = await handle(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.equal(init.result.protocolVersion, '2025-11-25');
  const listed = await handle(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.length, tools.length);
  const called = await handle(token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'summerverse_jobs', arguments: {} } });
  assert.equal(called.result.isError, false);
  assert.deepEqual(calls[0], { token, input: { action: 'job.list' } });
  assert.match(sessionFor(token), /^[a-f0-9]{32}$/);
});

test('cloud MCP rejects unknown tools and extra trusted fields', async () => {
  const handle = createMcpHandler(async () => ({ ok: true }));
  assert.equal((await handle('a'.repeat(64), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope', arguments: {} } })).error.code, -32602);
  assert.equal((await handle('a'.repeat(64), { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'summerverse_jobs', arguments: { _openid: 'other' } } })).error.code, -32602);
});
