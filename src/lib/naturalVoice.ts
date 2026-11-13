/** Server-owned Groq synthesis, with one cancellable playback queue. */
import { apiFetch } from "./api";
import { chunkSpeech } from "./speechChunks";

export type FemaleVoice = "Jade-PlayAI" | "Aaliyah-PlayAI" | "Constance-PlayAI" | "Fritz-PlayAI";
export type VoiceProviderId = "groq" | "browser";
export const FEMALE_VOICE_PROFILES = [
  { id: "Jade-PlayAI", label: "Jade" },
  { id: "Aaliyah-PlayAI", label: "Aaliyah" },
  { id: "Constance-PlayAI", label: "Constance" },
  { id: "Fritz-PlayAI", label: "Fritz" },
] as const;

export interface VoiceOptions {
  voice: FemaleVoice;
  rate: number;
  provider: VoiceProviderId;
  /** Browser voices differ from Orpheus; changing provider requires this explicit opt-in. */
  allowBrowserFallback: boolean;
}

export interface VoicePlaybackState {
  status: "idle" | "synthesizing" | "playing" | "error";
  provider: VoiceProviderId;
  voice: FemaleVoice;
  queued: number;
  completedChunks: number;
  totalChunks: number;
  fallback: boolean;
  error?: string;
}

export interface VoicePlaybackResult {
  status: "completed" | "cancelled" | "failed";
  provider: VoiceProviderId;
  fallbackUsed: boolean;
  playedChunks: number;
  synthesisLatencyMs: number[];
  error?: string;
}

export type VoiceAudio = { kind: "audio"; blob: Blob } | { kind: "browser"; text: string };
export interface VoiceSynthesisProvider {
  id: VoiceProviderId;
  synthesize(text: string, options: VoiceOptions, signal: AbortSignal): Promise<VoiceAudio>;
}
export type VoiceAudioPlayer = (
  audio: VoiceAudio, options: VoiceOptions, signal: AbortSignal, onStart: () => void,
) => Promise<void>;

const OPTION_KEY = "interview_voice_options_v1";
const DEFAULT_OPTIONS: VoiceOptions = { voice: "Jade-PlayAI", rate: 1, provider: "groq", allowBrowserFallback: true };
let memoryOptions = { ...DEFAULT_OPTIONS };

function normalizeOptions(value: Partial<VoiceOptions>, previous = DEFAULT_OPTIONS): VoiceOptions {
  return {
    voice: FEMALE_VOICE_PROFILES.some(voice => voice.id === value.voice) ? value.voice! : previous.voice,
    rate: Number.isFinite(value.rate) ? Math.max(0.85, Math.min(1.15, value.rate!)) : previous.rate,
    provider: value.provider === "groq" || value.provider === "browser" ? value.provider : previous.provider,
    allowBrowserFallback: typeof value.allowBrowserFallback === "boolean" ? value.allowBrowserFallback : previous.allowBrowserFallback,
  };
}

export function getVoiceOptions(): VoiceOptions {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = JSON.parse(localStorage.getItem(OPTION_KEY) || "null");
      if (stored && typeof stored === "object") memoryOptions = normalizeOptions(stored);
    }
  } catch { /* Storage can be blocked; use the current in-memory preferences. */ }
  return { ...memoryOptions };
}

export function setVoiceOptions(options: Partial<VoiceOptions>): VoiceOptions {
  memoryOptions = normalizeOptions(options, getVoiceOptions());
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(OPTION_KEY, JSON.stringify(memoryOptions));
  } catch { /* Playback remains usable when browser storage is unavailable. */ }
  return { ...memoryOptions };
}

function abortError(): DOMException { return new DOMException("Speech cancelled", "AbortError"); }
function requireActive(signal: AbortSignal): void { if (signal.aborted) throw abortError(); }

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    requireActive(signal);
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

class VoiceServiceError extends Error {
  constructor(message: string, readonly retryable = false, readonly retryAfterMs = 400) { super(message); }
}

const groqProvider: VoiceSynthesisProvider = {
  id: "groq",
  async synthesize(text, options, signal) {
    if (!text || text.length > 200) throw new VoiceServiceError("Speech requests must contain 1–200 characters.");
    for (let attempt = 0; attempt < 2; attempt++) {
      requireActive(signal);
      const request = new AbortController();
      const cancel = () => request.abort();
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(() => request.abort(), 15000);
      try {
        const response = await apiFetch("/api/voice/synthesize", {
          method: "POST", body: JSON.stringify({ text, voice: options.voice }), signal: request.signal,
        });
        requireActive(signal);
        if (!response.ok) {
          const configuredError = response.status === 503;
          const retryable = response.status === 429 || response.status === 502 || response.status === 504;
          const seconds = Number(response.headers.get("Retry-After"));
          const detail = await response.json().then((body: any) => typeof body?.error === "string" ? body.error : "").catch(() => "");
          const retryMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3000) : 400;
          throw new VoiceServiceError(
            configuredError ? "Groq speech is unavailable. Configure the provider or select browser speech." : detail || `Speech service returned HTTP ${response.status}.`,
            retryable, retryMs,
          );
        }
        const blob = await response.blob();
        requireActive(signal);
        if (!blob.size || !/^audio\//i.test(blob.type)) throw new VoiceServiceError("Speech service did not return playable audio.");
        return { kind: "audio", blob };
      } catch (error) {
        requireActive(signal);
        const failure = error instanceof VoiceServiceError ? error : new VoiceServiceError(
          request.signal.aborted ? "Speech generation timed out. Try replaying the question." : "Cannot reach the speech service. Check your connection.", true,
        );
        if (!failure.retryable || attempt === 1) throw failure;
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        await waitForRetry(failure.retryAfterMs * (attempt + 1), signal);
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
      }
    }
    throw new VoiceServiceError("Speech generation failed.");
  },
};

const browserProvider: VoiceSynthesisProvider = {
  id: "browser",
  async synthesize(text, _options, signal) {
    requireActive(signal);
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      throw new VoiceServiceError("Browser speech is not available on this device.");
    }
    return { kind: "browser", text };
  },
};

/** HTML media rate preserves pitch, avoiding the identity change caused by AudioBuffer playbackRate. */
const playVoiceAudio: VoiceAudioPlayer = (sound, options, signal, onStart) => {
  if (typeof window === "undefined") return Promise.reject(new Error("Speech playback requires a browser."));
  requireActive(signal);
  if (sound.kind === "browser") return playBrowserVoice(sound.text, options, signal, onStart);
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(sound.blob);
    const audio = new Audio(url);
    audio.playbackRate = options.rate;
    audio.preservesPitch = true;
    let finished = false;
    let timeout = setTimeout(() => finish(new Error("Audio playback did not finish. Try replaying the question.")), 60000);
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      audio.onplaying = audio.onended = audio.onerror = audio.onloadedmetadata = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(abortError());
    signal.addEventListener("abort", cancel, { once: true });
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration)) return;
      clearTimeout(timeout);
      timeout = setTimeout(() => finish(new Error("Audio playback stalled. Try replaying the question.")), Math.max(30000, audio.duration / options.rate * 1000 + 10000));
    };
    audio.onplaying = onStart;
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Generated audio could not be played. Try replaying the question."));
    audio.play().catch(error => finish(new Error(error?.name === "NotAllowedError"
      ? "Audio is blocked by this browser. Select Replay question to enable playback."
      : "Audio playback failed. Try replaying the question.")));
  });
};

/** Chrome returns [] from getVoices() until voiceschanged fires; wait briefly instead of speaking with no voice. */
function loadBrowserVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const synthesis = window.speechSynthesis;
  const current = synthesis.getVoices();
  if (current.length) return Promise.resolve(current);
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); synthesis.removeEventListener("voiceschanged", done); resolve(synthesis.getVoices()); };
    const timer = setTimeout(done, timeoutMs);
    synthesis.addEventListener("voiceschanged", done);
  });
}

function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(voice => /^en[-_](IN|US|GB)/i.test(voice.lang));
  const pool = english.length ? english : voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  // These are device voices; no claim is made that they match the selected Orpheus profile.
  return pool.find(voice => /jenny|aria|samantha|karen|zira|female|google us english|google uk english female/i.test(voice.name))
    || pool.find(voice => voice.localService) || pool[0] || null;
}

// Chrome garbage-collects in-flight utterances and then never fires onend; hold references until settled.
const liveUtterances = new Set<SpeechSynthesisUtterance>();

/** Call synchronously inside a click handler so later (post-network) speech is not blocked by autoplay policy. */
export function primeSpeech(): void {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    const synthesis = window.speechSynthesis;
    synthesis.getVoices();
    if (synthesis.paused) synthesis.resume();
    if (synthesis.speaking || synthesis.pending) return;
    const warmup = new SpeechSynthesisUtterance(" ");
    warmup.volume = 0;
    synthesis.speak(warmup);
  } catch { /* Priming is best-effort; playback still reports its own errors. */ }
}

async function playBrowserVoice(text: string, options: VoiceOptions, signal: AbortSignal, onStart: () => void): Promise<void> {
  const synthesis = window.speechSynthesis;
  const voice = pickEnglishVoice(await loadBrowserVoices());
  requireActive(signal);
  // Clear a stuck queue (or the silent warm-up); Chrome drops a speak() issued in the same tick as cancel().
  if (synthesis.speaking || synthesis.pending) { synthesis.cancel(); await waitForRetry(60, signal); }
  if (synthesis.paused) synthesis.resume();
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-US";
    utterance.rate = options.rate;
    liveUtterances.add(utterance);
    let finished = false;
    const timeout = setTimeout(() => finish(new Error("Browser speech did not finish. Try replaying the question.")), Math.max(20000, text.length * 150));
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      utterance.onstart = utterance.onend = utterance.onerror = null;
      liveUtterances.delete(utterance);
      if (error) { synthesis.cancel(); reject(error); } else resolve();
    };
    const cancel = () => finish(abortError());
    signal.addEventListener("abort", cancel, { once: true });
    utterance.onstart = onStart;
    utterance.onend = () => finish();
    utterance.onerror = event => {
      const code = (event as SpeechSynthesisErrorEvent).error;
      finish(new Error(code === "not-allowed"
        ? "Browser blocked speech until you interact with the page. Select Replay question"
        : `Browser speech failed (${code || "unknown"}). Try Replay question`));
    };
    synthesis.speak(utterance);
  });
}

/** Markdown symbols are read aloud literally by TTS engines. */
export function speakableText(text: string): string {
  return (text || "").replace(/```[\s\S]*?```/g, " ").replace(/[`*#_>~|]+/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

interface SpeechJob {
  text: string;
  options: VoiceOptions;
  controller: AbortController;
  onStart?: () => void;
  onEnd?: () => void;
  resolve: (result: VoicePlaybackResult) => void;
  result: VoicePlaybackResult;
  settled: boolean;
  started: boolean;
  /** Why the selected provider failed before browser fallback; kept so the fallback error does not hide it. */
  primaryError?: string;
}

export class VoicePlaybackEngine {
  private providers: Map<VoiceProviderId, VoiceSynthesisProvider>;
  private queue: SpeechJob[] = [];
  private active: SpeechJob | null = null;
  private listeners = new Set<(state: VoicePlaybackState) => void>();
  private state: VoicePlaybackState = { status: "idle", provider: "groq", voice: "Jade-PlayAI", queued: 0, completedChunks: 0, totalChunks: 0, fallback: false };

  constructor(
    providers: VoiceSynthesisProvider[] = [groqProvider, browserProvider],
    private play: VoiceAudioPlayer = playVoiceAudio,
    private now: () => number = () => performance.now(),
  ) { this.providers = new Map(providers.map(provider => [provider.id, provider])); }

  getState(): VoicePlaybackState { return this.state; }
  subscribe(listener: (state: VoicePlaybackState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(value: Partial<VoicePlaybackState>): void {
    this.state = { ...this.state, ...value, queued: this.queue.length };
    for (const listener of this.listeners) {
      try { listener(this.state); } catch { /* A view must not break audio cleanup. */ }
    }
  }
  private settle(job: SpeechJob, status: VoicePlaybackResult["status"], error?: string): void {
    if (job.settled) return;
    job.settled = true;
    job.result = { ...job.result, status, ...(error ? { error } : {}) };
    // Legacy completion handlers start listening; obsolete speech must not trigger them.
    if (status !== "cancelled") { try { job.onEnd?.(); } catch { /* Callbacks cannot prevent settlement. */ } }
    job.resolve(job.result);
  }

  stop(): void {
    const pending = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null;
    this.queue = [];
    for (const job of pending) { job.controller.abort(); this.settle(job, "cancelled"); }
    this.publish({ status: "idle", error: undefined, completedChunks: 0, totalChunks: 0, fallback: false });
  }

  speak(text: string, options = getVoiceOptions(), onStart?: () => void, onEnd?: () => void): Promise<VoicePlaybackResult> {
    // Cancellation is synchronous: two immediate speak calls cannot acquire the same generation.
    this.stop();
    return this.enqueue(text, options, onStart, onEnd);
  }

  enqueue(text: string, options = getVoiceOptions(), onStart?: () => void, onEnd?: () => void): Promise<VoicePlaybackResult> {
    return new Promise(resolve => {
      const snapshot = normalizeOptions(options);
      const job: SpeechJob = {
        text: speakableText(text), options: snapshot, onStart, onEnd, resolve,
        controller: new AbortController(), settled: false, started: false,
        result: { status: "completed", provider: snapshot.provider, fallbackUsed: false, playedChunks: 0, synthesisLatencyMs: [] },
      };
      if (this.queue.length >= 8) { this.settle(job, "failed", "Speech queue is full. Wait for playback to finish."); return; }
      this.queue.push(job);
      this.publish({});
      this.beginNext();
    });
  }

  private beginNext(): void {
    if (this.active) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    void this.run(job).finally(() => {
      if (this.active !== job) return;
      this.active = null;
      if (this.queue.length) this.beginNext();
      else if (this.state.status !== "error") this.publish({ status: "idle" });
    });
  }

  private async run(job: SpeechJob): Promise<void> {
    const signal = job.controller.signal;
    try {
      const parts = chunkSpeech(job.text);
      if (!parts.length) { this.settle(job, "completed"); return; }
      this.publish({ status: "synthesizing", provider: job.options.provider, voice: job.options.voice, completedChunks: 0, totalChunks: parts.length, fallback: false, error: undefined });
      let provider = this.providers.get(job.options.provider);
      if (!provider) throw new Error("The selected voice provider is unavailable.");
      const synthesize = async (part: string) => {
        const start = this.now();
        try {
          let sound: VoiceAudio;
          try { sound = await provider!.synthesize(part, job.options, signal); }
          catch (error) {
            requireActive(signal);
            if (provider!.id !== "groq" || !job.options.allowBrowserFallback) throw error;
            const fallback = this.providers.get("browser");
            if (!fallback) throw error;
            job.primaryError ||= error instanceof Error ? error.message : String(error);
            provider = fallback;
            sound = await provider.synthesize(part, job.options, signal);
          }
          requireActive(signal);
          job.result.synthesisLatencyMs.push(Math.max(0, this.now() - start));
          return { sound, provider: provider!.id };
        } catch (error) { return { error }; }
      };
      // One queued synthesis overlaps current playback; errors are captured to avoid unhandled rejections.
      let next = synthesize(parts[0]);
      for (let index = 0; index < parts.length; index++) {
        const prepared = await next;
        requireActive(signal);
        if ("error" in prepared) throw prepared.error;
        job.result.provider = prepared.provider;
        job.result.fallbackUsed ||= prepared.provider !== job.options.provider;
        if (index + 1 < parts.length) next = synthesize(parts[index + 1]);
        this.publish({ status: "synthesizing", provider: prepared.provider, fallback: job.result.fallbackUsed });
        await this.play(prepared.sound, job.options, signal, () => {
          if (!signal.aborted) this.publish({ status: "playing" });
          if (!signal.aborted && !job.started) {
            job.started = true;
            try { job.onStart?.(); } catch { /* Preserve playback after view errors. */ }
          }
        });
        requireActive(signal);
        job.result.playedChunks++;
        this.publish({ status: index + 1 < parts.length ? "synthesizing" : "playing", completedChunks: job.result.playedChunks });
      }
      this.settle(job, "completed");
    } catch (error) {
      if (signal.aborted || job.settled) return;
      const failure = error instanceof Error ? error.message : "Speech playback failed. Try replaying the question.";
      const message = job.primaryError ? `${job.primaryError.replace(/[.\s]+$/, "")}. Browser fallback also failed: ${failure}` : failure;
      job.controller.abort();
      this.publish({ status: "error", error: message });
      this.settle(job, "failed", message);
    }
  }
}

const voiceEngine = new VoicePlaybackEngine();
export function getVoicePlaybackState(): VoicePlaybackState { return voiceEngine.getState(); }
export function subscribeVoicePlaybackState(listener: (state: VoicePlaybackState) => void): () => void { return voiceEngine.subscribe(listener); }
export async function stopNaturalSpeech(): Promise<void> { voiceEngine.stop(); }
/** A new question interrupts preceding speech; use enqueueNaturalAI to append deliberate announcements. */
export function speakNaturalAI(text: string, onStart?: () => void, onEnd?: () => void, options = getVoiceOptions()): Promise<VoicePlaybackResult> {
  return voiceEngine.speak(text, options, onStart, onEnd);
}
export function enqueueNaturalAI(text: string, onStart?: () => void, onEnd?: () => void): Promise<VoicePlaybackResult> {
  return voiceEngine.enqueue(text, getVoiceOptions(), onStart, onEnd);
}
