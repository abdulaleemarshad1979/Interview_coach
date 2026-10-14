import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAIProvider } from '../backend/ai/provider.ts';
import { safeError } from '../backend/errors.ts';

async function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { await run(); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
async function withServer(handler: http.RequestListener, run: (url: string) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try { await run(`http://127.0.0.1:${address.port}/v1`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const messages = [{ role: 'system' as const, content: 'Return one JSON object.' }, { role: 'user' as const, content: 'Synthetic provider transport test.' }];

test('missing provider credentials fail explicitly without generating interview output', async () => {
  await withEnvironment({ AI_PROVIDER: 'groq', GROQ_API_KEY: undefined }, async () => {
    await assert.rejects(createAIProvider().completeJson({ messages }), (error: any) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.status === 503);
  });
});
test('compatible provider retries transient failures, validates JSON and records real response usage', async () => {
  let calls = 0;
  await withServer((_req, res) => {
    calls++;
    if (calls === 1) { res.writeHead(503); res.end('Simulated failure with private upstream details'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '{"utterance":"Synthetic transport result"}' } }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } }));
  }, url => withEnvironment({ AI_PROVIDER: 'openai', AI_BASE_URL: url, AI_API_KEY: 'test-only-value' }, async () => {
    const result = await createAIProvider().completeJson({ messages });
    assert.equal(calls, 2); assert.deepEqual(result.value, { utterance: 'Synthetic transport result' }); assert.equal(result.usage.totalTokens, 18);
  }));
});
test('compatible provider consumes actual SSE deltas and usage from a transport fixture', async () => {
  await withServer((_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"utterance":' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '"transport fixture"}' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  }, url => withEnvironment({ AI_PROVIDER: 'openai', AI_BASE_URL: url, AI_API_KEY: 'test-only-value' }, async () => {
    const deltas: string[] = [];
    const result = await createAIProvider().completeJson({ messages, onDelta: delta => { deltas.push(delta); } });
    assert.equal(deltas.join(''), '{"utterance":"transport fixture"}'); assert.equal(result.usage.totalTokens, 11);
  }));
});
test('timeouts and caller cancellation have distinct retryable errors', async () => {
  await withServer((_req, _res) => {}, url => withEnvironment({ AI_PROVIDER: 'openai', AI_BASE_URL: url, AI_API_KEY: 'test-only-value', AI_REQUEST_TIMEOUT_MS: '1000' }, async () => {
    await assert.rejects(createAIProvider().completeJson({ messages }), (error: any) => error.code === 'PROVIDER_TIMEOUT' && error.status === 504);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(createAIProvider().completeJson({ messages, signal: controller.signal }), (error: any) => error.code === 'CANCELLED' && error.status === 499);
  }));
});
test('upstream error bodies and internal secrets are never exposed in service errors', async () => {
  const error = safeError(Object.assign(new Error('private-token-and-transcript'), { status: 401 }));
  assert.equal(error.code, 'PROVIDER_CONFIGURATION'); assert.ok(!error.message.includes('private'));
  await withServer((_req, res) => { res.writeHead(400); res.end('private-provider-error-and-token'); }, url => withEnvironment({ AI_PROVIDER: 'openai', AI_BASE_URL: url, AI_API_KEY: 'test-only-value' }, async () => {
    await assert.rejects(createAIProvider().completeJson({ messages }), (error: any) => !error.message.includes('private') && error.code === 'PROVIDER_UNAVAILABLE');
  }));
});
test('audio validation rejects unsupported uploads before contacting a recognizer', async () => {
  await assert.rejects(createAIProvider().transcribe({ audio: Buffer.alloc(1024), mimeType: 'text/html' }), (error: any) => error.code === 'INVALID_AUDIO');
  await assert.rejects(createAIProvider().transcribe({ audio: Buffer.alloc(10), mimeType: 'audio/webm' }), (error: any) => error.code === 'INVALID_AUDIO');
});
