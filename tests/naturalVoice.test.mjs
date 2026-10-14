import test from "node:test";
import assert from "node:assert/strict";
import { VoicePlaybackEngine } from "../src/lib/naturalVoice.ts";

const options = { voice: "hannah", rate: 1, provider: "groq", allowBrowserFallback: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const sound = text => ({ kind: "audio", blob: new Blob([text], { type: "audio/wav" }) });

test("two immediate questions cancel stale synthesis without duplicate playback", async () => {
  const pending = [];
  const played = [];
  let endCount = 0;
  const provider = { id: "groq", synthesize(text) { const task = deferred(); pending.push({ text, task }); return task.promise; } };
  const engine = new VoicePlaybackEngine([provider], async (audio, _options, _signal, start) => { start(); played.push(await audio.blob.text()); });
  const old = engine.speak("First question?", options, undefined, () => endCount++);
  const current = engine.speak("Replacement question?", options, undefined, () => endCount++);
  assert.equal((await old).status, "cancelled");
  pending[1].task.resolve(sound(pending[1].text));
  assert.equal((await current).status, "completed");
  pending[0].task.resolve(sound(pending[0].text));
  await tick();
  assert.deepEqual(played, ["Replacement question?"]);
  assert.equal(endCount, 1);
});

test("queued announcements play serially and snapshot the selected identity", async () => {
  const played = [];
  const releases = [];
  let concurrency = 0;
  let maximum = 0;
  const identities = [];
  const provider = { id: "groq", async synthesize(text, selected) { identities.push(selected.voice); return sound(text); } };
  const engine = new VoicePlaybackEngine([provider], async (audio, _selected, signal, start) => {
    concurrency++;
    maximum = Math.max(maximum, concurrency);
    start();
    played.push(await audio.blob.text());
    const hold = deferred();
    releases.push(hold.resolve);
    signal.addEventListener("abort", hold.resolve, { once: true });
    await hold.promise;
    concurrency--;
  });
  const changing = { ...options };
  const first = engine.enqueue("Question one?", changing);
  const second = engine.enqueue("Question two?", changing);
  changing.voice = "diana";
  await tick();
  assert.equal(engine.getState().queued, 1);
  assert.deepEqual(played, ["Question one?"]);
  releases[0]();
  await first;
  await tick();
  assert.deepEqual(played, ["Question one?", "Question two?"]);
  releases[1]();
  await second;
  assert.equal(maximum, 1);
  assert.deepEqual(identities, ["hannah", "hannah"]);
});

test("stop settles active and pending promises even when a provider never responds", async () => {
  const provider = { id: "groq", synthesize: () => new Promise(() => {}) };
  const engine = new VoicePlaybackEngine([provider], async () => {});
  const first = engine.enqueue("First?", options);
  const second = engine.enqueue("Second?", options);
  engine.stop();
  assert.deepEqual((await Promise.all([first, second])).map(result => result.status), ["cancelled", "cancelled"]);
  assert.equal(engine.getState().status, "idle");
  assert.equal(engine.getState().queued, 0);
});

test("provider failure stays visible and never silently selects a device voice", async () => {
  let fallbackCalls = 0;
  const primary = { id: "groq", async synthesize() { throw new Error("Groq unavailable"); } };
  const fallback = { id: "browser", async synthesize(text) { fallbackCalls++; return { kind: "browser", text }; } };
  const engine = new VoicePlaybackEngine([primary, fallback], async () => {});
  const result = await engine.speak("Explain token expiration?", options);
  assert.equal(result.status, "failed");
  assert.equal(result.fallbackUsed, false);
  assert.equal(fallbackCalls, 0);
  assert.equal(engine.getState().status, "error");
  assert.match(engine.getState().error, /Groq unavailable/);
});

test("explicit fallback switches only the remaining chunk and reports the provider", async () => {
  const input = "Explain how you handled token expiration and refresh in the authentication system you designed. Describe the threat posed by a stolen refresh token and explain how you would mitigate that risk.";
  let requests = 0;
  const played = [];
  const states = [];
  const primary = { id: "groq", async synthesize(text) { if (++requests > 1) throw new Error("Network failed"); return sound(text); } };
  const fallback = { id: "browser", async synthesize(text) { return { kind: "browser", text }; } };
  const engine = new VoicePlaybackEngine([primary, fallback], async (audio, _selected, _signal, start) => { start(); played.push(audio.kind === "audio" ? await audio.blob.text() : audio.text); });
  engine.subscribe(state => states.push(state));
  const result = await engine.speak(input, { ...options, allowBrowserFallback: true });
  assert.equal(result.status, "completed");
  assert.equal(result.provider, "browser");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.playedChunks, 2);
  assert.equal(played.join(" "), input);
  assert.ok(states.some(state => state.fallback && state.provider === "browser"));
});

test("an invalid long token fails before synthesis and completion callbacks run once", async () => {
  let requests = 0;
  let ends = 0;
  const engine = new VoicePlaybackEngine([{ id: "groq", async synthesize(text) { requests++; return sound(text); } }], async () => {});
  const result = await engine.speak("x".repeat(201), options, undefined, () => ends++);
  assert.equal(result.status, "failed");
  assert.equal(requests, 0);
  assert.equal(ends, 1);
});

test("synthesis prefetch is bounded to one chunk ahead", async () => {
  const input = "Describe a technical decision and explain the alternatives that you considered before choosing your implementation. ".repeat(5).trim();
  let requests = 0;
  const releases = [];
  const engine = new VoicePlaybackEngine([{ id: "groq", async synthesize(text) { requests++; return sound(text); } }], async (_audio, _selected, signal, start) => {
    start();
    const hold = deferred();
    releases.push(hold.resolve);
    signal.addEventListener("abort", hold.resolve, { once: true });
    await hold.promise;
  });
  const playback = engine.speak(input, options);
  await tick();
  assert.equal(requests, 2);
  assert.equal(releases.length, 1);
  engine.stop();
  assert.equal((await playback).status, "cancelled");
});
