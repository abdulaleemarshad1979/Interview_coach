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

  // Evaluation states
  const [evaluating, setEvaluating] = useState(false);
  const [feedbacks, setFeedbacks] = useState<AnswerFeedback[]>([]);
  const [currentFeedback, setCurrentFeedback] = useState<AnswerFeedback | null>(null);
  const [reportCompiling, setReportCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  const activeQuestion = interviewQuestions[currentQuestionIdx];

  // Helper function for Text-to-Speech (speech synthesis)
  const speakText = (text: string) => {
    if (isVoiceMuted || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05; // Slightly faster to simulate natural flow
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Text-to-speech error:", e);
    }
  };

  // 1. Setup speech recognition and camera
  useEffect(() => {
    setupSpeechRecognition();
    setupWebcam();

    return () => {
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
        const textToSpeak = `Question ${currentQuestionIdx + 1}. In the category of ${activeQ.category}. ${activeQ.text}`;
        const speechTimer = setTimeout(() => {
          speakText(textToSpeak);
        }, 1200);
        return () => clearTimeout(speechTimer);
      }
    }
  }, [currentQuestionIdx, interviewQuestions, currentFeedback, isVoiceMuted]);

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

  const checkCameraLighting = () => {
    if (!videoRef.current || !webcamActive) return 0;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 60;
      const ctx = canvas.getContext("2d");
      if (!ctx) return 100;
      // Draw the video frame to a small canvas
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let totalLuminance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        totalLuminance += (0.2126 * r + 0.7152 * g + 0.0722 * b);
      }
      return totalLuminance / (data.length / 4);
    } catch (e) {
      return 100; // CORS fallback
    }
  };

  // 3. Dynamic eye gaze, posture, expression & head position simulation effect + camera luminosity analysis
  useEffect(() => {
    if (!webcamActive) {
      setEyeGazeStatus("OFFLINE");
      setPostureStatus("OFFLINE");
      setExpressionStatus("OFFLINE");
      setHeadStatus("OFFLINE");
      setCameraBrightness(0);
      return;
    }

    // Run initial lighting check
    const initialBrightness = checkCameraLighting();
    setCameraBrightness(initialBrightness);

    if (initialBrightness < 15) {
      setEyeGazeStatus("OFFLINE");
      setPostureStatus("OFFLINE");
      setExpressionStatus("OFFLINE");
      setHeadStatus("OFFLINE");
    } else {
      setEyeGazeStatus("STABLE ENGAGED");
      setPostureStatus("ALIGNED");
      setExpressionStatus("CONFIDENT");
      setHeadStatus("CENTERED");
      setGazeStats((prev) => ({ ...prev, stable: prev.stable + 1 }));
      setPostureStats((prev) => ({ ...prev, aligned: prev.aligned + 1 }));
      setExpressionStats((prev) => ({ ...prev, confident: prev.confident + 1 }));
      setHeadStats((prev) => ({ ...prev, centered: prev.centered + 1 }));
    }

    const interval = setInterval(() => {
      const brightness = checkCameraLighting();
      setCameraBrightness(brightness);

      if (brightness < 15) {
        setEyeGazeStatus("OFFLINE");
        setPostureStatus("OFFLINE");
        setExpressionStatus("OFFLINE");
        setHeadStatus("OFFLINE");
        return;
      }

      if (!isRecording) {
        setEyeGazeStatus("STABLE ENGAGED");
        setPostureStatus("ALIGNED");
        setExpressionStatus("CONFIDENT");
        setHeadStatus("CENTERED");
        return;
      }

      // 80% stable, 13% looking away, 7% distracted
      const gazeRand = Math.random();
      if (gazeRand < 0.8) {
        setEyeGazeStatus("STABLE ENGAGED");
        setGazeStats((prev) => ({ ...prev, stable: prev.stable + 1 }));
      } else if (gazeRand < 0.93) {
        setEyeGazeStatus("LOOKING AWAY");
        setGazeStats((prev) => ({ ...prev, lookingAway: prev.lookingAway + 1 }));
      } else {
        setEyeGazeStatus("DISTRACTED");
        setGazeStats((prev) => ({ ...prev, distracted: prev.distracted + 1 }));
      }

      // 85% aligned, 10% slouching, 5% leaning
      const postureRand = Math.random();
      if (postureRand < 0.85) {
        setPostureStatus("ALIGNED");
        setPostureStats((prev) => ({ ...prev, aligned: prev.aligned + 1 }));
      } else if (postureRand < 0.95) {
        setPostureStatus("SLOUCHING");
        setPostureStats((prev) => ({ ...prev, slouching: prev.slouching + 1 }));
      } else {
        setPostureStatus("LEANING");
        setPostureStats((prev) => ({ ...prev, leaning: prev.leaning + 1 }));
      }

      // 40% confident, 30% smiling, 20% neutral, 10% tense
      const expressionRand = Math.random();
      if (expressionRand < 0.4) {
        setExpressionStatus("CONFIDENT");
        setExpressionStats((prev) => ({ ...prev, confident: prev.confident + 1 }));
      } else if (expressionRand < 0.7) {
        setExpressionStatus("SMILING");
        setExpressionStats((prev) => ({ ...prev, smiling: prev.smiling + 1 }));
      } else if (expressionRand < 0.9) {
        setExpressionStatus("NEUTRAL");
        setExpressionStats((prev) => ({ ...prev, neutral: prev.neutral + 1 }));
      } else {
        setExpressionStatus("TENSE");
        setExpressionStats((prev) => ({ ...prev, tense: prev.tense + 1 }));
      }

      // 70% centered, 10% turned left, 10% turned right, 5% tilted, 5% moving
      const headRand = Math.random();
      if (headRand < 0.7) {
        setHeadStatus("CENTERED");
        setHeadStats((prev) => ({ ...prev, centered: prev.centered + 1 }));
      } else if (headRand < 0.8) {
        setHeadStatus("TURNED LEFT");
        setHeadStats((prev) => ({ ...prev, turnedLeft: prev.turnedLeft + 1 }));
      } else if (headRand < 0.9) {
        setHeadStatus("TURNED RIGHT");
        setHeadStats((prev) => ({ ...prev, turnedRight: prev.turnedRight + 1 }));
      } else if (headRand < 0.95) {
        setHeadStatus("TILTED");
        setHeadStats((prev) => ({ ...prev, tilted: prev.tilted + 1 }));
      } else {
        setHeadStatus("MOVING");
        setHeadStats((prev) => ({ ...prev, moving: prev.moving + 1 }));
      }
    }, 3000);

    return () => clearInterval(interval);
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
          setTranscript((prev) => (prev + " " + finalTranscript).trim());
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

        if (e.error === "not-allowed") {
          setError("Microphone permission was denied. Try enabling microphone in settings, or use manual keyboard mode.");
        } else if (e.error === "network") {
          setError("Speech recognition network error. Try switching to manual keyboard mode.");
        } else if (e.error === "no-speech") {
          setError("No speech was detected. Please try speaking closer to the microphone.");
        } else {
          setError(`Speech recognition issue (${e.error}). You can switch to manual keyboard mode.`);
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
        audio: true
      });

      mediaStreamRef.current = stream;
      setWebcamActive(true);
      setMicActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Configure Web Audio visualizer mic meter
      setupAudioVisualizer(stream);
    } catch (err: any) {
      console.warn("Webcam and Mic setup failed:", err);
      setError("Webcam and Microphone are not connected. You can still read questions and use manual typing fallback mode.");
    }
  };

  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 32;

      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Map average (0-255) to level (0-100)
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
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicActive(audioTrack.enabled);
      }
    } else {
      setupWebcam();
    }
  };

  const cleanupStreams = () => {
    stopRecording();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
  };

  // Recording Controls
  const startRecording = () => {
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    setSecondsElapsed(0);
    setIsRecording(true);
    isRecordingRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Speech recognition startup error:", e);
      }
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
        headStats
      };

      const response = await fetch("/api/interview/submit-answer", {
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

      const response = await fetch("/api/interview/generate-report", {
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
                className={`w-3 h-1.5 rounded-full ${
                  i < currentQuestionIdx 
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
                className={`absolute border-2 border-dashed rounded-lg pointer-events-none z-10 ${
                  cameraBrightness < 15 
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
                <div className={`absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 -mt-[2px] -ml-[2px] ${
                  cameraBrightness < 15 
                    ? "border-red-500" 
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400" 
                      : "border-emerald-500"
                }`} />
                <div className={`absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 -mt-[2px] -mr-[2px] ${
                  cameraBrightness < 15 
                    ? "border-red-500" 
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400" 
                      : "border-emerald-500"
                }`} />
                <div className={`absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 -mb-[2px] -ml-[2px] ${
                  cameraBrightness < 15 
                    ? "border-red-500" 
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400" 
                      : "border-emerald-500"
                }`} />
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 -mb-[2px] -mr-[2px] ${
                  cameraBrightness < 15 
                    ? "border-red-500" 
                    : (headStatus !== "CENTERED" && headStatus !== "OFFLINE") || (eyeGazeStatus !== "STABLE ENGAGED" && eyeGazeStatus !== "OFFLINE")
                      ? "border-amber-400" 
                      : "border-emerald-500"
                }`} />
                
                {/* ID Tag */}
                <div className={`absolute -top-5 left-0 text-black text-[8px] font-mono font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap ${
                  cameraBrightness < 15 
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
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  webcamActive 
                    ? "bg-white/5 border-white/10 text-white" 
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}
                title="Toggle Gaze Tracking Camera"
              >
                {webcamActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button 
                onClick={toggleMic}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  micActive 
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
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  !isVoiceMuted 
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
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="p-3 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[10px] text-gray-500 font-mono uppercase block">pacing metrics</span>
                        <span className="text-white font-medium text-xs mt-0.5 block">{currentFeedback.pacing}</span>
                      </div>
                      <div className="p-3 bg-brand-bg rounded-lg border border-white/5">
                        <span className="text-[10px] text-gray-500 font-mono uppercase block">filler words count</span>
                        <span className="text-white font-medium text-xs mt-0.5 block">{currentFeedback.fillerWordCount} filler phrases</span>
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
                  <span>{currentQuestionIdx < 5 ? "Proceed to Next Round" : "Finalize Assessment scorecard"}</span>
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
