import type { DeliveryMetrics, DeliveryReport, InterviewTurn } from '../../src/lib/interviewTypes';

export const DELIVERY_WEIGHT = 0.2;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const FILLERS = /\b(?:um+|uh+|erm|er|ah+|you know|i mean|basically|actually|sort of|kind of)\b/gi;
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Validates client-reported metrics: untrusted, so every field is bounded and anything malformed is dropped. */
export function sanitizeDelivery(value: unknown): DeliveryMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, any>;
  const n = (x: unknown, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : null;
  const durationMs = n(v.durationMs, 600000), speechMs = n(v.speechMs, 600000), silenceMs = n(v.silenceMs, 600000), longPauses = n(v.longPauses, 500);
  if (durationMs === null || speechMs === null || silenceMs === null || longPauses === null) return undefined;
  const out: DeliveryMetrics = { durationMs, speechMs, silenceMs, longPauses: Math.round(longPauses) };
  const c = v.camera;
  if (c && typeof c === 'object') {
    const samples = n(c.samples, 10000), face = n(c.faceRatio, 1), eye = n(c.eyeContactRatio, 1), steady = n(c.steadiness, 1);
    if (samples !== null && samples >= 5 && face !== null && eye !== null && steady !== null) out.camera = { samples: Math.round(samples), faceRatio: face, eyeContactRatio: eye, steadiness: steady };
  }
  return out;
}

/** Piecewise-linear 0-100 score: full marks inside [lo, hi], falling to 0 at the outer bounds. */
const band = (x: number, zero1: number, lo: number, hi: number, zero2: number) =>
  x >= lo && x <= hi ? 100 : x < lo ? clamp(((x - zero1) / (lo - zero1)) * 100) : clamp(((zero2 - x) / (zero2 - hi)) * 100);

const weighted = (parts: Array<[number | null, number]>) => {
  const present = parts.filter((part): part is [number, number] => part[0] !== null);
  const total = present.reduce((sum, [, weight]) => sum + weight, 0);
  return total ? Math.round(present.reduce((sum, [score, weight]) => sum + score * weight, 0) / total) : null;
};

export function computeDelivery(turns: InterviewTurn[]): DeliveryReport {
  const answers = turns.filter(turn => turn.role === 'candidate' && turn.delivery);
  const voice = answers.filter(turn => turn.delivery!.speechMs >= 2000 && wordCount(turn.text) >= 5);
  const cam = answers.filter(turn => turn.delivery!.camera);
  const notes: string[] = [];
  let wordsPerMinute: number | null = null, fillersPer100Words: number | null = null;
  let pacing: number | null = null, fluency: number | null = null, hesitation: number | null = null;
  if (voice.length) {
    const words = voice.reduce((sum, turn) => sum + wordCount(turn.text), 0);
    const speechMin = voice.reduce((sum, turn) => sum + turn.delivery!.speechMs, 0) / 60000;
    const fillers = voice.reduce((sum, turn) => sum + (turn.text.match(FILLERS)?.length || 0), 0);
    const duration = voice.reduce((sum, turn) => sum + turn.delivery!.durationMs, 0);
    const silence = voice.reduce((sum, turn) => sum + turn.delivery!.silenceMs, 0);
    wordsPerMinute = Math.round(words / Math.max(speechMin, 1 / 60));
    fillersPer100Words = Math.round((fillers / Math.max(words, 1)) * 1000) / 10;
    pacing = Math.round(band(wordsPerMinute, 60, 115, 170, 230));
    fluency = Math.round(clamp(100 - fillersPer100Words * 10));
    // Natural speech is ~15-20% silence; hesitation scoring starts penalising above 25%.
    hesitation = Math.round(clamp(100 - ((silence / Math.max(duration, 1)) - 0.25) * 200));
    notes.push(`Pace ${wordsPerMinute} words/min (target 115–170).`);
    if (fillersPer100Words > 3) notes.push(`${fillersPer100Words} filler words per 100 words; pause silently instead.`);
    if (hesitation < 60) notes.push('Long silences during answers suggest hesitation; outline your answer before speaking.');
  }
  let eyeContact: number | null = null, presence: number | null = null;
  if (cam.length) {
    const samples = cam.reduce((sum, turn) => sum + turn.delivery!.camera!.samples, 0);
    const avg = (pick: (c: NonNullable<DeliveryMetrics['camera']>) => number) => cam.reduce((sum, turn) => sum + pick(turn.delivery!.camera!) * turn.delivery!.camera!.samples, 0) / samples;
    eyeContact = Math.round(avg(c => c.eyeContactRatio) * 100);
    presence = Math.round(avg(c => c.faceRatio * (0.5 + 0.5 * c.steadiness)) * 100);
    if (eyeContact < 50) notes.push('Looking toward the camera more often would read as stronger engagement.');
    if (presence < 70) notes.push('Keep your face centred and steady in frame while answering.');
  }
  const score = weighted([[eyeContact, 0.3], [presence, 0.15], [pacing, 0.2], [fluency, 0.2], [hesitation, 0.15]]);
  if (!voice.length && !cam.length) notes.push('No camera or voice timing was captured, so delivery was not scored.');
  return { score, weight: score === null ? 0 : DELIVERY_WEIGHT, components: { eyeContact, presence, pacing, fluency, hesitation },
    wordsPerMinute, fillersPer100Words, answersWithCamera: cam.length, answersWithVoice: voice.length, notes };
}

export function blendOverall(content: number | null, delivery: DeliveryReport): number | null {
  if (content === null) return null;
  return delivery.score === null ? content : Math.round(content * (1 - delivery.weight) + delivery.score * delivery.weight);
}
