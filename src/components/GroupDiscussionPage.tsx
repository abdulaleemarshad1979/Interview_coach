import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  Mic, 
  MicOff, 
  Play, 
  Check, 
  Award, 
  Loader2, 
  ArrowRight,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Printer,
  ChevronRight,
  Plus,
  Trash2,
  Edit2
} from "lucide-react";
import { StudentProfile } from "../types";
import { supabase } from "../lib/supabaseClient";
import Button from "./ui/Button";

interface GroupDiscussionPageProps {
  studentProfile: StudentProfile;
  onNavigate: (view: string) => void;
}

interface GDTurn {
  id: string;
  studentIndex: 1 | 2;
  studentName: string;
  studentRoll: string;
  text: string;
  timestamp: number;
}

interface GDEvalCriterion {
  score: number; // 1-5 scale
  comments: string;
}

interface GDEvaluation {
  student1: {
    name: string;
    roll: string;
    overallScore: number; // 0-100
    criteria: {
      participation: GDEvalCriterion;
      listeningSkills: GDEvalCriterion;
      argumentQuality: GDEvalCriterion;
      teamCollaboration: GDEvalCriterion;
      leadershipIndicators: GDEvalCriterion;
      conflictHandling: GDEvalCriterion;
    };
    strengths: string[];
    improvements: string[];
    coachFeedback: string;
  };
  student2: {
    name: string;
    roll: string;
    overallScore: number; // 0-100
    criteria: {
      participation: GDEvalCriterion;
      listeningSkills: GDEvalCriterion;
      argumentQuality: GDEvalCriterion;
      teamCollaboration: GDEvalCriterion;
      leadershipIndicators: GDEvalCriterion;
      conflictHandling: GDEvalCriterion;
    };
    strengths: string[];
    improvements: string[];
    coachFeedback: string;
  };
  overallVerdict: string;
}

const PRESET_TOPICS = [
  "Will AI and ChatGPT replace software engineers or make them better?",
  "Should engineering education prioritize coding skills over core theoretical foundations?",
  "Remote work vs. Office work: Impact on team productivity and culture.",
  "Social media: A tool for true global connection or a source of social isolation?",
  "Cryptocurrency and Web3: The future of digital economics or a speculative bubble?",
  "Is the gig economy beneficial for young professionals starting their careers?"
];

export default function GroupDiscussionPage({ studentProfile, onNavigate }: GroupDiscussionPageProps) {
  const [step, setStep] = useState<"setup" | "discussion" | "results">("setup");

  // Setup state
  const [student1Name, setStudent1Name] = useState("");
  const [student1Roll, setStudent1Roll] = useState(studentProfile.studentId || "");
  const [student2Name, setStudent2Name] = useState("");
  const [student2Roll, setStudent2Roll] = useState("");
  const [selectedTopic, setSelectedTopic] = useState(PRESET_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [isCustomTopic, setIsCustomTopic] = useState(false);

  // Discussion state
  const [dialogue, setDialogue] = useState<GDTurn[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<1 | 2>(1);
  const [currentText, setCurrentText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editTurnId, setEditTurnId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Speech Recognition & Audio visualizer refs
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Evaluation state
  const [loadingEval, setLoadingEval] = useState(false);
  const [evaluation, setEvaluation] = useState<GDEvaluation | null>(null);

  const topicToUse = isCustomTopic ? customTopic : selectedTopic;

  useEffect(() => {
    setupSpeechRecognition();
    return () => {
      cleanupAudioStreams();
    };
  }, []);

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
          setCurrentText((prev) => (prev + " " + finalTranscript).trim());
        }
      };

      rec.onerror = (e: any) => {
        console.error("GD Speech Recognition error:", e);
        if (e.error === "not-allowed") {
          setError("Microphone permission was denied. Please allow mic access or use manual keyboard typing.");
        }
      };

      rec.onend = () => {
        if (isRecording && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            // Already started
          }
        }
      };

      recognitionRef.current = rec;
    } else {
      console.warn("SpeechRecognition is not supported in this browser.");
    }
  };

  const startVoiceCapture = async () => {
    setError(null);
    setIsRecording(true);
    
    // Start Speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Speech recognition start failed:", e);
      }
    }

    // Start Audio Meter Visualizer
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

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
        setMicLevel(Math.min(100, Math.round((average / 110) * 100)));
        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (err) {
      console.warn("Could not start visual meter:", err);
      // Don't crash - let users still record text
    }
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    setMicLevel(0);
    cleanupAudioStreams();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // already stopped
      }
    }
  };

  const cleanupAudioStreams = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const handleStartDiscussion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student1Name.trim() || !student1Roll.trim() || !student2Name.trim() || !student2Roll.trim()) {
      setError("Please fill out names and roll numbers for both students.");
      return;
    }
    if (isCustomTopic && !customTopic.trim()) {
      setError("Please enter a custom topic.");
      return;
    }
    setError(null);
    setStep("discussion");
  };

  const handleSubmitTurn = () => {
    if (!currentText.trim()) {
      setError("Please say something or type your written response before submitting.");
      return;
    }
    setError(null);
    stopVoiceCapture();

    const speakerName = activeSpeaker === 1 ? student1Name : student2Name;
    const speakerRoll = activeSpeaker === 1 ? student1Roll : student2Roll;

    const newTurn: GDTurn = {
      id: "turn_" + Math.random().toString(36).substring(2, 9),
      studentIndex: activeSpeaker,
      studentName: speakerName,
      studentRoll: speakerRoll,
      text: currentText.trim(),
      timestamp: Date.now()
    };

    setDialogue((prev) => [...prev, newTurn]);
    setCurrentText("");
    
    // Toggle active speaker
    setActiveSpeaker((prev) => (prev === 1 ? 2 : 1));
  };

  const handleDeleteTurn = (id: string) => {
    setDialogue((prev) => prev.filter((t) => t.id !== id));
  };

  const startEditTurn = (turn: GDTurn) => {
    setEditTurnId(turn.id);
    setEditText(turn.text);
  };

  const saveEditTurn = () => {
    if (!editText.trim()) return;
    setDialogue((prev) => 
      prev.map((t) => (t.id === editTurnId ? { ...t, text: editText.trim() } : t))
    );
    setEditTurnId(null);
    setEditText("");
  };

  const handleEvaluateGD = async () => {
    if (dialogue.length < 2) {
      setError("Please have at least 2 turns in the conversation before evaluating.");
      return;
    }
    setLoadingEval(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      const payload = {
        topic: topicToUse,
        student1: { name: student1Name, roll: student1Roll },
        student2: { name: student2Name, roll: student2Roll },
        dialogue: dialogue.map((t) => ({
          speaker: t.studentName,
          roll: t.studentRoll,
          text: t.text
        }))
      };

      const res = await fetch("/api/interview/evaluate-gd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setEvaluation(data);
        setStep("results");
      } else {
        setError(data.error || "Failed to analyze dialogue. Make sure the backend server is running.");
      }
    } catch (err) {
      setError("Communication failure with grading servers. Check your connection.");
    } finally {
      setLoadingEval(false);
    }
  };

  const resetGD = () => {
    setStep("setup");
    setDialogue([]);
    setActiveSpeaker(1);
    setCurrentText("");
    setEvaluation(null);
    setError(null);
  };

  const renderCriterionRow = (label: string, crit1: GDEvalCriterion, crit2: GDEvalCriterion) => {
    const renderStars = (score: number, isOrange: boolean) => {
      return (
        <div className="flex items-center space-x-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <span 
              key={s} 
              className={`text-lg font-bold ${
                s <= score 
                  ? (isOrange ? "text-brand-accent" : "text-brand-primary") 
                  : "text-slate-200"
              }`}
            >
              ★
            </span>
          ))}
          <span className="text-xs font-mono font-bold text-slate-700 ml-1">({score}/5)</span>
        </div>
      );
    };

    return (
      <tr className="border-b border-slate-100 text-slate-700 text-xs">
        <td className="py-3 px-4 font-semibold text-slate-800 align-top w-1/4">{label}</td>
        <td className="py-3 px-4 w-3/8 align-top border-r border-slate-100">
          {renderStars(crit1.score, false)}
          <p className="mt-1 text-slate-600 text-[11px] leading-normal font-sans">{crit1.comments}</p>
        </td>
        <td className="py-3 px-4 w-3/8 align-top">
          {renderStars(crit2.score, true)}
          <p className="mt-1 text-slate-600 text-[11px] leading-normal font-sans">{crit2.comments}</p>
        </td>
      </tr>
    );
  };

  return (
    <div id="gd-workspace-page" className="max-w-7xl mx-auto px-6 py-8 font-sans space-y-6">
      
      {/* Header with College logo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
            <img 
              src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg" 
              alt="Aditya University" 
              className="h-10 object-contain"
            />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900 leading-tight">
              Group Discussion Assessment
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              Aditya Soft Skills Training Cell • Evaluation Center
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {step !== "setup" && (
            <Button variant="ghost" size="sm" onClick={resetGD}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Reset Workspace
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onNavigate("dashboard")}>
            Back to Command
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-700 text-xs shadow-xs animate-pulse">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Execution Error:</span> {error}
          </div>
        </div>
      )}

      {/* Step 1: Setup */}
      {step === "setup" && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Setup Form */}
          <form onSubmit={handleStartDiscussion} className="lg:col-span-8 bg-white border border-slate-100 shadow-sm rounded-2xl p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center">
                <Users className="w-4 h-4 text-brand-primary mr-2" />
                Discussion Panel Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Define student profiles and choose a discussion topic to initialize grading context.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Student 1 Profile */}
              <div className="space-y-4 p-4 border border-brand-primary/10 rounded-xl bg-brand-primary/2">
                <h3 className="text-xs font-mono font-bold text-brand-primary uppercase tracking-wider flex items-center justify-between">
                  <span>Student 1 (First Speaker)</span>
                  <span className="h-2 w-2 rounded-full bg-brand-primary" />
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Arjun Prasad"
                      value={student1Name}
                      onChange={(e) => setStudent1Name(e.target.value)}
                      className="w-full text-xs py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Roll Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 23A91A0501"
                      value={student1Roll}
                      onChange={(e) => setStudent1Roll(e.target.value)}
                      className="w-full text-xs py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Student 2 Profile */}
              <div className="space-y-4 p-4 border border-brand-accent/10 rounded-xl bg-brand-accent/2">
                <h3 className="text-xs font-mono font-bold text-brand-accent uppercase tracking-wider flex items-center justify-between">
                  <span>Student 2 (Opponent / Partner)</span>
                  <span className="h-2 w-2 rounded-full bg-brand-accent" />
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Devi Priya"
                      value={student2Name}
                      onChange={(e) => setStudent2Name(e.target.value)}
                      className="w-full text-xs py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Roll Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 23A91A1202"
                      value={student2Roll}
                      onChange={(e) => setStudent2Roll(e.target.value)}
                      className="w-full text-xs py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-accent uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Topic selector */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-[0.5px]">Discussion Topic</label>
              
              <div className="flex items-center space-x-4 mb-2">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={!isCustomTopic} 
                    onChange={() => setIsCustomTopic(false)} 
                    className="accent-brand-primary"
                  />
                  <span>Select from Presets</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={isCustomTopic} 
                    onChange={() => setIsCustomTopic(true)}
                    className="accent-brand-primary"
                  />
                  <span>Write Custom Topic</span>
                </label>
              </div>

              {!isCustomTopic ? (
                <select 
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary"
                >
                  {PRESET_TOPICS.map((topic, i) => (
                    <option key={i} value={topic}>{topic}</option>
                  ))}
                </select>
              ) : (
                <textarea
                  rows={2}
                  placeholder="Enter custom GD topic description..."
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="w-full text-xs py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary font-sans"
                />
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full badge-white-text" showArrow>
                Launch Discussion Workspace
              </Button>
            </div>
          </form>

          {/* Right sidebar instructions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
                Evaluation Guidelines
              </h3>
              <ul className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>The grading system evaluates turn-taking, relevance, communication strength, and active listening.</span>
                </li>
                <li className="flex items-start">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>Both students should take at least **2 turns** each to demonstrate adequate argument depth and conflict handling.</span>
                </li>
                <li className="flex items-start">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>Use speech recognition to transcribe answers dynamically, or type/paste responses in the text field directly.</span>
                </li>
              </ul>
            </div>

            <div className="bg-brand-accent/5 border border-brand-accent/15 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-brand-accent uppercase tracking-wider flex items-center">
                <Sparkles className="w-4 h-4 mr-1.5 shrink-0" />
                Soft Skills Assessment Rubric
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Grading is derived directly from the university parameters framework. Criteria analyzed include: Participation frequency, active listening alignment, logical reasoning weightage, team collaboration balance, conflict management tone, and initiative indicators.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 2: Discussion View */}
      {step === "discussion" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Discussion timeline */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Active Topic</span>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">{topicToUse}</h3>
                </div>
                <div className="shrink-0 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 text-center">
                  <span className="text-[10px] text-slate-400 block uppercase font-mono">Turns</span>
                  <span className="text-sm font-mono font-bold text-slate-800">{dialogue.length}</span>
                </div>
              </div>

              {/* Scrollable Conversation Stream */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2 min-h-[150px] scrollbar-thin">
                {dialogue.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-mono text-xs border border-dashed border-slate-200 rounded-xl">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Dialogue stream is empty. Start typing or recording to log the first turn.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dialogue.map((turn) => {
                      const isStudent1 = turn.studentIndex === 1;
                      const isEditing = editTurnId === turn.id;

                      return (
                        <div 
                          key={turn.id} 
                          className={`flex flex-col max-w-[85%] ${isStudent1 ? "mr-auto" : "ml-auto"}`}
                        >
                          <div className={`flex items-center space-x-1.5 mb-1 text-[10px] font-mono ${isStudent1 ? "text-brand-primary justify-start" : "text-brand-accent justify-end"}`}>
                            <span className="font-bold">{turn.studentName}</span>
                            <span className="opacity-60">•</span>
                            <span className="uppercase">{turn.studentRoll}</span>
                          </div>

                          <div className={`p-3 rounded-2xl relative group ${
                            isStudent1 
                              ? "bg-brand-primary/10 text-slate-800 rounded-tl-xs border border-brand-primary/10" 
                              : "bg-brand-accent/10 text-slate-800 rounded-tr-xs border border-brand-accent/10"
                          }`}>
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea 
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-brand-primary font-sans text-slate-800"
                                  rows={3}
                                />
                                <div className="flex justify-end space-x-1.5">
                                  <button 
                                    onClick={() => setEditTurnId(null)}
                                    className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    onClick={saveEditTurn}
                                    className="px-2.5 py-1 text-[10px] bg-brand-primary text-white rounded font-medium cursor-pointer badge-white-text"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-xs leading-relaxed font-sans text-slate-800">{turn.text}</p>
                                
                                {/* Edit/Delete Floating Controls */}
                                <div className={`absolute top-1/2 -translate-y-1/2 hidden group-hover:flex items-center space-x-1.5 p-1 bg-white border border-slate-200 shadow-xs rounded-lg ${
                                  isStudent1 ? "-right-14" : "-left-14"
                                }`}>
                                  <button 
                                    onClick={() => startEditTurn(turn)}
                                    className="p-1 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                                    title="Edit speech"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTurn(turn.id)}
                                    className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                    title="Delete turn"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* AI compilation submission trigger */}
            {dialogue.length >= 2 && (
              <div className="p-4 border border-slate-100 bg-slate-50/50 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500 font-sans">
                  GD conversation meets minimum required threshold (min 2 turns). Submit for comprehensive Soft Skills report.
                </div>
                <Button 
                  onClick={handleEvaluateGD} 
                  loading={loadingEval}
                  disabled={loadingEval}
                  className="badge-white-text w-full sm:w-auto"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Evaluate Group Discussion
                </Button>
              </div>
            )}
          </div>

          {/* Active Speaking Turn Control Terminal */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Active Turn indicator */}
            <div className={`p-5 border shadow-sm rounded-2xl space-y-4 transition-all duration-300 ${
              activeSpeaker === 1 
                ? "bg-brand-primary/2 border-brand-primary/20" 
                : "bg-brand-accent/2 border-brand-accent/20"
            }`}>
              <div className="flex items-center justify-between border-b pb-3 border-slate-200/50">
                <div>
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block">Currently speaking</span>
                  <h3 className={`text-base font-bold flex items-center ${activeSpeaker === 1 ? "text-brand-primary" : "text-brand-accent"}`}>
                    <span className={`h-2.5 w-2.5 rounded-full mr-2 animate-ping ${activeSpeaker === 1 ? "bg-brand-primary" : "bg-brand-accent"}`} />
                    {activeSpeaker === 1 ? student1Name : student2Name}
                  </h3>
                </div>
                <span className="text-[10px] font-mono bg-slate-200/50 text-slate-700 px-2 py-0.5 rounded uppercase">
                  {activeSpeaker === 1 ? student1Roll : student2Roll}
                </span>
              </div>

              {/* Voice capture visual status banner */}
              {isRecording ? (
                <div className="p-3 bg-white border border-slate-100 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="text-xs text-red-600 font-mono font-medium">Recording active...</span>
                  </div>
                  
                  {/* Volume Level Meter Bar */}
                  <div className="flex items-center space-x-1 w-24 bg-slate-100 rounded-full h-2 overflow-hidden px-0.5">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-75 ${
                        activeSpeaker === 1 ? "bg-brand-primary" : "bg-brand-accent"
                      }`}
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {/* Input Transcript Editor Box */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-[0.5px]">
                  Turn Text (Transcribed or Typed Response)
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    isRecording 
                      ? "Listening to voice stream... (you can also edit this box directly)" 
                      : "Type your written response here, or click the mic button below to record..."
                  }
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-slate-400 font-sans leading-relaxed"
                />
              </div>

              {/* Voice + submit actions row */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                  className={`flex-1 flex items-center justify-center space-x-1.5 py-3 px-4 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                    isRecording 
                      ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100" 
                      : (activeSpeaker === 1 
                          ? "bg-brand-primary/5 hover:bg-brand-primary/10 border-brand-primary/15 text-brand-primary" 
                          : "bg-brand-accent/5 hover:bg-brand-accent/10 border-brand-accent/15 text-brand-accent"
                        )
                  }`}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-4 h-4 text-red-500" />
                      <span>Stop Recording</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Record Speech</span>
                    </>
                  )}
                </button>

                <Button 
                  onClick={handleSubmitTurn} 
                  className="flex-1 badge-white-text"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Submit Turn
                </Button>
              </div>

              {/* Troubleshooting Mic Warning Box */}
              <div className="p-3 bg-amber-50/60 border border-amber-200/50 rounded-xl text-[11px] text-amber-700 flex items-start space-x-2">
                <HelpCircle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                <div className="font-sans">
                  <span className="font-bold">Microphone troubleshooting:</span> If the voice recognition is failing or not capturing your speech, you can type your written response directly in the text area above. Editing the dialogue history is also allowed using the edit icon.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Evaluation results view */}
      {step === "results" && evaluation && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Comparison summary headers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Student 1 Score summary */}
            <div className="bg-white border border-slate-100 shadow-xs p-5 rounded-2xl relative overflow-hidden bg-linear-to-br from-brand-primary/2 to-transparent border-l-4 border-l-brand-primary">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="text-[10px] font-mono text-brand-primary uppercase font-bold tracking-wider">Candidate Scorecard 01</span>
                  <h3 className="text-lg font-bold text-slate-800 mt-1">{evaluation.student1.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Roll Number: {evaluation.student1.roll}</p>
                </div>
                
                <div className="text-center bg-white p-2 border border-slate-100 rounded-xl shadow-xs shrink-0">
                  <span className="text-[9px] font-mono text-slate-400 block uppercase">Overall Grade</span>
                  <span className="text-xl font-mono font-black text-brand-primary">{evaluation.student1.overallScore}%</span>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                {evaluation.student1.strengths.slice(0, 2).map((s, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-brand-primary/5 text-brand-primary border border-brand-primary/10">
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Student 2 Score summary */}
            <div className="bg-white border border-slate-100 shadow-xs p-5 rounded-2xl relative overflow-hidden bg-linear-to-br from-brand-accent/2 to-transparent border-l-4 border-l-brand-accent">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="text-[10px] font-mono text-brand-accent uppercase font-bold tracking-wider">Candidate Scorecard 02</span>
                  <h3 className="text-lg font-bold text-slate-800 mt-1">{evaluation.student2.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Roll Number: {evaluation.student2.roll}</p>
                </div>
                
                <div className="text-center bg-white p-2 border border-slate-100 rounded-xl shadow-xs shrink-0">
                  <span className="text-[9px] font-mono text-slate-400 block uppercase">Overall Grade</span>
                  <span className="text-xl font-mono font-black text-brand-accent">{evaluation.student2.overallScore}%</span>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                {evaluation.student2.strengths.slice(0, 2).map((s, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-brand-accent/5 text-brand-accent border border-brand-accent/10">
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>

          </div>

          {/* Assessment Criteria Matrix */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Soft Skills Rubric Matrix</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Side-by-side assessment comparison on university PDF parameters.</p>
              </div>
              
              <button 
                onClick={() => window.print()}
                className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer border border-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Scorecard</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-mono tracking-wider">
                    <th className="py-2.5 px-4">Soft Skill Parameter</th>
                    <th className="py-2.5 px-4 w-3/8 text-brand-primary">{evaluation.student1.name} Score</th>
                    <th className="py-2.5 px-4 w-3/8 text-brand-accent">{evaluation.student2.name} Score</th>
                  </tr>
                </thead>
                <tbody>
                  {renderCriterionRow(
                    "Participation & Engagement", 
                    evaluation.student1.criteria.participation, 
                    evaluation.student2.criteria.participation
                  )}
                  {renderCriterionRow(
                    "Listening Skills", 
                    evaluation.student1.criteria.listeningSkills, 
                    evaluation.student2.criteria.listeningSkills
                  )}
                  {renderCriterionRow(
                    "Argument Quality & Logic", 
                    evaluation.student1.criteria.argumentQuality, 
                    evaluation.student2.criteria.argumentQuality
                  )}
                  {renderCriterionRow(
                    "Team Collaboration", 
                    evaluation.student1.criteria.teamCollaboration, 
                    evaluation.student2.criteria.teamCollaboration
                  )}
                  {renderCriterionRow(
                    "Leadership Indicators", 
                    evaluation.student1.criteria.leadershipIndicators, 
                    evaluation.student2.criteria.leadershipIndicators
                  )}
                  {renderCriterionRow(
                    "Conflict Handling", 
                    evaluation.student1.criteria.conflictHandling, 
                    evaluation.student2.criteria.conflictHandling
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed qualitative review summaries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Student 1 review details */}
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold text-brand-primary uppercase tracking-widest border-b pb-2">
                Detailed Review: {evaluation.student1.name}
              </h3>
              
              <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                <div>
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Key Strengths</span>
                  <ul className="list-disc pl-4 mt-1.5 space-y-1">
                    {evaluation.student1.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Recommended Improvements</span>
                  <ul className="list-disc pl-4 mt-1.5 space-y-1">
                    {evaluation.student1.improvements.map((imp, i) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl mt-2">
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Coach Commentary</span>
                  <p className="mt-1.5 font-sans text-slate-600 leading-relaxed text-[11px]">{evaluation.student1.coachFeedback}</p>
                </div>
              </div>
            </div>

            {/* Student 2 review details */}
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold text-brand-accent uppercase tracking-widest border-b pb-2">
                Detailed Review: {evaluation.student2.name}
              </h3>
              
              <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                <div>
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Key Strengths</span>
                  <ul className="list-disc pl-4 mt-1.5 space-y-1">
                    {evaluation.student2.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Recommended Improvements</span>
                  <ul className="list-disc pl-4 mt-1.5 space-y-1">
                    {evaluation.student2.improvements.map((imp, i) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl mt-2">
                  <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Coach Commentary</span>
                  <p className="mt-1.5 font-sans text-slate-600 leading-relaxed text-[11px]">{evaluation.student2.coachFeedback}</p>
                </div>
              </div>
            </div>

          </div>

          {/* Overall Verdict block */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2">
              Assessor's Panel Verdict
            </h4>
            <p className="text-xs leading-relaxed text-slate-600 font-sans">
              {evaluation.overallVerdict}
            </p>
          </div>

          {/* Print specific stylesheet */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #gd-workspace-page, #gd-workspace-page * {
                visibility: visible;
              }
              #gd-workspace-page {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
              .no-print, button, a {
                display: none !important;
              }
            }
          `}} />

        </motion.div>
      )}

    </div>
  );
}
