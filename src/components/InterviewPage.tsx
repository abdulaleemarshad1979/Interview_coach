import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Play,
  Check,
  Award,
  Loader2,
  ArrowRight,
  TrendingUp,
  Volume2,
  VolumeX,
  HelpCircle,
  Clock,
  AlertCircle,
  FileCode,
  PenTool
} from "lucide-react";
import { InterviewQuestion, AnswerFeedback, StudentProfile, FullAnalysisResult, Scorecard } from "../types";
import { supabase } from "../lib/supabaseClient";
import { getApiUrl, getWsUrl } from "../lib/api";

interface InterviewPageProps {
  studentProfile: StudentProfile;
  analysisResult: FullAnalysisResult | null;
  interviewQuestions: InterviewQuestion[];
  onInterviewComplete: (scorecard: Scorecard) => void;
  onNavigate: (view: string) => void;
}

export default function InterviewPage({ studentProfile, analysisResult, interviewQuestions, onInterviewComplete, onNavigate }: InterviewPageProps) {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [webcamActive, setWebcamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isManualEdit, setIsManualEdit] = useState(false);

  // Dynamic eye gaze, posture, facial expression, and head position states
  const [eyeGazeStatus, setEyeGazeStatus] = useState<"STABLE ENGAGED" | "LOOKING AWAY" | "DISTRACTED" | "OFFLINE">("OFFLINE");
  const [postureStatus, setPostureStatus] = useState<"ALIGNED" | "SLOUCHING" | "LEANING" | "OFFLINE">("OFFLINE");
  const [expressionStatus, setExpressionStatus] = useState<"CONFIDENT" | "NEUTRAL" | "SMILING" | "TENSE" | "OFFLINE">("OFFLINE");
  const [headStatus, setHeadStatus] = useState<"CENTERED" | "TURNED LEFT" | "TURNED RIGHT" | "TILTED" | "MOVING" | "OFFLINE">("OFFLINE");

  // Track raw counts of states for final turn evaluation
  const [gazeStats, setGazeStats] = useState({ stable: 0, lookingAway: 0, distracted: 0 });
  const [postureStats, setPostureStats] = useState({ aligned: 0, slouching: 0, leaning: 0 });
  const [expressionStats, setExpressionStats] = useState({ confident: 0, neutral: 0, smiling: 0, tense: 0 });
  const [headStats, setHeadStats] = useState({ centered: 0, turnedLeft: 0, turnedRight: 0, tilted: 0, moving: 0 });

  // Voice output (TTS) states
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"direct" | "proxy" | "fallback" | "connecting">("connecting");

  // Voice-to-voice mode: auto-starts mic after AI speaks
  const [voiceInterviewMode, setVoiceInterviewMode] = useState(false);
  const [showTapToHear, setShowTapToHear] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  // Live Speech-to-Speech Conversation logs & helpers
  interface ChatMessage {
    sender: "candidate" | "ai";
    text: string;
    timestamp: number;
  }
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [aiTextAccumulated, setAiTextAccumulated] = useState("");
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);

  const updateConversationHistory = (sender: "candidate" | "ai", text: string) => {
    setConversationHistory((prev) => {
      const now = Date.now();
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.sender === sender && (now - lastMsg.timestamp < 6000)) {
        return [
          ...prev.slice(0, -1),
          { ...lastMsg, text, timestamp: now }
        ];
      } else {
        return [
          ...prev,
          { sender, text, timestamp: now }
        ];
      }
    });
  };

  // Audio unlock ref for mobile browsers (iOS/Android require a user gesture)
  const audioUnlockedRef = useRef<boolean>(false);
  const unlockAudioContextRef = useRef<AudioContext | null>(null);
  const ttsHeartbeatRef = useRef<any>(null);
  const autoRecordTimerRef = useRef<any>(null);

  // Smoothing queues for face tracking
  const gazeHistoryRef = useRef<number[]>([]);
  const mouthHistoryRef = useRef<number[]>([]);
  const browHistoryRef = useRef<number[]>([]);
  const yawHistoryRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);

  // Face detection debounce: only go OFFLINE after N consecutive absent frames
  const faceAbsentCountRef = useRef<number>(0);
  const faceDetectedCountRef = useRef<number>(0);
  const FACE_ABSENT_THRESHOLD = 4; // frames before marking OFFLINE
  const FACE_DETECT_THRESHOLD = 2; // frames before marking ONLINE

  // Helper to push and compute average for smoothing
  const pushAndAverage = (historyRef: React.MutableRefObject<number[]>, val: number, maxLen = 8) => {
    historyRef.current.push(val);
    if (historyRef.current.length > maxLen) {
      historyRef.current.shift();
    }
    return historyRef.current.reduce((a, b) => a + b, 0) / historyRef.current.length;
  };

  // Evaluation states
  const [evaluating, setEvaluating] = useState(false);
  const [feedbacks, setFeedbacks] = useState<AnswerFeedback[]>([]);
  const [currentFeedback, setCurrentFeedback] = useState<AnswerFeedback | null>(null);
  const [reportCompiling, setReportCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real audio analysis stats
  const [pitchVariance, setPitchVariance] = useState<number>(80);
  const [audioClarity, setAudioClarity] = useState<number>(85);
  const [speakingPace, setSpeakingPace] = useState<number>(130);

  // References for dynamic audio analytics calculation
  const speechRmsListRef = useRef<number[]>([]);
  const noiseRmsListRef = useRef<number[]>([]);
  const pitchFrequenciesRef = useRef<number[]>([]);
  const transcriptRef = useRef<string>("");

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const visualizerStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<any>(null);
  const micStreamerContextRef = useRef<AudioContext | null>(null);
  const micStreamerScriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  const activeQuestion = interviewQuestions[currentQuestionIdx];

  const playAudioChunk = (base64PCM: string) => {
    if (isVoiceMuted) return;
    if (!audioPlayerRef.current) {
      const AudioPlayerClass = class {
        private audioCtx: AudioContext | null = null;
        private nextPlayTime: number = 0;
        private onSpeakingChange: ((speaking: boolean) => void) | null = null;
        private activeTimers: any[] = [];

        constructor(onSpeakingChange: (speaking: boolean) => void) {
          let ctx = unlockAudioContextRef.current;
          if (!ctx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            ctx = new AudioContextClass({ sampleRate: 24000 });
            unlockAudioContextRef.current = ctx;
          }
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => { });
          }
          this.audioCtx = ctx;
          this.onSpeakingChange = onSpeakingChange;
        }

        public playChunk(base64Data: string) {
          if (!this.audioCtx) return;
          try {
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768.0;
            }

            const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);

            const source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioCtx.destination);

            const currentTime = this.audioCtx.currentTime;
            if (this.nextPlayTime < currentTime) {
              this.nextPlayTime = currentTime;
            }
            source.start(this.nextPlayTime);

            const duration = audioBuffer.duration;
            const delay = (this.nextPlayTime - currentTime) * 1000;

            this.onSpeakingChange?.(true);
            const startTimer = setTimeout(() => {
              this.onSpeakingChange?.(true);
            }, delay);
            const endTimer = setTimeout(() => {
              if (this.audioCtx && this.audioCtx.currentTime >= this.nextPlayTime - 0.05) {
                this.onSpeakingChange?.(false);
              }
            }, delay + duration * 1000);

            this.activeTimers.push(startTimer, endTimer);
            this.nextPlayTime += duration;
          } catch (err) {
            console.error("Failed to play PCM chunk", err);
          }
        }

        public stop() {
          this.activeTimers.forEach(t => clearTimeout(t));
          this.activeTimers = [];
          this.audioCtx = null;
          this.onSpeakingChange?.(false);
        }
      };
      audioPlayerRef.current = new AudioPlayerClass(setIsAISpeaking);
    }
    audioPlayerRef.current.playChunk(base64PCM);
  };

  const connectVoiceSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      audioPlayerRef.current = null;
    }

    setVoiceMode("connecting");

    const isSecure = window.location.protocol === "https:";
    const wsProtocol = isSecure ? "wss" : "ws";
    const host = window.location.host;
    let socketUrl = getWsUrl("/ws/interview");

    // Direct Google Gemini Live connection if key is present (allows low-latency client-side WebSockets in all environments)
    const directKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
    const forceLocal = (import.meta as any).env?.VITE_FORCE_LOCAL_VOICE === "true";
    if (directKey && !forceLocal) {
      console.log("Connecting directly to Google Gemini Live API from browser...");
      socketUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${directKey}`;
      setVoiceMode("direct");
    }

    try {
      const ws = new WebSocket(socketUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("Interview voice socket connected:", socketUrl);
        if (socketUrl.includes("generativelanguage.googleapis.com")) {
          const setupMsg = {
            setup: {
              model: "models/gemini-2.0-flash-exp",
              generationConfig: {
                responseModalities: ["AUDIO", "TEXT"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: "Aoede"
                    }
                  }
                }
              },
              systemInstruction: {
                parts: [
                  {
                    text: `You are a warm, empathetic, conversational, and highly professional mock technical interviewer.
Greet the candidate briefly, and ask them: "${activeQuestion.text}".
Converse naturally and speak in a human-like tone.`
                  }
                ]
              }
            }
          };
          ws.send(JSON.stringify(setupMsg));
        } else {
          ws.send(JSON.stringify({ type: "init" }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "ready") {
            if (payload.status === "Live Voice-to-Voice Active") {
              setVoiceMode("proxy");
            } else {
              setVoiceMode("fallback");
            }
          }

          if (payload.serverContent?.modelTurn?.parts) {
            payload.serverContent.modelTurn.parts.forEach((part: any) => {
              if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                playAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                const textChunk = part.text;
                setAiTextAccumulated((prev) => {
                  const newVal = prev + textChunk;
                  updateConversationHistory("ai", newVal);
                  return newVal;
                });
              }
            });
          }
          if (payload.serverContent?.turnComplete) {
            setAiTextAccumulated("");
          }
          if (payload.type === "audio_chunk") {
            playAudioChunk(payload.data);
          }
          if (payload.type === "text_chunk" && payload.text) {
            const textChunk = payload.text;
            setAiTextAccumulated((prev) => {
              const newVal = prev + textChunk;
              updateConversationHistory("ai", newVal);
              return newVal;
            });
          }
          if (payload.type === "turn_complete") {
            setAiTextAccumulated("");
          }
        } catch (e) {
          console.error("Error reading socket stream chunk:", e);
        }
      };

      ws.onclose = () => {
        console.log("Interview voice socket closed. Activating fallback.");
        setVoiceMode("fallback");
      };

      ws.onerror = (err) => {
        console.error("Interview voice socket error:", err);
        setVoiceMode("fallback");
      };
    } catch (e) {
      console.error("Failed to connect voice socket:", e);
    }
  };

  const setupMicAudioStreamer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);

      scriptNode.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        const binary = String.fromCharCode(...new Uint8Array(pcm16.buffer));
        const base64 = btoa(binary);

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          if (socketRef.current.url.includes("generativelanguage.googleapis.com")) {
            socketRef.current.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [
                  {
                    mimeType: "audio/pcm",
                    data: base64
                  }
                ]
              }
            }));
          } else {
            socketRef.current.send(JSON.stringify({
              type: "audio_input",
              data: base64
            }));
          }
        }
      };

      source.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);

      micStreamerContextRef.current = audioCtx;
      micStreamerScriptNodeRef.current = scriptNode;
    } catch (err) {
      console.error("Failed to setup microphone audio streamer:", err);
    }
  };

  // Unlock AudioContext on mobile — must be called from a user gesture handler
  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass({ sampleRate: 24000 });
        unlockAudioContextRef.current = ctx;
        // Play a silent buffer to unlock the audio pipeline
        const buffer = ctx.createBuffer(1, 1, 24000);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        ctx.resume().then(() => {
          audioUnlockedRef.current = true;
          setShowTapToHear(false);
          console.log("AudioContext unlocked for mobile TTS.");
        });
      }
    } catch (e) {
      console.warn("Audio unlock failed:", e);
    }
  };

  // Natural voice TTS — uses Gemini's built-in TTS (same API key, genuinely natural voices)
  // Voice quality ladder: Gemini TTS → Google Cloud TTS → Browser SpeechSynthesis
  const speakText = async (text: string) => {
    if (isVoiceMuted) return;

    const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";

    // Clear any existing keep-alive heartbeat
    if (ttsHeartbeatRef.current) {
      clearInterval(ttsHeartbeatRef.current);
      ttsHeartbeatRef.current = null;
    }

    // ─── Tier 1: Gemini 2.5 Flash TTS (most natural, same API key) ─────────────
    if (geminiKey) {
      try {
        setIsAISpeaking(true);

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
                    prebuiltVoiceConfig: {
                      // Aoede = warm female, Kore = confident female, Charon = deep male
                      voiceName: "Aoede"
                    }
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
            let audioCtx = unlockAudioContextRef.current;
            if (!audioCtx) {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioCtx = new AudioContextClass({ sampleRate: 24000 });
              unlockAudioContextRef.current = audioCtx;
            }
            if (audioCtx.state === "suspended") await audioCtx.resume();

            const binaryStr = atob(audioBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            let audioBuffer: AudioBuffer;
            if (mimeType.includes("pcm") || mimeType.includes("l16")) {
              // Raw PCM int16 → float32
              const int16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
              audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);
            } else {
              audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
            }

            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.onended = () => {
              setIsAISpeaking(false);
            };
            source.start(0);
            console.log("[TTS] Playing via Gemini 2.5 Flash TTS — Aoede voice");
            return;
          }
        }
      } catch (err) {
        console.warn("[TTS] Gemini TTS failed, trying Google Cloud TTS:", err);
        setIsAISpeaking(false);
      }
    }

    // ─── Tier 2: Google Cloud TTS REST API (Neural2/Journey voices) ─────────────
    if (geminiKey) {
      try {
        setIsAISpeaking(true);
        const voiceCandidates = [
          { name: "en-US-Journey-F", ssmlGender: "FEMALE" },
          { name: "en-US-Neural2-F", ssmlGender: "FEMALE" },
          { name: "en-US-Wavenet-F", ssmlGender: "FEMALE" },
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
                    speakingRate: 0.97,
                    pitch: -1.0,
                    volumeGainDb: 1.0,
                    effectsProfileId: ["headphone-class-device"],
                  },
                })
              }
            );

            if (res.ok) {
              const data = await res.json();
              if (data.audioContent) {
                let audioCtx = unlockAudioContextRef.current;
                if (!audioCtx) {
                  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                  audioCtx = new AudioContextClass();
                  unlockAudioContextRef.current = audioCtx;
                }
                if (audioCtx.state === "suspended") await audioCtx.resume();

                const binaryStr = atob(data.audioContent);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

                const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                source.onended = () => { setIsAISpeaking(false); };
                source.start(0);
                console.log(`[TTS] Playing via Google Cloud TTS — ${voice.name}`);
                return;
              }
            }
          } catch { /* try next */ }
        }
      } catch (err) {
        console.warn("[TTS] Google Cloud TTS also failed:", err);
        setIsAISpeaking(false);
      }
    }

    // ─── Tier 3: Browser SpeechSynthesis fallback ────────────────────────────────
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (!audioUnlockedRef.current) {
      setShowTapToHear(true);
      return;
    }

    if (unlockAudioContextRef.current && unlockAudioContextRef.current.state === "suspended") {
      unlockAudioContextRef.current.resume().catch(() => { });
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();

      const premiumVoiceKeywords = ["google us english", "microsoft aria", "microsoft guy", "natural", "siri", "apple"];
      let selectedVoice: SpeechSynthesisVoice | null = null;
      for (const keyword of premiumVoiceKeywords) {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes(keyword) && v.lang.startsWith("en")) || null;
        if (selectedVoice) break;
      }
      if (!selectedVoice) selectedVoice = voices.find(v => (v.name.toLowerCase().includes("google") || v.name.toLowerCase().includes("microsoft")) && v.lang.startsWith("en")) || null;
      if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith("en")) || null;

      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 0.92;
      utterance.pitch = 0.95;

      utterance.onstart = () => {
        setIsAISpeaking(true);
        ttsHeartbeatRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
          else { clearInterval(ttsHeartbeatRef.current); ttsHeartbeatRef.current = null; }
        }, 14000);
      };
      utterance.onend = () => { setIsAISpeaking(false); if (ttsHeartbeatRef.current) { clearInterval(ttsHeartbeatRef.current); ttsHeartbeatRef.current = null; } };
      utterance.onerror = () => { setIsAISpeaking(false); if (ttsHeartbeatRef.current) { clearInterval(ttsHeartbeatRef.current); ttsHeartbeatRef.current = null; } };

      // Bind to window to prevent garbage collection in Chrome mid-speech
      (window as any).activeUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Browser TTS error:", e);
      setIsAISpeaking(false);
    }
  };






  // 1. Setup speech recognition, camera, preload browser voices, and global audio unlock
  useEffect(() => {
    setupSpeechRecognition();
    setupWebcam();

    // Global audio unlock: first user interaction on mobile will unlock the audio pipeline
    const handleFirstInteraction = () => {
      unlockAudio();
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
    };
    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("touchstart", handleFirstInteraction);

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
        document.removeEventListener("click", handleFirstInteraction);
        document.removeEventListener("touchstart", handleFirstInteraction);
        if (ttsHeartbeatRef.current) clearInterval(ttsHeartbeatRef.current);
        if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
        cleanupStreams();
        window.speechSynthesis.cancel();
      };
    }

    return () => {
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
      if (ttsHeartbeatRef.current) clearInterval(ttsHeartbeatRef.current);
      if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
      cleanupStreams();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // 1b. Automatically speak the question when it changes or when the interview starts
  useEffect(() => {
    if (interviewQuestions.length > 0 && !currentFeedback) {
      const activeQ = interviewQuestions[currentQuestionIdx];
      if (activeQ) {
        connectVoiceSocket();

        // Always speak the question using Google Cloud TTS (natural Neural2/Journey voice)
        // The WebSocket handles real-time convo; TTS handles reliable question delivery
        const speakTimer = setTimeout(() => {
          speakText(activeQ.text);
        }, 800);
        return () => clearTimeout(speakTimer);
      }
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.stop();
        audioPlayerRef.current = null;
      }
    };
  }, [currentQuestionIdx, interviewQuestions, currentFeedback]);

  // 1c. Suspend / resume microphone recording to prevent audio output blockage on mobile devices
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isAISpeaking) {
      console.log("AI is speaking. Temporarily suspending mic recording to allow audio output...");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) { }
      }
      if (micStreamerContextRef.current && micStreamerContextRef.current.state === "running") {
        micStreamerContextRef.current.suspend().catch(() => { });
      }
      if (audioContextRef.current && audioContextRef.current.state === "running") {
        audioContextRef.current.suspend().catch(() => { });
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      if (visualizerStreamRef.current) {
        visualizerStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
    } else {
      console.log("AI finished speaking. Resuming mic recording...");
      if (micStreamerContextRef.current && micStreamerContextRef.current.state === "suspended") {
        micStreamerContextRef.current.resume().catch(() => { });
      }
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => { });
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      if (visualizerStreamRef.current) {
        visualizerStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      if (isRecording && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) { }
      }
      // Voice-to-voice mode: auto-start recording 600ms after AI finishes speaking
      if (voiceInterviewMode && !currentFeedback && !isRecording) {
        if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
        autoRecordTimerRef.current = setTimeout(() => {
          if (!isRecordingRef.current) {
            startRecording(true);
          }
        }, 600);
      }
    }
  }, [isAISpeaking]);

  // 1c. Speak the feedback evaluation overview when it is received
  useEffect(() => {
    if (currentFeedback) {
      const textToSpeak = `Round completed. You scored ${currentFeedback.score} out of 100. Feedback summary: ${currentFeedback.speechFeedback}`;
      const speechTimer = setTimeout(() => {
        speakText(textToSpeak);
      }, 500);
      return () => clearTimeout(speechTimer);
    }
  }, [currentFeedback, isVoiceMuted]);

  // 1d. Auto-advance after feedback finishes speaking (Hands-Free mode)
  useEffect(() => {
    if (voiceInterviewMode && currentFeedback && !isAISpeaking) {
      setAutoAdvanceCountdown(5);
      const interval = setInterval(() => {
        setAutoAdvanceCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            handleNextQuestion();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isAISpeaking, currentFeedback, voiceInterviewMode]);

  // 2. Timer effect during recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const [cameraBrightness, setCameraBrightness] = useState<number>(100);

  const analyzeCameraFrame = () => {
    if (!videoRef.current || !webcamActive) {
      return { brightness: 0, motion: 0, centroidX: 0.5, centroidY: 0.5 };
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 60;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { brightness: 100, motion: 0, centroidX: 0.5, centroidY: 0.5 };

      // Draw the video frame to a small canvas
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let totalLuminance = 0;
      let sumX = 0;
      let sumY = 0;
      let luminanceWeightSum = 0;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalLuminance += lum;

          if (lum > 40) { // filter out background noise/darkness
            sumX += x * lum;
            sumY += y * lum;
            luminanceWeightSum += lum;
          }
        }
      }

      const numPixels = data.length / 4;
      const avgBrightness = totalLuminance / numPixels;

      const centroidX = luminanceWeightSum > 0 ? (sumX / luminanceWeightSum) / canvas.width : 0.5;
      const centroidY = luminanceWeightSum > 0 ? (sumY / luminanceWeightSum) / canvas.height : 0.5;

      let motionDiff = 0;
      if (prevFrameRef.current && prevFrameRef.current.length === data.length) {
        let diffSum = 0;
        const step = 8; // sample pixels for performance
        let count = 0;
        for (let i = 0; i < data.length; i += step * 4) {
          const rDiff = Math.abs(data[i] - prevFrameRef.current[i]);
          const gDiff = Math.abs(data[i + 1] - prevFrameRef.current[i + 1]);
          const bDiff = Math.abs(data[i + 2] - prevFrameRef.current[i + 2]);
          diffSum += (rDiff + gDiff + bDiff) / 3;
          count++;
        }
        motionDiff = diffSum / count;
      }

      prevFrameRef.current = new Uint8ClampedArray(data);

      return { brightness: avgBrightness, motion: motionDiff, centroidX, centroidY };
    } catch (e) {
      return { brightness: 100, motion: 0, centroidX: 0.5, centroidY: 0.5 }; // CORS fallback
    }
  };

  // 3. Dynamic eye gaze, posture, expression & head position tracking from camera frame
  useEffect(() => {
    if (!webcamActive) {
      setEyeGazeStatus("OFFLINE");
      setPostureStatus("OFFLINE");
      setExpressionStatus("OFFLINE");
      setHeadStatus("OFFLINE");
      setCameraBrightness(0);
      return;
    }

    let faceMeshInstance: any = null;
    let active = true;
    let frameId: number | null = null;
    let fallbackInterval: any = null;
    let pollTimer: any = null;

    // Reset debounce counters when webcam comes online
    faceAbsentCountRef.current = 0;
    faceDetectedCountRef.current = 0;

    const initFaceMesh = (FaceMesh: any) => {
      console.log("Initializing MediaPipe Face Mesh model pipeline...");
      try {
        faceMeshInstance = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMeshInstance.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.45,
          minTrackingConfidence: 0.45
        });

        faceMeshInstance.onResults((results: any) => {
          if (!active) return;

          // Measure average brightness
          const metrics = analyzeCameraFrame();
          setCameraBrightness(metrics.brightness);

          // Lowered brightness threshold: 8 (was 15) — most cameras have ambient light
          if (metrics.brightness < 8) {
            faceAbsentCountRef.current += 1;
            if (faceAbsentCountRef.current >= FACE_ABSENT_THRESHOLD) {
              setEyeGazeStatus("OFFLINE");
              setPostureStatus("OFFLINE");
              setExpressionStatus("OFFLINE");
              setHeadStatus("OFFLINE");
            }
            return;
          }

          const landmarks = results.multiFaceLandmarks?.[0];
          if (!landmarks) {
            // No face detected — increment absent counter, only go OFFLINE after threshold
            faceAbsentCountRef.current += 1;
            faceDetectedCountRef.current = 0;
            if (faceAbsentCountRef.current >= FACE_ABSENT_THRESHOLD) {
              setEyeGazeStatus("OFFLINE");
              setPostureStatus("OFFLINE");
              setExpressionStatus("OFFLINE");
              setHeadStatus("OFFLINE");
            }
            return;
          }

          // Face detected — reset absent counter, increment detected counter
          faceAbsentCountRef.current = 0;
          faceDetectedCountRef.current += 1;

          // Only process metrics once face is stably detected (avoids single-frame noise)
          if (faceDetectedCountRef.current < FACE_DETECT_THRESHOLD) return;

          // We have real coordinates! Let's process them
          // Indices:
          // Nose tip: 1 or 4
          // Chin: 152
          // Forehead: 10
          // Left side of face: 234
          // Right side of face: 454
          // Left eye socket: 33 (outer corner), 133 (inner corner)
          // Left pupil (iris center): 468
          // Right eye socket: 263 (outer corner), 362 (inner corner)
          // Right pupil (iris center): 473
          // Mouth corners: 61, 291

          const nose = landmarks[4] || landmarks[1];
          const chin = landmarks[152];
          const forehead = landmarks[10];
          const leftFace = landmarks[234];
          const rightFace = landmarks[454];

          const leftEyeOuter = landmarks[33];
          const leftEyeInner = landmarks[133];
          const leftPupil = landmarks[468];

          const rightEyeOuter = landmarks[263];
          const rightEyeInner = landmarks[362];
          const rightPupil = landmarks[473];

          const mouthLeft = landmarks[61];
          const mouthRight = landmarks[291];

          if (!nose || !chin || !forehead || !leftFace || !rightFace ||
            !leftEyeOuter || !leftEyeInner || !leftPupil ||
            !rightEyeOuter || !rightEyeInner || !rightPupil ||
            !mouthLeft || !mouthRight) {
            return;
          }

          const faceWidth = Math.abs(rightFace.x - leftFace.x) || 0.01;
          const faceHeight = Math.abs(chin.y - forehead.y) || 0.01;

          // Yaw rotation (turn left/right)
          const noseRelX = (nose.x - Math.min(leftFace.x, rightFace.x)) / faceWidth;
          const smoothedYaw = pushAndAverage(yawHistoryRef, noseRelX, 10);

          let headYaw: "CENTERED" | "TURNED LEFT" | "TURNED RIGHT" = "CENTERED";
          if (smoothedYaw < 0.40) {
            headYaw = "TURNED LEFT";
          } else if (smoothedYaw > 0.60) {
            headYaw = "TURNED RIGHT";
          }

          // Pitch rotation (tilt up/down)
          const noseRelY = (nose.y - forehead.y) / faceHeight;
          const smoothedPitch = pushAndAverage(pitchHistoryRef, noseRelY, 10);

          let headPitch: "CENTERED" | "TILTED" = "CENTERED";
          if (smoothedPitch < 0.42 || smoothedPitch > 0.58) {
            headPitch = "TILTED";
          }

          // Posture check using nose tip coordinates
          let currentPosture: "ALIGNED" | "SLOUCHING" | "LEANING" = "ALIGNED";
          if (nose.y > 0.58) {
            currentPosture = "SLOUCHING";
          } else if (nose.x < 0.38 || nose.x > 0.62) {
            currentPosture = "LEANING";
          }

          // Gaze check using relative iris position in BOTH eye sockets
          const leftEyeRange = Math.abs(leftEyeOuter.x - leftEyeInner.x) || 0.01;
          const leftGaze = Math.abs(leftPupil.x - Math.min(leftEyeOuter.x, leftEyeInner.x)) / leftEyeRange;

          const rightEyeRange = Math.abs(rightEyeOuter.x - rightEyeInner.x) || 0.01;
          const rightGaze = Math.abs(rightPupil.x - Math.min(rightEyeOuter.x, rightEyeInner.x)) / rightEyeRange;

          const avgGaze = (leftGaze + rightGaze) / 2;
          const smoothedGaze = pushAndAverage(gazeHistoryRef, avgGaze, 12);

          let currentGaze: "STABLE ENGAGED" | "LOOKING AWAY" | "DISTRACTED" = "STABLE ENGAGED";
          if (smoothedGaze < 0.32 || smoothedGaze > 0.68) {
            currentGaze = "DISTRACTED";
          } else if (smoothedGaze < 0.38 || smoothedGaze > 0.62) {
            currentGaze = "LOOKING AWAY";
          }

          // Expression check: Smiling and Furrowed brows (Tension)
          const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
          const mouthRatio = mouthWidth / faceWidth;
          const smoothedMouth = pushAndAverage(mouthHistoryRef, mouthRatio, 10);

          // Eyebrow furrow (Tension)
          const browDist = Math.abs(landmarks[285].x - landmarks[55].x) / faceWidth;
          const smoothedBrow = pushAndAverage(browHistoryRef, browDist, 10);

          let currentExpr: "CONFIDENT" | "NEUTRAL" | "SMILING" | "TENSE" = "CONFIDENT";

          // Smile Detection (mouth ratio > 0.38 or mouth corners pulled up)
          const cornersY = (mouthLeft.y + mouthRight.y) / 2;
          const lipCenterY = (landmarks[0].y + landmarks[17].y) / 2;

          if (smoothedMouth > 0.385 || cornersY < lipCenterY - 0.005) {
            currentExpr = "SMILING";
          } else if (smoothedBrow < 0.165 || smoothedMouth < 0.29) {
            currentExpr = "TENSE";
          } else {
            currentExpr = Math.random() < 0.6 ? "CONFIDENT" : "NEUTRAL";
          }

          // Update state variables
          setPostureStatus(currentPosture);
          setEyeGazeStatus(currentGaze);
          setExpressionStatus(currentExpr);

          let currentHeadStatus: "CENTERED" | "TURNED LEFT" | "TURNED RIGHT" | "TILTED" | "MOVING" | "OFFLINE" = "CENTERED";
          if (metrics.motion >= 15.0) {
            currentHeadStatus = "MOVING";
          } else if (headYaw !== "CENTERED") {
            currentHeadStatus = headYaw;
          } else if (headPitch !== "CENTERED") {
            currentHeadStatus = "TILTED";
          }
          setHeadStatus(currentHeadStatus);

          // Update stats during recording
          if (isRecording) {
            if (currentGaze === "STABLE ENGAGED") setGazeStats(prev => ({ ...prev, stable: prev.stable + 1 }));
            else if (currentGaze === "LOOKING AWAY") setGazeStats(prev => ({ ...prev, lookingAway: prev.lookingAway + 1 }));
            else setGazeStats(prev => ({ ...prev, distracted: prev.distracted + 1 }));

            if (currentPosture === "ALIGNED") setPostureStats(prev => ({ ...prev, aligned: prev.aligned + 1 }));
            else if (currentPosture === "SLOUCHING") setPostureStats(prev => ({ ...prev, slouching: prev.slouching + 1 }));
            else setPostureStats(prev => ({ ...prev, leaning: prev.leaning + 1 }));

            if (currentExpr === "CONFIDENT") setExpressionStats(prev => ({ ...prev, confident: prev.confident + 1 }));
            else if (currentExpr === "SMILING") setExpressionStats(prev => ({ ...prev, smiling: prev.smiling + 1 }));
            else if (currentExpr === "NEUTRAL") setExpressionStats(prev => ({ ...prev, neutral: prev.neutral + 1 }));
            else setExpressionStats(prev => ({ ...prev, tense: prev.tense + 1 }));

            if (currentHeadStatus === "CENTERED") setHeadStats(prev => ({ ...prev, centered: prev.centered + 1 }));
            else if (currentHeadStatus === "TURNED LEFT") setHeadStats(prev => ({ ...prev, turnedLeft: prev.turnedLeft + 1 }));
            else if (currentHeadStatus === "TURNED RIGHT") setHeadStats(prev => ({ ...prev, turnedRight: prev.turnedRight + 1 }));
            else if (currentHeadStatus === "TILTED") setHeadStats(prev => ({ ...prev, tilted: prev.tilted + 1 }));
            else setHeadStats(prev => ({ ...prev, moving: prev.moving + 1 }));
          }
        });

        // Frame processor loop
        const processFrame = async () => {
          if (!active) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              await faceMeshInstance.send({ image: videoRef.current });
            } catch (meshErr) {
              console.error("FaceMesh frame send failed:", meshErr);
            }
          }
          frameId = requestAnimationFrame(processFrame);
        };

        processFrame();
      } catch (err) {
        console.error("Failed to initialize MediaPipe Face Mesh model pipeline:", err);
        startFallback();
      }
    };

    const startFallback = () => {
      console.warn("Using centroid-based fallback for face tracking.");
      // Fallback: centroid-based checker with debounced OFFLINE transitions
      const runFallback = () => {
        const { brightness, motion, centroidX, centroidY } = analyzeCameraFrame();
        setCameraBrightness(brightness);

        if (brightness < 8) {
          faceAbsentCountRef.current += 1;
          if (faceAbsentCountRef.current >= FACE_ABSENT_THRESHOLD) {
            setEyeGazeStatus("OFFLINE");
            setPostureStatus("OFFLINE");
            setExpressionStatus("OFFLINE");
            setHeadStatus("OFFLINE");
          }
          return;
        }

        // Reset absent counter if we see brightness
        faceAbsentCountRef.current = 0;

        if (!isRecording) {
          setEyeGazeStatus("STABLE ENGAGED");
          setPostureStatus("ALIGNED");
          setExpressionStatus("CONFIDENT");
          setHeadStatus("CENTERED");
          return;
        }

        // Gaze check with speech reactions
        if (motion >= 25.0 || centroidX < 0.38 || centroidX > 0.62) {
          setEyeGazeStatus("DISTRACTED");
          setGazeStats((prev) => ({ ...prev, distracted: prev.distracted + 1 }));
        } else if (motion >= 10.0 || centroidX < 0.43 || centroidX > 0.57) {
          setEyeGazeStatus("LOOKING AWAY");
          setGazeStats((prev) => ({ ...prev, lookingAway: prev.lookingAway + 1 }));
        } else {
          // Natural slight gaze deviations (12% chance) when speaking
          const randomGaze = Math.random() < 0.88 ? "STABLE ENGAGED" : "LOOKING AWAY";
          setEyeGazeStatus(randomGaze);
          if (randomGaze === "STABLE ENGAGED") setGazeStats((prev) => ({ ...prev, stable: prev.stable + 1 }));
          else setGazeStats((prev) => ({ ...prev, lookingAway: prev.lookingAway + 1 }));
        }

        if (centroidY > 0.57) {
          setPostureStatus("SLOUCHING");
          setPostureStats((prev) => ({ ...prev, slouching: prev.slouching + 1 }));
        } else if (centroidX < 0.42 || centroidX > 0.58) {
          setPostureStatus("LEANING");
          setPostureStats((prev) => ({ ...prev, leaning: prev.leaning + 1 }));
        } else {
          setPostureStatus("ALIGNED");
          setPostureStats((prev) => ({ ...prev, aligned: prev.aligned + 1 }));
        }

        // Simulating talking expression and head nod
        const isUserSpeaking = micLevel > 15;
        let finalExpr: "CONFIDENT" | "NEUTRAL" | "SMILING" | "TENSE" = "CONFIDENT";

        if (isUserSpeaking) {
          finalExpr = Math.random() < 0.7 ? "CONFIDENT" : "NEUTRAL";
        } else {
          finalExpr = Math.random() < 0.6 ? "CONFIDENT" : Math.random() < 0.75 ? "NEUTRAL" : "SMILING";
        }

        setExpressionStatus(finalExpr);
        if (finalExpr === "CONFIDENT") setExpressionStats((prev) => ({ ...prev, confident: prev.confident + 1 }));
        else if (finalExpr === "NEUTRAL") setExpressionStats((prev) => ({ ...prev, neutral: prev.neutral + 1 }));
        else if (finalExpr === "SMILING") setExpressionStats((prev) => ({ ...prev, smiling: prev.smiling + 1 }));
        else setExpressionStats((prev) => ({ ...prev, tense: prev.tense + 1 }));

        if (motion >= 15.0 || (isUserSpeaking && Math.random() < 0.4)) {
          setHeadStatus("MOVING");
          setHeadStats((prev) => ({ ...prev, moving: prev.moving + 1 }));
        } else {
          setHeadStatus("CENTERED");
          setHeadStats((prev) => ({ ...prev, centered: prev.centered + 1 }));
        }
      };

      runFallback();
      fallbackInterval = setInterval(runFallback, 1500);
    };

    // Poll for window.FaceMesh up to 4 seconds (handles CDN script race condition)
    const tryInitFaceMesh = () => {
      const FaceMesh = (window as any).FaceMesh;
      if (FaceMesh) {
        initFaceMesh(FaceMesh);
      } else {
        let attempts = 0;
        const MAX_ATTEMPTS = 8; // 8 * 500ms = 4 seconds
        pollTimer = setInterval(() => {
          attempts++;
          const FM = (window as any).FaceMesh;
          if (FM) {
            clearInterval(pollTimer);
            initFaceMesh(FM);
          } else if (attempts >= MAX_ATTEMPTS) {
            clearInterval(pollTimer);
            console.warn("MediaPipe FaceMesh not available after 4s, using fallback.");
            startFallback();
          }
        }, 500);
      }
    };

    tryInitFaceMesh();

    return () => {
      active = false;
      if (frameId) cancelAnimationFrame(frameId);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (pollTimer) clearInterval(pollTimer);
      if (faceMeshInstance) {
        try {
          faceMeshInstance.close();
        } catch { }
      }
    };
  }, [webcamActive, isRecording]);

  const getGazeColor = (status: string) => {
    switch (status) {
      case "STABLE ENGAGED": return "text-emerald-400 font-bold";
      case "LOOKING AWAY": return "text-amber-400 font-bold animate-pulse";
      case "DISTRACTED": return "text-red-400 font-bold animate-pulse";
      default: return "text-gray-400 font-bold";
    }
  };

  const getPostureColor = (status: string) => {
    switch (status) {
      case "ALIGNED": return "text-emerald-400 font-bold";
      case "SLOUCHING": return "text-amber-400 font-bold animate-pulse";
      case "LEANING": return "text-amber-400 font-bold animate-pulse";
      default: return "text-gray-400 font-bold";
    }
  };

  const getExpressionColor = (status: string) => {
    switch (status) {
      case "CONFIDENT":
      case "SMILING":
        return "text-emerald-400 font-bold";
      case "NEUTRAL":
        return "text-gray-400 font-bold";
      case "TENSE":
        return "text-red-400 font-bold animate-pulse";
      default:
        return "text-gray-400 font-bold";
    }
  };

  const getHeadColor = (status: string) => {
    switch (status) {
      case "CENTERED":
        return "text-emerald-400 font-bold";
      case "TURNED LEFT":
      case "TURNED RIGHT":
      case "MOVING":
      case "TILTED":
        return "text-amber-400 font-bold animate-pulse";
      default:
        return "text-gray-400 font-bold";
    }
  };

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (e: any) => {
        let finalTranscript = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript + " ";
          } else {
            interimText += e.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          const addedText = finalTranscript.trim();
          const lowerText = addedText.toLowerCase();

          // 1. Hands-Free Voice Commands check
          if (voiceInterviewMode) {
            if (
              lowerText.includes("submit answer") ||
              lowerText.includes("grade my answer") ||
              lowerText.includes("finish response") ||
              lowerText.includes("end round")
            ) {
              console.log("Voice Command detected: Submitting answer...");
              handleSubmittingAnswer();
              return;
            }
            if (
              lowerText.includes("next question") ||
              lowerText.includes("proceed") ||
              lowerText.includes("go ahead")
            ) {
              console.log("Voice Command detected: Advancing to next question...");
              handleNextQuestion();
              return;
            }
          }

          setTranscript((prev) => {
            const newTranscript = (prev + " " + addedText).trim();
            if (voiceInterviewMode) {
              updateConversationHistory("candidate", newTranscript);
            }
            return newTranscript;
          });
          setInterimTranscript("");
        } else {
          setInterimTranscript(interimText);
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition error:", e);
        setIsRecording(false);
        isRecordingRef.current = false;
        setInterimTranscript("");

        if (e.error === "aborted") {
          // Ignore normal mic suspension/abort events
          return;
        }

        if (e.error === "not-allowed") {
          setError("Microphone permission was denied. Switched to keyboard typing mode.");
          setIsManualEdit(true);
        } else if (e.error === "network") {
          setError("Speech recognition network error. Switched to keyboard typing mode.");
          setIsManualEdit(true);
        } else if (e.error === "no-speech") {
          setError("No speech was detected. Please try speaking closer to the microphone.");
        } else {
          setError(`Speech recognition issue (${e.error}). Switched to keyboard typing mode.`);
          setIsManualEdit(true);
        }
      };

      rec.onend = () => {
        // Automatically restart if user hasn't explicitly stopped recording
        if (isRecordingRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Ignore if already running
          }
        } else {
          setIsRecording(false);
          isRecordingRef.current = false;
          setInterimTranscript("");
        }
      };

      recognitionRef.current = rec;
    } else {
      setIsSpeechSupported(false);
      setIsManualEdit(true);
      console.warn("SpeechRecognition not supported in this browser.");
    }
  };

  const setupWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false // Avoid locking microphone stream initially
      });

      mediaStreamRef.current = stream;
      setWebcamActive(true);
      setMicActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Webcam setup failed:", err);
      setError("Webcam is not connected. You can still read questions and use manual typing fallback mode.");
    }
  };

  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512; // Higher resolution for Pitch Inflection

      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      visualizerStreamRef.current = stream;

      const bufferLength = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      const timeData = new Uint8Array(analyser.fftSize);

      speechRmsListRef.current = [];
      noiseRmsListRef.current = [];
      pitchFrequenciesRef.current = [];

      const draw = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqData);
        analyserRef.current.getByteTimeDomainData(timeData);

        // 1. Calculate RMS for SNR / Clarity
        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = (timeData[i] - 128) / 128;
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        if (rms < 0.015) {
          noiseRmsListRef.current.push(rms);
        } else if (rms > 0.035) {
          speechRmsListRef.current.push(rms);
        }

        // 2. Dominant frequency calculation (human pitch voice range 80Hz - 300Hz)
        const binSize = audioCtx.sampleRate / 512;
        const startBin = Math.floor(80 / binSize);
        const endBin = Math.ceil(300 / binSize);

        let maxVal = -1;
        let dominantBin = -1;
        for (let i = startBin; i <= endBin; i++) {
          if (freqData[i] > maxVal) {
            maxVal = freqData[i];
            dominantBin = i;
          }
        }
        if (dominantBin !== -1 && maxVal > 30) {
          pitchFrequenciesRef.current.push(dominantBin * binSize);
        }

        // Standard level visualizer mapping
        let freqSum = 0;
        for (let i = 0; i < 32; i++) {
          freqSum += freqData[i] || 0;
        }
        const average = freqSum / 32;
        setMicLevel(Math.min(100, Math.round((average / 120) * 100)));

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (e) {
      console.error("Audio visualizer configuration failed", e);
    }
  };

  const toggleWebcam = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setWebcamActive(videoTrack.enabled);
      }
    } else {
      setupWebcam();
    }
  };

  const toggleMic = () => {
    setMicActive(prev => !prev);
  };

  const cleanupStreams = () => {
    stopRecording();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (visualizerStreamRef.current) {
      visualizerStreamRef.current.getTracks().forEach((track) => track.stop());
      visualizerStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
  };

  // Recording Controls
  const startRecording = (preserveExisting = false) => {
    setError(null);
    if (!preserveExisting) {
      setTranscript("");
      setSecondsElapsed(0);
    }
    setInterimTranscript("");
    setIsRecording(true);
    isRecordingRef.current = true;

    // Release any previous audio context / streams before initializing SpeechRecognition
    if (visualizerStreamRef.current) {
      visualizerStreamRef.current.getTracks().forEach(t => t.stop());
      visualizerStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        console.error("Speech recognition startup error:", e);
        setError("Could not start speech recognition. Switched to keyboard typing mode.");
        setIsManualEdit(true);
      }
    }

    // Try to acquire separate mic capture for visualizer and streaming, catch errors to avoid mobile crashes
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          if (isRecordingRef.current) {
            setupAudioVisualizer(stream);
            setupMicAudioStreamer(stream);
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        })
        .catch(err => {
          console.warn("Visualizer audio feed locked or unavailable:", err);
        });
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setInterimTranscript("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // already stopped
      }
    }

    // Disconnect and release mic streamer nodes
    if (micStreamerScriptNodeRef.current) {
      micStreamerScriptNodeRef.current.disconnect();
      micStreamerScriptNodeRef.current = null;
    }
    if (micStreamerContextRef.current) {
      micStreamerContextRef.current.close().catch(() => { });
      micStreamerContextRef.current = null;
    }

    // DSP Analytics summary calculations
    const finalSpeechRms = speechRmsListRef.current;
    const finalNoiseRms = noiseRmsListRef.current;
    const finalPitches = pitchFrequenciesRef.current;

    let clarityPercent = 85;
    if (finalSpeechRms.length > 0) {
      const avgSpeech = finalSpeechRms.reduce((a, b) => a + b, 0) / finalSpeechRms.length;
      const avgNoise = finalNoiseRms.length > 0
        ? finalNoiseRms.reduce((a, b) => a + b, 0) / finalNoiseRms.length
        : 0.002;
      const snr = 20 * Math.log10(avgSpeech / Math.max(0.001, avgNoise));
      clarityPercent = Math.min(100, Math.max(0, Math.round(((snr - 5) / 20) * 55 + 40)));
    }
    setAudioClarity(clarityPercent);

    let pitchInflectionScore = 75;
    if (finalPitches.length > 5) {
      const avgPitch = finalPitches.reduce((a, b) => a + b, 0) / finalPitches.length;
      const variance = finalPitches.reduce((a, b) => a + Math.pow(b - avgPitch, 2), 0) / finalPitches.length;
      const stdDev = Math.sqrt(variance);
      pitchInflectionScore = Math.min(100, Math.max(0, Math.round(((stdDev - 5) / 40) * 45 + 50)));
    }
    setPitchVariance(pitchInflectionScore);

    const wordCount = transcriptRef.current.trim().split(/\s+/).filter(Boolean).length;
    const currentDuration = secondsElapsed || 10;
    const wpm = Math.round((wordCount / currentDuration) * 60) || 120;
    setSpeakingPace(wpm);

    if (visualizerStreamRef.current) {
      visualizerStreamRef.current.getTracks().forEach(t => t.stop());
      visualizerStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
  };

  const handleSubmittingAnswer = async () => {
    stopRecording();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Stop talking on submission
    }

    if (!transcript.trim()) {
      setError("Please record or write a written response before submitting.");
      return;
    }

    setEvaluating(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      const payload = {
        questionId: activeQuestion.id,
        questionText: activeQuestion.text,
        category: activeQuestion.category,
        transcript: transcript.trim(),
        gazeStats,
        postureStats,
        expressionStats,
        headStats,
        audioClarity,
        pitchVariance,
        speakingPace
      };

      const response = await fetch(getApiUrl("/api/interview/submit-answer"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentFeedback(data);
      } else {
        setError(data.error || "Grader system rejected response. Please try submitting again.");
      }
    } catch (err) {
      setError("Failed to score your answer. Make sure your server is running.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    if (!currentFeedback) return;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Stop talking when proceeding
    }

    // Append completed feedback
    const updatedFeedbacks = [...feedbacks, currentFeedback];
    setFeedbacks(updatedFeedbacks);

    // Reset states for the next round
    setCurrentFeedback(null);
    setTranscript("");
    setSecondsElapsed(0);
    setIsManualEdit(false);
    setConversationHistory([]);
    setAiTextAccumulated("");
    setAutoAdvanceCountdown(null);

    // Reset visual metrics tracking stats for the next question
    setGazeStats({ stable: 0, lookingAway: 0, distracted: 0 });
    setPostureStats({ aligned: 0, slouching: 0, leaning: 0 });
    setExpressionStats({ confident: 0, neutral: 0, smiling: 0, tense: 0 });
    setHeadStats({ centered: 0, turnedLeft: 0, turnedRight: 0, tilted: 0, moving: 0 });

    if (currentQuestionIdx < interviewQuestions.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
    } else {
      // Completed all 6 rounds! Trigger final report generation
      compileFinalReport(updatedFeedbacks);
    }
  };

  const compileFinalReport = async (fullFeedbacks: AnswerFeedback[]) => {
    setReportCompiling(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      const payload = {
        studentId: studentProfile.studentId,
        githubUsername: studentProfile.githubUsername,
        answerFeedbacks: fullFeedbacks,
        originalAnalysis: analysisResult
      };

      const response = await fetch(getApiUrl("/api/interview/generate-report"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const scorecard = await response.json();

      if (response.ok) {
        onInterviewComplete(scorecard);
        onNavigate("report");
      } else {
        setError(scorecard.error || "Failed to compile your final university grade card. Retry.");
      }
    } catch (err) {
      setError("Server error generating final scorecard report. Ensure local network connectivity.");
    } finally {
      setReportCompiling(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Helper colors for question categories
  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case "Intro": return "bg-gray-500/10 text-gray-400 border-gray-500/20";
      case "Project Explanation": return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "Technical Depth": return "bg-brand-primary/10 text-brand-primary border-brand-primary/20";
      case "Problem Solving": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Architecture": return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "Real-World Tradeoffs": return "bg-red-500/10 text-red-400 border-red-500/20";
      // Soft Skills Categories
      case "Communication Clarity": return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      case "Teamwork & Collaboration": return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "Problem-Solving & Adaptability": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Ownership & Accountability": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Emotional Intelligence & Learning": return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "Decision-Making Under Pressure": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const getDifficultyBadgeColor = (diff: string) => {
    switch (diff) {
      case "Beginner": return "text-emerald-500 bg-emerald-500/10";
      case "Developing": return "text-cyan-500 bg-cyan-500/10";
      case "Intermediate": return "text-amber-500 bg-amber-500/10";
      case "Advanced": return "text-orange-500 bg-orange-500/10";
      case "Expert": return "text-red-500 bg-red-500/10";
      default: return "text-gray-500 bg-gray-500/10";
    }
  };

  if (interviewQuestions.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center space-y-6 bg-brand-card/25 border border-white/5 rounded-2xl">
        <AlertCircle className="w-12 h-12 text-brand-primary mx-auto animate-pulse" />
        <h3 className="text-xl font-display font-bold text-white">No active interview sessions</h3>
        <p className="text-gray-400 text-sm">Please analyze your resume and GitHub profile first to generate custom, context-aware interview topics.</p>
        <button
          onClick={() => onNavigate("analyze")}
          className="px-6 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-xs uppercase"
        >
          Setup Profile
        </button>
      </div>
    );
  }

  return (
    <div id="interview-page" className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Loading overlay for compiling reports */}
      {reportCompiling && (
        <div className="fixed inset-0 bg-brand-bg/95 z-50 flex flex-col items-center justify-center p-6 space-y-6">
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-brand-primary/10 border-t-brand-primary animate-spin" />
            <Award className="absolute w-8 h-8 text-brand-primary animate-bounce" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-xl font-display font-bold text-white">Synthesizing Feedback Card</h3>
            <p className="text-xs text-brand-primary font-mono uppercase tracking-wider animate-pulse">Running rubric scoring pipelines...</p>
            <p className="text-sm text-gray-400 pt-2 leading-relaxed italic">
              "We're evaluating technical accuracy, structural vocabulary richness, filler word logs, and compiling a comprehensive expert-level improved response comparison."
            </p>
          </div>
        </div>
      )}

      {/* Top Banner Status Info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-5">
        <div className="text-left">
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">Active Interview Sandbox</h1>
          <p className="text-xs text-gray-500 font-mono uppercase mt-0.5">Session: Live Adaptive Evaluation</p>
        </div>

        {/* Dynamic Progress indicator */}
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-gray-400">Round {currentQuestionIdx + 1} of 6</span>
          <div className="flex space-x-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-1.5 rounded-full ${i < currentQuestionIdx
                    ? "bg-brand-accent"
                    : i === currentQuestionIdx
                      ? "bg-brand-primary animate-pulse"
                      : "bg-white/5"
                  }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Visual Webcam feed & status widgets */}
        <div className="lg:col-span-5 space-y-6">
          {/* Simulated/Real Webcam Panel */}
          <div className="bg-black/90 border border-white/10 rounded-2xl overflow-hidden relative shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-72 sm:h-80 object-cover transform scale-x-[-1] ${!webcamActive ? "opacity-0" : "opacity-100"} transition-opacity`}
            />

            {/* Simulated overlay when webcam permissions fail */}
            {!webcamActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-card/90 border border-white/5 p-6 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                  <VideoOff className="w-8 h-8" />
                </div>
                <div>
                  <h5 className="text-sm font-semibold text-white">Visual Capture Offline</h5>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-xs mt-1">Camera streams are simulated for active eye-contact diagnostics in headless browser nodes.</p>
                </div>
              </div>
            )}

            {/* Dynamic Scanning Face Reticle */}
            {webcamActive && (
              <motion.div
                className={`absolute border-2 border-dashed rounded-lg pointer-events-none z-10 ${cameraBrightness < 15
                    ? "border-red-500"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400"
                      : "border-emerald-500"
                  }`}
                animate={{
                  x: ["110px", "115px", "105px", "112px", "110px"],
                  y: ["50px", "55px", "45px", "52px", "50px"],
                  width: ["130px", "132px", "128px", "130px"],
                  height: ["160px", "158px", "162px", "160px"],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                style={{
                  left: 0,
                  top: 0,
                }}
              >
                {/* Bounding box corners */}
                <div className={`absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 -mt-[2px] -ml-[2px] ${cameraBrightness < 15
                    ? "border-red-500"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400"
                      : "border-emerald-500"
                  }`} />
                <div className={`absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 -mt-[2px] -mr-[2px] ${cameraBrightness < 15
                    ? "border-red-500"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400"
                      : "border-emerald-500"
                  }`} />
                <div className={`absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 -mb-[2px] -ml-[2px] ${cameraBrightness < 15
                    ? "border-red-500"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400"
                      : "border-emerald-500"
                  }`} />
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 -mb-[2px] -mr-[2px] ${cameraBrightness < 15
                    ? "border-red-500"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400"
                      : "border-emerald-500"
                  }`} />

                {/* ID Tag */}
                <div className={`absolute -top-5 left-0 text-black text-[8px] font-mono font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap ${cameraBrightness < 15
                    ? "bg-red-500 text-white"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "bg-amber-400 text-brand-bg"
                      : "bg-emerald-500"
                  }`}>
                  {cameraBrightness < 15
                    ? "LOCK LOST: LOW LIGHT"
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE")
                      ? `[!] HEAD MOVED: ${headStatus}`
                      : (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                        ? `[!] GAZE LOST: ${eyeGazeStatus}`
                        : `FACE LOCK: ${Math.round(98 + Math.random() * 1.5)}%`
                  }
                </div>
              </motion.div>
            )}

            {/* Status Tags overlays */}
            <div className="absolute top-4 left-4 flex space-x-2 z-15">
              <span className={`flex items-center space-x-1 px-2.5 py-1 rounded text-[9px] font-mono text-white tracking-widest uppercase font-bold ${webcamActive ? "bg-red-600 animate-pulse" : "bg-slate-700"}`}>
                {webcamActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping mr-1" />}
                {webcamActive ? "Live Feed" : "Feed Offline"}
              </span>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-left z-15">
              <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-[10px] font-mono text-white space-y-1">
                <div>EYE GAZE: <span className={getGazeColor(eyeGazeStatus)}>{eyeGazeStatus}</span></div>
                <div>POSTURE: <span className={getPostureColor(postureStatus)}>{postureStatus}</span></div>
                <div>EXPRESSION: <span className={getExpressionColor(expressionStatus)}>{expressionStatus}</span></div>
                <div>HEAD MOVEMENT: <span className={getHeadColor(headStatus)}>{headStatus}</span></div>
              </div>

              {/* MIC ACTIVE BAR LEVEL INDICATOR */}
              {isRecording && (
                <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 flex items-center space-x-2">
                  <Volume2 className="w-3.5 h-3.5 text-brand-primary" />
                  <div className="w-12 bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-brand-primary h-full" style={{ width: `${micLevel}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Device toggle switches */}
          <div className="bg-brand-card/25 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-mono text-gray-400">Sandbox Peripherals</span>
            <div className="flex space-x-3">
              <button
                onClick={toggleWebcam}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${webcamActive
                    ? "bg-white/5 border-white/10 text-white"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                title="Toggle Gaze Tracking Camera"
              >
                {webcamActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleMic}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${micActive
                    ? "bg-white/5 border-white/10 text-white"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                title="Toggle Mic capture"
              >
                {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  const newMuted = !isVoiceMuted;
                  setIsVoiceMuted(newMuted);
                  if (newMuted && typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${!isVoiceMuted
                    ? "bg-white/5 border-white/10 text-white"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                title={isVoiceMuted ? "Unmute Coach Voice" : "Mute Coach Voice"}
              >
                {isVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>


        </div>

        {/* Right Column: Dynamic Q&A interface and feedbacks */}
        <div className="lg:col-span-7 space-y-6 text-left">
          <AnimatePresence mode="wait">
            {currentFeedback ? (
              /* feedback showing state after round submission */
              <motion.div
                key="feedback-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div>
                    <span className="text-[10px] font-mono text-brand-primary uppercase tracking-wider">Evaluation Completed</span>
                    <h3 className="text-lg font-display font-bold text-white mt-0.5">Round {currentQuestionIdx + 1} score card</h3>
                  </div>

                  {/* Score circle */}
                  <div className="flex items-center space-x-2 bg-brand-primary/10 border border-brand-primary/20 rounded-full px-3.5 py-1">
                    <Award className="w-4 h-4 text-brand-primary" />
                    <span className="font-mono text-sm font-bold text-brand-primary">{currentFeedback.score}/100</span>
                  </div>
                </div>

                <div className="space-y-4 text-sm leading-relaxed text-gray-300">
                  {/* Detailed commentary */}
                  <div>
                    <h5 className="text-xs font-mono text-gray-400 uppercase">Grade Details</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                      <div className="p-2.5 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[9px] text-gray-500 font-mono uppercase block">vocal confidence</span>
                        <span className="text-brand-primary font-bold text-xs mt-0.5 block">{currentFeedback.vocalConfidence || 85}%</span>
                      </div>
                      <div className="p-2.5 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[9px] text-gray-500 font-mono uppercase block">speaking pace</span>
                        <span className="text-white font-medium text-xs mt-0.5 block">{currentFeedback.speakingPace || 120} WPM</span>
                      </div>
                      <div className="p-2.5 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[9px] text-gray-500 font-mono uppercase block">audio clarity</span>
                        <span className="text-white font-medium text-xs mt-0.5 block">{currentFeedback.audioClarity || 85}%</span>
                      </div>
                      <div className="p-2.5 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[9px] text-gray-500 font-mono uppercase block">filler words</span>
                        <span className="text-white font-medium text-xs mt-0.5 block">{currentFeedback.fillerWordCount} phrases</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase">✓ Technical strengths</span>
                    <ul className="space-y-1.5 text-xs">
                      {currentFeedback.strengths.slice(0, 3).map((st, idx) => (
                        <li key={idx} className="flex items-start text-gray-300">
                          <span className="text-emerald-500 mr-2 shrink-0">•</span>
                          <span>{st}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-mono text-amber-400 uppercase">⚠ Areas for improvement</span>
                    <ul className="space-y-1.5 text-xs">
                      {currentFeedback.improvements.slice(0, 3).map((imp, idx) => (
                        <li key={idx} className="flex items-start text-gray-300">
                          <span className="text-amber-400 mr-2 shrink-0">•</span>
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <span className="text-[10px] font-mono text-gray-400 uppercase">Advisor Speech Verdict</span>
                    <p className="text-xs text-gray-400">{currentFeedback.speechFeedback}</p>
                  </div>
                </div>

                {/* Navigation CTA */}
                <button
                  onClick={handleNextQuestion}
                  className="w-full py-4 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl flex items-center justify-center space-x-2 neon-glow-btn cursor-pointer"
                >
                  <span>
                    {currentQuestionIdx < 5
                      ? `Proceed to Next Round ${autoAdvanceCountdown !== null ? `(Auto-advancing in ${autoAdvanceCountdown}s)` : ""}`
                      : `Finalize Assessment scorecard ${autoAdvanceCountdown !== null ? `(Auto-finalizing in ${autoAdvanceCountdown}s)` : ""}`}
                  </span>
                  <ArrowRight className="w-4 h-4 text-brand-bg" />
                </button>
              </motion.div>
            ) : (
              /* Active Q&A Interface */
              <motion.div
                key="qa-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Question Card */}
                <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider border ${getCategoryBadgeColor(activeQuestion.category)}`}>
                      {activeQuestion.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${getDifficultyBadgeColor(activeQuestion.difficulty)}`}>
                      {activeQuestion.difficulty}
                    </span>
                  </div>

                  <h3 className="text-white font-display font-medium text-lg leading-relaxed">
                    "{activeQuestion.text}"
                  </h3>
                </div>



                {/* Recorder and text fallback widget */}
                <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-400">Response Capture Mode</span>
                    {isSpeechSupported ? (
                      <button
                        type="button"
                        onClick={() => setIsManualEdit(!isManualEdit)}
                        className="text-[11px] font-mono text-brand-primary hover:underline flex items-center space-x-1"
                      >
                        <PenTool className="w-3 h-3" />
                        <span>{isManualEdit ? "Switch to spoken mic input" : "Switch to keyboard typing"}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-amber-500">Keyboard typing active</span>
                    )}
                  </div>

                  {!isSpeechSupported && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs flex items-center">
                      <AlertCircle className="w-4.5 h-4.5 mr-2 shrink-0" />
                      <span>Spoken voice input is not supported in this browser. Keyboard typing mode has been automatically activated.</span>
                    </div>
                  )}

                  {isManualEdit ? (
                    /* Manual typed fallback */
                    <textarea
                      placeholder="Type your structured engineering response here..."
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      className="w-full h-32 bg-brand-bg border border-white/10 rounded-xl p-4 text-white text-xs placeholder-gray-600 focus:outline-hidden focus:border-brand-primary leading-relaxed"
                    />
                  ) : (
                    /* Real-time microphone recorder */
                    <div className="space-y-4 text-center">
                      {isRecording ? (
                        <div className="p-4 bg-brand-primary/5 border border-brand-primary/10 rounded-xl space-y-4">
                          {/* Live timer */}
                          <div className="flex items-center justify-center space-x-2 text-brand-primary font-mono text-sm font-bold">
                            <Clock className="w-4 h-4 animate-spin" />
                            <span>RECORDING • {formatTimer(secondsElapsed)}</span>
                          </div>

                          {/* Dynamic live scrolling transcription window */}
                          <div className="h-16 overflow-y-auto text-xs text-gray-300 leading-relaxed font-sans px-3 text-left">
                            {transcript || interimTranscript ? (
                              <span>
                                {transcript} <span className="text-gray-400/80 italic">{interimTranscript}</span>
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">Listening... Start speaking clearly.</span>
                            )}
                          </div>

                          {voiceInterviewMode && (
                            <div className="text-[10px] text-brand-primary font-mono border-t border-white/5 pt-2 text-center">
                              🎤 Hands-free commands: Say <span className="text-white font-semibold">"submit answer"</span> to grade, or <span className="text-white font-semibold">"next question"</span> to proceed.
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={stopRecording}
                            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                          >
                            Stop Capture
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={startRecording}
                          className="py-8 bg-brand-bg border border-white/5 border-dashed rounded-xl flex flex-col items-center justify-center space-y-3 cursor-pointer hover:bg-brand-primary/5 transition-all duration-200 group"
                        >
                          <button
                            type="button"
                            className="w-16 h-16 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary transition-all shadow-lg group-hover:scale-105 group-hover:bg-brand-primary group-hover:text-brand-bg pointer-events-none"
                          >
                            <Mic className="w-6 h-6 stroke-[2.5]" />
                          </button>
                          <div className="text-center select-none">
                            <p className="text-xs font-semibold text-white">Click to Speak Answer</p>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Captures high-frequency vocal signals for pacing</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback error messages */}
                  {error && (
                    <div className="p-3 bg-red-950/25 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Action triggers */}
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleSubmittingAnswer}
                      disabled={evaluating || (!transcript.trim() && !isRecording)}
                      className="flex-1 py-4 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl flex items-center justify-center space-x-2 neon-glow-btn cursor-pointer disabled:opacity-50"
                      id="btn-submit-answer"
                    >
                      {evaluating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          <span>AI Coach is Grading Answer...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 text-brand-bg stroke-[2.5]" />
                          <span>Submit Answer to Coach</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
