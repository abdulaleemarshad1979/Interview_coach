/** Groq-first female speech engine. API credentials never enter the browser bundle. */
import { apiFetch } from "./api";
import { chunkSpeech } from "./speechChunks";

export type FemaleVoice = "hannah" | "autumn" | "diana";
export interface VoiceOptions {
  voice: FemaleVoice;
  rate: number;
}

const OPTION_KEY = "interview_voice_options_v1";
let playbackGeneration = 0;
let activeSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;
let pendingRequest: AbortController | null = null;

export function getVoiceOptions(): VoiceOptions {
  const fallback: VoiceOptions = { voice: "hannah", rate: 1 };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(OPTION_KEY) || "{}");
    return {
      voice: ["hannah", "autumn", "diana"].includes(stored.voice) ? stored.voice : fallback.voice,
      rate: Number.isFinite(stored.rate) ? Math.max(0.85, Math.min(1.15, stored.rate)) : fallback.rate,
    };
  } catch {
    return fallback;
  }
}

export function setVoiceOptions(options: Partial<VoiceOptions>): VoiceOptions {
  const previous = getVoiceOptions();
  const allowedVoices: FemaleVoice[] = ["hannah", "autumn", "diana"];
  const selected = options.voice && allowedVoices.includes(options.voice) ? options.voice : previous.voice;
  const rate = Number.isFinite(options.rate) ? Math.max(0.85, Math.min(1.15, options.rate!)) : previous.rate;
  const next: VoiceOptions = { voice: selected, rate };
  if (typeof localStorage !== "undefined") localStorage.setItem(OPTION_KEY, JSON.stringify(next));
  return next;
}

export async function stopNaturalSpeech(): Promise<void> {
  playbackGeneration++;
  pendingRequest?.abort();
  pendingRequest = null;
  if (activeSource) {
    try { activeSource.stop(); } catch { /* already finished */ }
    activeSource = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

async function playBuffer(bytes: ArrayBuffer, generation: number, rate: number): Promise<void> {
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) throw new Error("Web Audio is not available in this browser");
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioCtor();
  if (audioContext.state === "suspended") await audioContext.resume();
  if (generation !== playbackGeneration) return;
  const decoded = await audioContext.decodeAudioData(bytes);
  if (generation !== playbackGeneration) return;
  await new Promise<void>((resolve, reject) => {
    try {
      const source = audioContext!.createBufferSource();
      activeSource = source;
      source.buffer = decoded;
      source.playbackRate.value = rate;
      source.connect(audioContext!.destination);
      source.onended = () => {
        if (activeSource === source) activeSource = null;
        resolve();
      };
      source.start(0);
    } catch (e) { reject(e); }
  });
}

function fallbackSpeech(text: string, generation: number, onStart?: () => void, onEnd?: () => void): void {
  if (generation !== playbackGeneration) return;
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") { onEnd?.(); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("en"));
  const preferred = voices.find(v => /jenny|aria|samantha|karen|female|zira/i.test(v.name));
  if (preferred) utterance.voice = preferred;
  utterance.rate = getVoiceOptions().rate;
  utterance.onstart = () => { if (generation === playbackGeneration) onStart?.(); };
  let finished = false;
  const finish = () => {
    if (!finished && generation === playbackGeneration) { finished = true; onEnd?.(); }
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

/** Called by both InterviewPage and GroupDiscussionPage. Stops previous speech on every new call. */
export async function speakNaturalAI(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
  await stopNaturalSpeech();
  const generation = playbackGeneration;
  const clean = text?.trim() || "";
  if (!clean) { onEnd?.(); return; }
  const options = getVoiceOptions();
  let started = false;
  let completed = 0;
  const parts = chunkSpeech(clean);
  try {
    for (const part of parts) {
      if (generation !== playbackGeneration) return;
      const controller = new AbortController();
      pendingRequest = controller;
      const response = await apiFetch("/api/voice/synthesize", {
        method: "POST",
        body: JSON.stringify({ text: part, voice: options.voice }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TTS service returned HTTP ${response.status}`);
      const audio = await response.arrayBuffer();
      if (generation !== playbackGeneration) return;
      if (!started) { onStart?.(); started = true; }
      await playBuffer(audio, generation, options.rate);
      completed++;
    }
    if (generation === playbackGeneration) onEnd?.();
  } catch (err) {
    if (generation !== playbackGeneration) return;
    console.warn("[Voice] Groq TTS unavailable; trying local speech service", err);
    try {
      for (const part of parts.slice(completed)) {
        if (generation !== playbackGeneration) return;
        const controller = new AbortController();
        pendingRequest = controller;
        const response = await apiFetch("/api/local-tts/speak", {
          method: "POST", body: JSON.stringify({ text: part }), signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Local TTS returned HTTP ${response.status}`);
        const audio = await response.arrayBuffer();
        if (generation !== playbackGeneration) return;
        if (!started) { onStart?.(); started = true; }
        await playBuffer(audio, generation, options.rate);
        completed++;
      }
      if (generation === playbackGeneration) onEnd?.();
    } catch (fallbackError) {
      if (generation !== playbackGeneration) return;
      console.warn("[Voice] Local TTS unavailable; using browser speech", fallbackError);
      fallbackSpeech(parts.slice(completed).join(" "), generation, started ? undefined : onStart, onEnd);
    }
  } finally {
    if (generation === playbackGeneration) pendingRequest = null;
  }
}
