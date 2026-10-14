/** Native media lifecycle verification with synthetic fixtures, not live Groq or human speech. */
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'interview-voice-fixture-'));
const evidenceDirectory = path.resolve(process.env.VOICE_BROWSER_EVIDENCE_DIR || 'docs');
await fs.mkdir(evidenceDirectory, { recursive:true });
await build({ entryPoints:['src/lib/naturalVoice.ts', 'src/lib/speechCapture.ts'], outdir:fixtureDirectory, bundle:true, format:'esm', platform:'browser' });

function wav(seconds, includePause = false) {
  const sampleRate = 16000;
  const count = Math.round(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++) {
    const at = index / sampleRate;
    const value = includePause && at >= 0.7 && at < 2.8 ? 0 : Math.round(Math.sin(at * Math.PI * 2 * 440) * 4000);
    bytes.writeInt16LE(value, 44 + index * 2);
  }
  return bytes;
}
const microphoneFixture = path.join(fixtureDirectory, 'fake-microphone.wav');
await fs.writeFile(microphoneFixture, wav(5, true));
const html = `<!doctype html><html><head><title>Native voice integration harness</title></head><body>
<h1>Native voice integration harness</h1><p>Synthetic audio only; no speech provider is called.</p>
<button id="play">Play queue</button><button id="cancel-playback">Cancel playback</button>
<button id="start">Start microphone</button><button id="stop">Stop microphone</button><button id="cancel">Cancel microphone</button>
<pre id="state"></pre><script type="module">
import { VoicePlaybackEngine } from '/naturalVoice.js';
import { MicrophoneCapture } from '/speechCapture.js';
let fixture = await (await fetch('/tone.wav')).blob();
window.playStates = []; window.starts = 0; window.ends = 0;
window.engine = new VoicePlaybackEngine([{ id:'groq', async synthesize() { return { kind:'audio', blob:fixture }; } }]);
window.engine.subscribe(state => window.playStates.push({ ...state, at:performance.now() }));
document.querySelector('#play').onclick = async () => {
  window.playResult = null;
  const options = { voice:'hannah', rate:1, provider:'groq', allowBrowserFallback:false };
  window.playResult = await Promise.all([1,2,3].map(index => window.engine.enqueue('Test question ' + index + '?', options, () => window.starts++, () => window.ends++)));
};
document.querySelector('#cancel-playback').onclick = () => window.engine.stop();
document.querySelector('#start').onclick = async () => {
  window.captureError = null; window.captured = null;
  window.capture = new MicrophoneCapture({ maxDurationMs:window.captureMaxDuration || 5000 });
  window.capture.subscribe(state => document.querySelector('#state').textContent = JSON.stringify(state));
  try { await window.capture.start(); window.savedTrack = window.capture.stream.getAudioTracks()[0]; }
  catch(error) { window.captureError = error.message; }
};
document.querySelector('#stop').onclick = async () => {
  const result = await window.capture.stop();
  window.captured = { ...result, blob:{ size:result.blob.size, type:result.blob.type }, trackState:window.savedTrack.readyState };
};
document.querySelector('#cancel').onclick = () => window.capture.cancel();
</script></body></html>`;
const server = http.createServer(async (request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
  if (request.url === '/tone.wav') { response.setHeader('Content-Type', 'audio/wav'); response.end(wav(0.18)); return; }
  const file = ['naturalVoice.js', 'speechCapture.js'].find(name => request.url === '/' + name);
  if (!file) { response.statusCode = 404; response.end(); return; }
  response.setHeader('Content-Type', 'text/javascript'); response.end(await fs.readFile(path.join(fixtureDirectory, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ ...(process.env.VOICE_BROWSER_EXECUTABLE ? { executablePath:process.env.VOICE_BROWSER_EXECUTABLE } : { channel:'chromium' }), headless:true, args:['--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + microphoneFixture] });
const output = { observedAt:new Date().toISOString(), evidenceType:'native browser playback/capture with synthetic WAV and synthetic microphone, no Groq credentials or provider calls', checks:[] };
try {
  const context = await browser.newContext({ permissions:['microphone'], viewport:{ width:1080, height:760 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.engine));
  await page.locator('#play').click();
  await page.waitForFunction(() => Array.isArray(window.playResult));
  const playback = await page.evaluate(() => ({ results:window.playResult, starts:window.starts, ends:window.ends, states:window.playStates }));
  assert.deepEqual(playback.results.map(result => result.status), ['completed','completed','completed']);
  assert.equal(playback.starts, 3); assert.equal(playback.ends, 3);
  output.checks.push({ name:'three queued audio sources complete with one start/end each', status:'passed', playback });
  await page.locator('#play').click();
  await page.waitForFunction(() => window.engine.getState().status === 'playing');
  await page.locator('#cancel-playback').click();
  await page.waitForFunction(() => Array.isArray(window.playResult));
  assert.deepEqual(await page.evaluate(() => window.playResult.map(result => result.status)), ['cancelled','cancelled','cancelled']);
  assert.equal(await page.evaluate(() => window.engine.getState().status), 'idle');
  output.checks.push({ name:'native playing source and queued sources cancel and settle', status:'passed' });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.capture?.getState().hasSpeech || window.captureError, { timeout:10000 });
  assert.equal(await page.evaluate(() => window.captureError), null);
  await page.waitForFunction(() => window.capture.getState().silenceMs >= 1800, null, { timeout:10000 });
  assert.equal(await page.evaluate(() => window.capture.getState().status), 'recording');
  await page.waitForFunction(() => window.capture.getState().speaking && window.capture.getState().durationMs >= 2800, null, { timeout:10000 });
  output.checks.push({ name:'native VAD pause does not stop the answer and later speech resumes', status:'passed' });
  await page.locator('#stop').click();
  await page.waitForFunction(() => Boolean(window.captured));
  const recording = await page.evaluate(() => window.captured);
  assert.equal(recording.speechDetected, true); assert.equal(recording.trackState, 'ended');
  assert.ok(recording.blob.size >= 512); assert.ok(recording.blob.size <= 8 * 1024 * 1024);
  output.checks.push({ name:'native MediaRecorder and VAD produce bounded complete synthetic capture and release track', status:'passed', recording });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.capture?.getState().status === 'recording');
  await page.locator('#cancel').click();
  assert.equal(await page.evaluate(() => window.savedTrack.readyState), 'ended');
  assert.equal(await page.evaluate(() => window.capture.getState().status), 'cancelled');
  output.checks.push({ name:'native microphone cancellation ends media track', status:'passed' });
  await page.evaluate(() => { window.captureMaxDuration = 1000; });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.capture.getState().status === 'stopped', null, { timeout:10000 });
  await page.locator('#stop').click();
  await page.waitForFunction(() => Boolean(window.captured));
  const limited = await page.evaluate(() => window.captured);
  assert.equal(limited.stopReason, 'duration-limit'); assert.equal(limited.trackState, 'ended');
  output.checks.push({ name:'native recording duration limit finalizes and releases tracks without submitting', status:'passed', limited });
  const deniedContext = await browser.newContext();
  await deniedContext.grantPermissions([], { origin:url });
  const denied = await deniedContext.newPage();
  await denied.goto(url); await denied.waitForFunction(() => Boolean(window.engine));
  await denied.locator('#start').click();
  await denied.waitForFunction(() => Boolean(window.captureError));
  const denial = await denied.evaluate(() => ({ state:window.capture.getState(), error:window.captureError }));
  assert.equal(denial.state.status, 'error'); assert.match(denial.error, /permission was denied/);
  output.checks.push({ name:'native denied permission remains explicit and recoverable', status:'passed', denial });
  output.consoleErrors = consoleErrors;
  assert.equal(consoleErrors.length, 0);
  await page.screenshot({ path:path.join(evidenceDirectory, 'voice-native-browser.png') });
  console.log(JSON.stringify(output, null, 2));
} finally {
  await fs.writeFile(path.join(evidenceDirectory, 'voice-browser-verification.json'), JSON.stringify(output, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => server.close(resolve));
  await fs.rm(fixtureDirectory, { recursive:true, force:true });
}
