// Natural AI Voice Engine — Tiered pipeline:
// Local Piper (DGX, on-prem GPU) -> Gemini Audio -> Google Neural2/Journey -> Curated Browser Natural Voices

import { getApiUrl } from "./api";

let activeAudioSource: AudioBufferSourceNode | null = null;
let activeAudioContext: AudioContext | null = null;

// Cache whether the local TTS backend is reachable so we don't eat a
// network round trip on every single utterance once we know it's down.
let localTtsAvailable: boolean | null = null;

async function tryLocalTTS(text: string, onStart?: () => void, onEnd?: () => void): Promise<boolean> {
  if (localTtsAvailable === false) return false;

  try {
    const res = await fetch(getApiUrl("/api/local-tts/speak"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      localTtsAvailable = false;
      return false;
    }

    localTtsAvailable = true;
    const arrayBuf = await res.arrayBuffer();

    onStart?.();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!activeAudioContext || activeAudioContext.state === "closed") {
      activeAudioContext = new AudioCtx();
    }
    if (activeAudioContext.state === "suspended") {
      await activeAudioContext.resume();
    }

    const audioBuffer = await activeAudioContext.decodeAudioData(arrayBuf);
    const source = activeAudioContext.createBufferSource();
    activeAudioSource = source;
    source.buffer = audioBuffer;
    source.connect(activeAudioContext.destination);
    source.onended = () => {
      if (activeAudioSource === source) activeAudioSource = null;
      onEnd?.();
    };
    source.start(0);
    return true;
  } catch (e) {
    console.warn("[NaturalVoice] Local Piper TTS unreachable, falling back to cloud/browser...", e);
    localTtsAvailable = false;
    return false;
  }
}

export async function stopNaturalSpeech() {
  if (activeAudioSource) {
    try {
      activeAudioSource.stop();
    } catch {}
    activeAudioSource = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export async function speakNaturalAI(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (!text || !text.trim()) return;
  await stopNaturalSpeech();

  // Tier 0: Local Piper TTS running on the DGX box. No internet, no API key.
  const usedLocal = await tryLocalTTS(text, onStart, onEnd);
  if (usedLocal) return;

  const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";

  // Tier 1: Gemini Audio API (Aoede/Kore natural voices)
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Aoede" }
                }
              }
            }
          })
        }
      );

      if (res.ok) {
        const data = await res.json();
        const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || "audio/wav";

        if (audioBase64) {
          onStart?.();
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!activeAudioContext || activeAudioContext.state === "closed") {
            activeAudioContext = new AudioCtx({ sampleRate: 24000 });
          }
          if (activeAudioContext.state === "suspended") {
            await activeAudioContext.resume();
          }

          const binaryStr = atob(audioBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

          let audioBuffer: AudioBuffer;
          if (mimeType.includes("pcm") || mimeType.includes("l16")) {
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
            audioBuffer = activeAudioContext.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);
          } else {
            audioBuffer = await activeAudioContext.decodeAudioData(bytes.buffer);
          }

          const source = activeAudioContext.createBufferSource();
          activeAudioSource = source;
          source.buffer = audioBuffer;
          source.connect(activeAudioContext.destination);
          source.onended = () => {
            if (activeAudioSource === source) activeAudioSource = null;
            onEnd?.();
          };
          source.start(0);
          return;
        }
      }
    } catch (e) {
      console.warn("[NaturalVoice] Gemini Audio TTS failed, fallback to Google Neural2...", e);
    }

    // Tier 2: Google Cloud Speech REST API (Neural2 / Journey natural human voices)
    try {
      const voiceCandidates = [
        { name: "en-US-Journey-F", ssmlGender: "FEMALE" },
        { name: "en-US-Neural2-F", ssmlGender: "FEMALE" },
        { name: "en-US-Wavenet-F", ssmlGender: "FEMALE" }
      ];

      for (const voice of voiceCandidates) {
        try {
          const res = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                input: { text },
                voice: { languageCode: "en-US", name: voice.name, ssmlGender: voice.ssmlGender },
                audioConfig: {
                  audioEncoding: "MP3",
                  speakingRate: 0.96,
                  pitch: 0.0,
                  volumeGainDb: 1.0
                }
              })
            }
          );

          if (res.ok) {
            const data = await res.json();
            if (data.audioContent) {
              onStart?.();
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (!activeAudioContext || activeAudioContext.state === "closed") {
                activeAudioContext = new AudioCtx();
              }
              if (activeAudioContext.state === "suspended") {
                await activeAudioContext.resume();
              }

              const binaryStr = atob(data.audioContent);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

              const audioBuffer = await activeAudioContext.decodeAudioData(bytes.buffer);
              const source = activeAudioContext.createBufferSource();
              activeAudioSource = source;
              source.buffer = audioBuffer;
              source.connect(activeAudioContext.destination);
              source.onended = () => {
                if (activeAudioSource === source) activeAudioSource = null;
                onEnd?.();
              };
              source.start(0);
              return;
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn("[NaturalVoice] Google Cloud TTS failed, fallback to Browser Natural Speech...", e);
    }
  }

  // Tier 3: Browser SpeechSynthesis with Curated Natural Voices
  if (typeof window !== "undefined" && window.speechSynthesis) {
    onStart?.();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    const naturalKeywords = [
      "google us english",
      "microsoft aria",
      "microsoft guy",
      "microsoft jenny",
      "natural",
      "siri",
      "samantha",
      "karen",
      "daniel"
    ];

    let chosenVoice: SpeechSynthesisVoice | null = null;
    for (const kw of naturalKeywords) {
      const match = voices.find((v) => v.name.toLowerCase().includes(kw));
      if (match) {
        chosenVoice = match;
        break;
      }
    }
    if (!chosenVoice) {
      chosenVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
    }

    if (chosenVoice) utterance.voice = chosenVoice;
    utterance.rate = 0.95; // Natural human conversational speed
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } else {
    onEnd?.();
  }
}
