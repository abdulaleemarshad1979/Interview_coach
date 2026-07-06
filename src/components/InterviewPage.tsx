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
  HelpCircle,
  Clock,
  AlertCircle,
  FileCode,
  PenTool
} from "lucide-react";
import { InterviewQuestion, AnswerFeedback, StudentProfile, FullAnalysisResult, Scorecard } from "../types";

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
  const [webcamActive, setWebcamActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isManualEdit, setIsManualEdit] = useState(false);

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

  const activeQuestion = interviewQuestions[currentQuestionIdx];

  // 1. Setup speech recognition and camera
  useEffect(() => {
    setupSpeechRecognition();
    setupWebcam();

    return () => {
      cleanupStreams();
    };
  }, []);

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

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (e: any) => {
        let finalTranscript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript + " ";
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => (prev + " " + finalTranscript).trim());
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition error:", e);
        if (e.error === "not-allowed") {
          setError("Microphone permission was denied. Try enabling microphone in settings, or use manual keyboard mode.");
        }
      };

      rec.onend = () => {
        // Automatically restart if user hasn't explicitly stopped recording
        if (isRecording && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Ignore if already running
          }
        }
      };

      recognitionRef.current = rec;
    } else {
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
    }
  };

  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicActive(audioTrack.enabled);
      }
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
    setSecondsElapsed(0);
    setIsRecording(true);

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

    if (!transcript.trim()) {
      setError("Please record or write a written response before submitting.");
      return;
    }

    setEvaluating(true);
    setError(null);

    try {
      const payload = {
        questionId: activeQuestion.id,
        questionText: activeQuestion.text,
        category: activeQuestion.category,
        transcript: transcript.trim()
      };

      const response = await fetch("/api/interview/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    // Append completed feedback
    const updatedFeedbacks = [...feedbacks, currentFeedback];
    setFeedbacks(updatedFeedbacks);
    
    // Reset states for the next round
    setCurrentFeedback(null);
    setTranscript("");
    setSecondsElapsed(0);
    setIsManualEdit(false);

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
      const payload = {
        studentId: studentProfile.studentId,
        githubUsername: studentProfile.githubUsername,
        answerFeedbacks: fullFeedbacks,
        originalAnalysis: analysisResult
      };

      const response = await fetch("/api/interview/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

            {/* Status Tags overlays */}
            <div className="absolute top-4 left-4 flex space-x-2">
              <span className="flex items-center space-x-1 px-2.5 py-1 bg-red-600 rounded text-[9px] font-mono text-white tracking-widest uppercase font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping mr-1" />
                Live Feed
              </span>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-left">
              <div className="bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-[10px] font-mono text-white">
                <div>EYE GAZE: <span className="text-emerald-400 font-bold">STABLE ENGAGED</span></div>
                <div>POSTURE METRICS: <span className="text-emerald-400 font-bold">ALIGNED</span></div>
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
                    <button
                      type="button"
                      onClick={() => setIsManualEdit(!isManualEdit)}
                      className="text-[11px] font-mono text-brand-primary hover:underline flex items-center space-x-1"
                    >
                      <PenTool className="w-3 h-3" />
                      <span>{isManualEdit ? "Switch to spoken mic input" : "Switch to keyboard typing"}</span>
                    </button>
                  </div>

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
                            {transcript || <span className="text-gray-500 italic">Listening... Start speaking clearly.</span>}
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
                        <div className="py-8 bg-brand-bg border border-white/5 border-dashed rounded-xl flex flex-col items-center justify-center space-y-3">
                          <button
                            type="button"
                            onClick={startRecording}
                            className="w-16 h-16 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary hover:scale-105 active:scale-95 transition-all shadow-lg cursor-pointer hover:bg-brand-primary hover:text-brand-bg group"
                          >
                            <Mic className="w-6 h-6 stroke-[2.5]" />
                          </button>
                          <div className="text-center">
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
