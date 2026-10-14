/** Explicit microphone capture. Silence never submits an answer or releases its final words. */
import { apiFetch } from "./api";

export interface SpeechCaptureOptions {
  deviceId?: string;
  signal?: AbortSignal;
  maxDurationMs?: number;
  maxBytes?: number;
  silenceDurationMs?: number;
}
export type CaptureStopReason = "user" | "duration-limit" | "size-limit" | "cancelled";
export interface SpeechCaptureState {
  status: "idle" | "requesting" | "recording" | "stopping" | "stopped" | "cancelled" | "error";
  level: number;
  speaking: boolean;
  hasSpeech: boolean;
  silenceMs: number;
  durationMs: number;
  reason?: CaptureStopReason;
  error?: string;
}
export interface RecordedSpeech {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  voicedDurationMs: number;
  speechDetected: boolean;
  stopReason: CaptureStopReason;
}
export interface VoiceActivityState {
  speaking: boolean;
  hasSpeech: boolean;
  silenceMs: number;
  voicedDurationMs: number;
  level: number;
}

/** Local energy VAD with onset and release hysteresis, not a personality or confidence estimator. */
export class VoiceActivityDetector {
  private previousAt: number | undefined;
  private loudSince: number | undefined;
  private lastLoudAt: number | undefined;
  private speaking = false;
  private hasSpeech = false;
  private voicedDurationMs = 0;
  constructor(private threshold = 0.015, private onsetMs = 120, private releaseMs = 350) {}
  update(rms: number, at: number): VoiceActivityState {
    const duration = this.previousAt === undefined ? 0 : Math.max(0, Math.min(1000, at - this.previousAt));
    this.previousAt = at;
    const energy = Number.isFinite(rms) ? Math.max(0, rms) : 0;
    if (energy >= this.threshold) {
      this.loudSince ??= at;
      this.lastLoudAt = at;
      if (at - this.loudSince >= this.onsetMs) { this.speaking = true; this.hasSpeech = true; }
      if (this.speaking) this.voicedDurationMs += duration;
    } else {
      this.loudSince = undefined;
      if (this.lastLoudAt === undefined || at - this.lastLoudAt >= this.releaseMs) this.speaking = false;
    }
    return {
      speaking: this.speaking, hasSpeech: this.hasSpeech,
      silenceMs: this.lastLoudAt === undefined ? 0 : Math.max(0, at - this.lastLoudAt),
      voicedDurationMs: this.voicedDurationMs, level: Math.min(1, energy * 8),
    };
  }
}

function idleState(): SpeechCaptureState { return { status: "idle", level: 0, speaking: false, hasSpeech: false, silenceMs: 0, durationMs: 0 }; }
function captureAbort(): DOMException { return new DOMException("Microphone capture cancelled", "AbortError"); }
function permissionMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied. Allow microphone access in your browser, then try again.";
  if (name === "NotFoundError") return "No microphone is available. Connect a microphone and try again.";
  if (name === "NotReadableError") return "The microphone is busy or unavailable. Close other recording apps and try again.";
  if (name === "OverconstrainedError") return "The selected microphone is unavailable. Select another input device.";
  return error instanceof Error ? error.message : "Microphone capture could not start.";
}

export class MicrophoneCapture {
  private state = idleState();
  private listeners = new Set<(state: SpeechCaptureState) => void>();
  private stream: MediaStream | undefined;
  private recorder: MediaRecorder | undefined;
  private context: AudioContext | undefined;
  private input: MediaStreamAudioSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private meter: ReturnType<typeof setInterval> | undefined;
  private durationTimer: ReturnType<typeof setTimeout> | undefined;
  private finalizationTimer: ReturnType<typeof setTimeout> | undefined;
  private chunks: Blob[] = [];
  private bytes = 0;
  private startedAt = 0;
  private generation = 0;
  private vad = new VoiceActivityDetector();
  private voicedDurationMs = 0;
  private resultPromise: Promise<RecordedSpeech> | undefined;
  private resolveResult: ((result: RecordedSpeech) => void) | undefined;
  private rejectResult: ((error: Error) => void) | undefined;
  private removeAbort: (() => void) | undefined;
  private maxDurationMs: number;
  private maxBytes: number;
  readonly silenceDurationMs: number;

  constructor(private options: SpeechCaptureOptions = {}) {
    this.maxDurationMs = options.maxDurationMs ?? 180000;
    this.maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    this.silenceDurationMs = options.silenceDurationMs ?? 1800;
    if (!Number.isFinite(this.maxDurationMs) || this.maxDurationMs < 1000 || this.maxDurationMs > 600000) throw new RangeError("Capture duration must be between 1 second and 10 minutes.");
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 512 || this.maxBytes > 10 * 1024 * 1024) throw new RangeError("Capture size must be between 512 bytes and 10 MB.");
    if (!Number.isFinite(this.silenceDurationMs) || this.silenceDurationMs < 350) throw new RangeError("Silence indication must be at least 350 ms.");
  }

  getState(): SpeechCaptureState { return this.state; }
  subscribe(listener: (state: SpeechCaptureState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(value: Partial<SpeechCaptureState>): void {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) { try { listener(this.state); } catch { /* Views cannot hold the microphone open. */ } }
  }
  private release(): void {
    clearInterval(this.meter);
    clearTimeout(this.durationTimer);
    clearTimeout(this.finalizationTimer);
    this.removeAbort?.();
    this.removeAbort = undefined;
    this.input?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = undefined;
    this.input = undefined;
    this.analyser = undefined;
  }
  private fail(error: Error): void {
    const message = permissionMessage(error);
    this.publish({ status: "error", speaking: false, level: 0, error: message });
    if (this.recorder?.state !== "inactive") { try { this.recorder?.stop(); } catch { /* It may already have stopped. */ } }
    this.release();
    this.chunks = [];
    this.rejectResult?.(new Error(message));
    this.resolveResult = this.rejectResult = undefined;
  }

  async start(): Promise<void> {
    if (["requesting", "recording", "stopping"].includes(this.state.status)) throw new Error("Microphone capture is already running.");
    if (this.options.signal?.aborted) throw captureAbort();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const error = new Error("Microphone recording requires a supported browser on HTTPS or localhost.");
      this.publish({ status: "error", error: error.message });
      throw error;
    }
    const generation = ++this.generation;
    this.state = idleState();
    this.chunks = [];
    this.bytes = 0;
    this.voicedDurationMs = 0;
    this.vad = new VoiceActivityDetector();
    this.resultPromise = new Promise((resolve, reject) => { this.resolveResult = resolve; this.rejectResult = reject; });
    // Automatic limit/error events can precede a UI's stop() call.
    void this.resultPromise.catch(() => {});
    if (this.options.signal) {
      const abort = () => this.cancel();
      this.options.signal.addEventListener("abort", abort, { once: true });
      this.removeAbort = () => this.options.signal!.removeEventListener("abort", abort);
    }
    this.publish({ status: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(this.options.deviceId ? { deviceId: { exact: this.options.deviceId } } : {}) },
        video: false,
      });
      if (generation !== this.generation || this.options.signal?.aborted) {
        stream.getTracks().forEach(track => track.stop());
        throw captureAbort();
      }
      this.stream = stream;
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (generation === this.generation && this.state.status === "recording") this.fail(new Error("The microphone disconnected. Select an available input and record again."));
        }, { once: true });
      }
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new Error("Voice activity detection is unavailable in this browser.");
      this.context = new AudioCtor();
      if (this.context.state === "suspended") await this.context.resume();
      if (generation !== this.generation) throw captureAbort();
      this.input = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.input.connect(this.analyser);
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (generation !== this.generation || !["recording", "stopping"].includes(this.state.status) || !event.data.size) return;
        if (this.bytes + event.data.size > this.maxBytes) {
          this.fail(new Error("Recording exceeded the upload size limit. Shorten the answer and record it again."));
          return;
        }
        this.chunks.push(event.data);
        this.bytes += event.data.size;
        // Reserve room for the recorder's final packet, rather than cutting audio bytes.
        if (this.bytes >= this.maxBytes * 0.9 && this.state.status === "recording") void this.finish("size-limit");
      };
      recorder.onerror = () => {
        if (generation === this.generation && ["recording", "stopping"].includes(this.state.status)) this.fail(new Error("Microphone recording failed. Check the input device and try again."));
      };
      recorder.onstop = () => {
        if (generation !== this.generation || this.state.status === "error") return;
        const result: RecordedSpeech = {
          blob: new Blob(this.chunks, { type: recorder.mimeType || mimeType || "audio/webm" }),
          mimeType: recorder.mimeType || mimeType || "audio/webm",
          durationMs: Math.max(0, performance.now() - this.startedAt),
          voicedDurationMs: this.voicedDurationMs, speechDetected: this.state.hasSpeech,
          stopReason: this.state.reason || "user",
        };
        this.chunks = [];
        this.release();
        this.publish({ status: "stopped", speaking: false, level: 0, durationMs: result.durationMs });
        this.resolveResult?.(result);
        this.resolveResult = this.rejectResult = undefined;
      };
      this.startedAt = performance.now();
      recorder.start(250);
      this.publish({ status: "recording" });
      const samples = new Float32Array(this.analyser.fftSize);
      this.meter = setInterval(() => {
        if (generation !== this.generation || this.state.status !== "recording" || !this.analyser) return;
        this.analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const now = performance.now();
        const activity = this.vad.update(Math.sqrt(sum / samples.length), now);
        this.voicedDurationMs = activity.voicedDurationMs;
        this.publish({ level: activity.level, speaking: activity.speaking, hasSpeech: activity.hasSpeech,
          silenceMs: activity.silenceMs, durationMs: Math.max(0, now - this.startedAt) });
      }, 100);
      this.durationTimer = setTimeout(() => { void this.finish("duration-limit"); }, this.maxDurationMs);
    } catch (error) {
      if (generation !== this.generation) throw captureAbort();
      this.fail(error instanceof Error ? error : new Error("Microphone capture could not start."));
      throw new Error(permissionMessage(error));
    }
  }

  private finish(reason: CaptureStopReason): Promise<RecordedSpeech> {
    if (!this.resultPromise) return Promise.reject(new Error("Start microphone capture before stopping it."));
    if (this.state.status === "recording") {
      this.publish({ status: "stopping", reason, speaking: false });
      clearInterval(this.meter);
      clearTimeout(this.durationTimer);
      this.finalizationTimer = setTimeout(() => {
        if (this.state.status === "stopping") this.fail(new Error("Microphone recording did not finish. Record again or type your answer."));
      }, 10000);
      try { this.recorder!.stop(); } catch (error) { this.fail(error instanceof Error ? error : new Error("Recording could not finish.")); }
    } else if (this.state.status === "requesting") this.cancel();
    return this.resultPromise;
  }
  stop(): Promise<RecordedSpeech> { return this.finish("user"); }
  cancel(): void {
    if (["cancelled", "idle", "stopped", "error"].includes(this.state.status)) return;
    ++this.generation;
    if (this.recorder?.state !== "inactive") { try { this.recorder?.stop(); } catch { /* Already stopped. */ } }
    this.release();
    this.chunks = [];
    this.publish({ status: "cancelled", level: 0, speaking: false, reason: "cancelled" });
    this.resolveResult?.({ blob: new Blob(), mimeType: "audio/webm", durationMs: this.state.durationMs,
      voicedDurationMs: this.voicedDurationMs, speechDetected: false, stopReason: "cancelled" });
    this.resolveResult = this.rejectResult = undefined;
  }
}

/** Does not ask for permission; browser labels become available after an explicit capture start. */
export async function listMicrophoneDevices(): Promise<{ deviceId: string; label: string }[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === "audioinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` }));
}

export async function transcribeRecordedSpeech(recording: RecordedSpeech, options: { signal?: AbortSignal } = {}): Promise<{ text: string; source: string }> {
  if (options.signal?.aborted) throw captureAbort();
  if (recording.stopReason === "cancelled") throw captureAbort();
  if (!recording.speechDetected) throw new Error("No speech was detected. Check your microphone, or type your answer.");
  if (recording.blob.size < 512 || recording.blob.size > 10 * 1024 * 1024) throw new Error("Recorded audio must be between 512 bytes and 10 MB.");
  const bytes = new Uint8Array(await recording.blob.arrayBuffer());
  if (options.signal?.aborted) throw captureAbort();
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  const audio = btoa(chunks.join(""));
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await apiFetch("/api/voice/transcribe", {
      method: "POST", body: JSON.stringify({ audio, mimeType: recording.mimeType }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 503 ? "Speech recognition is not configured. Type your answer or configure Groq." : `Speech recognition returned HTTP ${response.status}. Try again or type your answer.`);
    const result = await response.json();
    if (options.signal?.aborted) throw captureAbort();
    if (typeof result.text !== "string" || typeof result.source !== "string") throw new Error("Speech recognition returned an invalid transcript.");
    if (!result.text.trim()) throw new Error("Speech recognition returned no words. Record again or type your answer.");
    return { text: result.text.trim(), source: result.source };
  } catch (error) {
    if (options.signal?.aborted) throw captureAbort();
    if (controller.signal.aborted) throw new Error("Speech recognition timed out. Try again or type your answer.");
    if (error instanceof TypeError) throw new Error("Cannot reach speech recognition. Check your connection, try again, or type your answer.");
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
