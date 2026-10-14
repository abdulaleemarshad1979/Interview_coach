import { postMeeting } from "./meetingApi";

interface MicrophoneObserverOptions {
  roomCode: string;
  trackSid: string;
  microphone: MediaStreamTrack;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
}
export type MicrophoneObserverStop = (flush?: boolean) => Promise<void>;

/** Records only the participant's own published microphone, never a remote or mixed stream. */
export async function observeLocalMicrophone(options: MicrophoneObserverOptions): Promise<MicrophoneObserverStop> {
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support audio transcription. Use a recent Chrome, Edge, Firefox, or Safari release.");
  const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((format) => MediaRecorder.isTypeSupported(format));
  if (!mimeType) throw new Error("This browser cannot encode a supported transcription audio format.");
  const microphone = options.microphone.clone();
  const stream = new MediaStream([microphone]);
  const context = new AudioContext();
  await context.resume();
  if (context.state !== "running") {
    microphone.stop();
    await context.close();
    throw new Error("Audio analysis is paused by the browser. Enable the microphone again to start transcription.");
  }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let stopped = false;
  let captureStopped = false;
  let captureFinished = Promise.resolve();
  let closing: Promise<void> | undefined;
  let current: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let activeController: AbortController | undefined;
  let sending = false;
  let sendTask: Promise<void> | undefined;
  let captureStartedAt = 0;
  let lastTickAt = 0;
  let lastVoiceAt = 0;
  let voicedMs = 0;
  const pending: Array<{ blob: Blob; startedAt: string; endedAt: string; speakingSeconds: number; clientSegmentId: string }> = [];

  const sendNext = async () => {
    if (sending || stopped) return;
    sending = true;
    try {
      while (pending.length && !stopped) {
        const segment = pending.shift()!;
        options.onStatus("Transcribing your speech…");
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Unable to read microphone audio."));
          reader.readAsDataURL(segment.blob);
        });
        if (stopped) break;
        activeController = new AbortController();
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await postMeeting(`/${options.roomCode}/audio`, { ...segment, blob: undefined, audio: encoded, mimeType, trackSid: options.trackSid }, activeController.signal);
              break;
            } catch (error: any) {
              const retryable = error instanceof TypeError || ["PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_RATE_LIMIT", "AI_BUSY", "MEETING_SERVICE_FAILED"].includes(error?.code);
              if (!retryable || attempt === 2 || stopped || activeController.signal.aborted) throw error;
              await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
            }
          }
        } catch (error: any) {
          if (!stopped && error?.name !== "AbortError") options.onError(`Transcription failed: ${error.message || "Please retry."} Some speech may be missing from the report.`);
        } finally { activeController = undefined; }
      }
    } catch (error: any) {
      if (!stopped) options.onError(`Audio transcription could not continue: ${error?.message || "Please retry."}`);
    } finally { sending = false; if (!stopped) options.onStatus("Listening for speech"); }
  };
  const beginCapture = () => {
    if (stopped || captureStopped) return;
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 48000 });
    const chunks: BlobPart[] = [];
    captureStartedAt = Date.now(); lastTickAt = captureStartedAt; lastVoiceAt = 0; voicedMs = 0;
    let finished!: () => void;
    captureFinished = new Promise<void>((resolve) => { finished = resolve; });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (stopped) { finished(); return; }
      const endedAt = Date.now();
      const speechDuration = Math.min(voicedMs, endedAt - captureStartedAt) / 1000;
      const blob = new Blob(chunks, { type: mimeType });
      if (speechDuration >= 0.2 && blob.size >= 128 && blob.size <= 1_000_000) {
        if (pending.length >= 4) options.onError("Transcription is slower than the discussion. A speech segment was skipped; the report may be incomplete.");
        else {
          pending.push({ blob, startedAt: new Date(captureStartedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), speakingSeconds: speechDuration, clientSegmentId: crypto.randomUUID() });
          if (!sendTask) sendTask = sendNext().finally(() => { sendTask = undefined; });
        }
      }
      finished();
      if (!captureStopped) {
        try { beginCapture(); } catch { captureStopped = true; options.onError("Audio recording stopped unexpectedly. Disable and re-enable transcription to retry."); }
      }
    };
    recorder.onerror = () => { captureStopped = true; finished(); options.onError("The microphone audio recorder failed. Disable and re-enable transcription to retry."); };
    current = recorder;
    recorder.start();
  };
  try { beginCapture(); } catch (error) { microphone.stop(); source.disconnect(); analyser.disconnect(); await context.close(); throw error; }
  options.onStatus("Listening for speech");
  timer = setInterval(() => {
    if (stopped || current?.state !== "recording") return;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const now = Date.now();
    const elapsed = Math.min(200, now - lastTickAt);
    lastTickAt = now;
    if (Math.sqrt(energy / samples.length) > 0.018) { voicedMs += elapsed; lastVoiceAt = now; }
    // Each stopped recorder produces a complete independently decodable file.
    if ((voicedMs >= 200 && now - lastVoiceAt >= 800) || now - captureStartedAt >= (voicedMs >= 200 ? 10_000 : 4000)) current.stop();
  }, 60);
  return (flush = false) => {
    if (closing && flush) return closing;
    if (stopped) return Promise.resolve();
    captureStopped = true;
    if (timer) clearInterval(timer);
    if (!flush) { stopped = true; activeController?.abort(); pending.length = 0; }
    const finalCapture = captureFinished;
    if (current?.state === "recording") current.stop();
    closing = (async () => {
      if (flush) await finalCapture;
      microphone.stop(); source.disconnect(); analyser.disconnect(); await context.close();
      if (flush && !stopped) await sendTask;
      stopped = true;
      options.onStatus("Transcription paused");
    })();
    return closing;
  };
}
