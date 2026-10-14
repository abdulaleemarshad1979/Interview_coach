/** Actual Orpheus synthesis benchmark. It cannot assess naturalness without listening. */
import fs from "node:fs/promises";
import path from "node:path";
import Groq from "groq-sdk";

const outputDirectory = path.resolve(process.env.VOICE_BENCHMARK_DIR || "docs/voice-benchmark");
const model = process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english";
const voices = ["hannah", "autumn", "diana"] as const;
const samples = [
  { id: "introduction", text: "Hello. Let's begin with your recent project. What problem did you solve, and which decisions did you make?" },
  { id: "technical-follow-up", text: "How did you handle token expiration and refresh? Explain what would happen if a refresh token were stolen." },
  { id: "behavioral-question", text: "Tell me about a disagreement in your team. How did you respond, and what changed as a result?" },
];
const requestedRuns = Number(process.env.VOICE_BENCHMARK_RUNS || 1);
const runs = Number.isInteger(requestedRuns) && requestedRuns >= 1 && requestedRuns <= 5 ? requestedRuns : 1;
const report: Record<string, unknown> = {
  observedAt: new Date().toISOString(), model, voices, runs, samples,
  providerSource: "https://console.groq.com/docs/text-to-speech/orpheus",
  status: "blocked", reason: "GROQ_API_KEY is not configured; no provider requests were made.",
  listeningEvaluation: "Pending human listening. Timing and WAV validity cannot establish naturalness or pronunciation quality.",
  results: [],
};
await fs.mkdir(outputDirectory, { recursive: true });

if (!process.env.GROQ_API_KEY) {
  await fs.writeFile(path.join(outputDirectory, "benchmark.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Voice benchmark blocked: configure GROQ_API_KEY on the server. No synthesis or listening result is claimed.");
  process.exitCode = 2;
} else {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 20000, maxRetries: 1 });
  const results: Record<string, unknown>[] = [];
  for (const voice of voices) {
    for (const sample of samples) {
      for (let run = 1; run <= runs; run++) {
        const started = performance.now();
        try {
          const response = await groq.audio.speech.create({ model, voice, input: sample.text, response_format: "wav" });
          const bytes = Buffer.from(await response.arrayBuffer());
          const latencyMs = Math.round(performance.now() - started);
          const wav = inspectWav(bytes);
          if (!wav) throw new Error("Invalid WAV response");
          const filename = `${voice}-${sample.id}-${run}.wav`;
          await fs.writeFile(path.join(outputDirectory, filename), bytes);
          results.push({ voice, sample: sample.id, run, status: "generated", latencyMs, bytes: bytes.length, ...wav, filename });
          console.log(`${voice}, ${sample.id}, run ${run}: ${latencyMs} ms; ${bytes.length} bytes.`);
        } catch (error) {
          const status = typeof error === "object" && error && "status" in error ? Number(error.status) || null : null;
          results.push({ voice, sample: sample.id, run, status: "failed", httpStatus: status, latencyMs: Math.round(performance.now() - started) });
          console.log(`${voice}, ${sample.id}, run ${run}: generation failed${status ? ` (HTTP ${status})` : ""}.`);
        }
      }
    }
  }
  report.status = results.every(result => result.status === "generated") ? "generated-listening-pending" : "partially-failed";
  delete report.reason;
  report.results = results;
  await fs.writeFile(path.join(outputDirectory, "benchmark.json"), JSON.stringify(report, null, 2) + "\n");
  if (results.some(result => result.status === "failed")) process.exitCode = 1;
}

function inspectWav(bytes: Buffer): { sampleRate: number; channels: number; durationSeconds: number | null } | null {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return null;
  let sampleRate = 0;
  let channels = 0;
  let byteRate = 0;
  let audioBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > bytes.length) return null;
    if (name === "fmt " && length >= 16) {
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      byteRate = bytes.readUInt32LE(start + 8);
    }
    if (name === "data") audioBytes += length;
    offset = start + length + (length % 2);
  }
  return sampleRate && channels && audioBytes ? { sampleRate, channels, durationSeconds: byteRate ? Math.round(audioBytes / byteRate * 1000) / 1000 : null } : null;
}
