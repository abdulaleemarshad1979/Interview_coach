import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Groq from 'groq-sdk';
import { createAIProvider } from '../backend/ai/provider.ts';

const configured = Boolean(process.env.GROQ_API_KEY);
test('LIVE Groq configured chat model responds with actual structured output', { skip: !configured }, async () => {
  const provider = createAIProvider();
  const result = await provider.completeJson({ messages: [{ role: 'system', content: 'Return JSON with a question string.' }, { role: 'user', content: 'Ask one backend engineering interview question.' }], maxTokens: 200 });
  assert.ok(typeof (result.value as any).question === 'string'); assert.ok(result.usage.totalTokens > 0);
});
for (const voice of ['hannah', 'autumn', 'diana']) test(`LIVE Groq Orpheus generates WAV for ${voice}`, { skip: !configured }, async () => {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 30000 });
  const result = await groq.audio.speech.create({ model: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english', voice, input: 'How did you handle token expiration and refresh?', response_format: 'wav' });
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF'); assert.ok(bytes.length > 512);
});
test('LIVE Groq speech recognizer transcribes an operator-provided spoken fixture', {
  skip: !configured || !process.env.STT_TEST_AUDIO_PATH || !fs.existsSync(process.env.STT_TEST_AUDIO_PATH!),
}, async () => {
  const result = await createAIProvider().transcribe({ audio: fs.readFileSync(process.env.STT_TEST_AUDIO_PATH!), mimeType: process.env.STT_TEST_MIME_TYPE || 'audio/wav' });
  assert.ok(result.text.trim().length > 0);
  if (process.env.STT_EXPECTED_PHRASE) assert.ok(result.text.toLowerCase().includes(process.env.STT_EXPECTED_PHRASE.toLowerCase()));
});
