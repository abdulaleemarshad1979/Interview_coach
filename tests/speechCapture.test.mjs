import test from "node:test";
import assert from "node:assert/strict";
import { MicrophoneCapture, VoiceActivityDetector, transcribeRecordedSpeech } from "../src/lib/speechCapture.ts";

test("energy VAD rejects a click, detects sustained speech, and keeps pause duration", () => {
  const vad = new VoiceActivityDetector();
  assert.equal(vad.update(0.06, 0).hasSpeech, false);
  assert.equal(vad.update(0, 100).hasSpeech, false);
  vad.update(0.06, 300);
  vad.update(0.06, 400);
  const speech = vad.update(0.06, 500);
  assert.equal(speech.speaking, true);
  assert.equal(speech.hasSpeech, true);
  assert.equal(speech.voicedDurationMs, 100);
  assert.equal(vad.update(0, 700).speaking, true);
  const pause = vad.update(0, 2400);
  assert.equal(pause.speaking, false);
  assert.equal(pause.silenceMs, 1900);
  assert.equal(pause.hasSpeech, true);
});

test("VAD does not interpret silence or nonfinite samples as speech", () => {
  const vad = new VoiceActivityDetector();
  for (const at of [0, 100, 500, 2000]) assert.equal(vad.update(Number.NaN, at).hasSpeech, false);
});

test("capture bounds reject values larger than the server upload limit", () => {
  assert.throws(() => new MicrophoneCapture({ maxBytes: 11 * 1024 * 1024 }), /10 MB/);
  assert.throws(() => new MicrophoneCapture({ maxDurationMs: Infinity }), /10 minutes/);
});

test("denied microphone permission is a recoverable explicit state", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalRecorder = globalThis.MediaRecorder;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } } } });
  globalThis.MediaRecorder = class {};
  try {
    const capture = new MicrophoneCapture();
    await assert.rejects(capture.start(), /permission was denied/);
    assert.equal(capture.getState().status, "error");
    await assert.rejects(capture.stop(), /permission was denied/);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete globalThis.navigator;
    if (originalRecorder) globalThis.MediaRecorder = originalRecorder; else delete globalThis.MediaRecorder;
  }
});

test("cancelling a pending permission request stops a late microphone stream", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalRecorder = globalThis.MediaRecorder;
  let release;
  let stopped = 0;
  const streamPromise = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: () => streamPromise } } });
  globalThis.MediaRecorder = class {};
  try {
    const capture = new MicrophoneCapture();
    const starting = capture.start();
    capture.cancel();
    release({ getTracks: () => [{ stop: () => stopped++ }] });
    await assert.rejects(starting, { name: "AbortError" });
    assert.equal(capture.getState().status, "cancelled");
    assert.equal((await capture.stop()).stopReason, "cancelled");
    assert.equal(stopped, 1);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete globalThis.navigator;
    if (originalRecorder) globalThis.MediaRecorder = originalRecorder; else delete globalThis.MediaRecorder;
  }
});

test("silence recordings are rejected before any provider request", async () => {
  const recording = { blob: new Blob([new Uint8Array(1024)]), mimeType: "audio/webm", durationMs: 1000, voicedDurationMs: 0, speechDetected: false, stopReason: "user" };
  await assert.rejects(transcribeRecordedSpeech(recording), /No speech was detected/);
});

test("transcription preserves the authenticated base64 JSON endpoint and provider source", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  let request;
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ text: "  I used rotating refresh tokens.  ", source: "groq" }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const recording = { blob: new Blob([new Uint8Array(1024).fill(7)]), mimeType: "audio/webm;codecs=opus", durationMs: 1000, voicedDurationMs: 900, speechDetected: true, stopReason: "user" };
    assert.deepEqual(await transcribeRecordedSpeech(recording), { text: "I used rotating refresh tokens.", source: "groq" });
    assert.equal(request.url, "/api/voice/transcribe");
    assert.equal(request.body.mimeType, recording.mimeType);
    assert.equal(Buffer.from(request.body.audio, "base64").length, 1024);
  } finally { globalThis.fetch = originalFetch; if (originalStorage) globalThis.localStorage = originalStorage; else delete globalThis.localStorage; }
});
