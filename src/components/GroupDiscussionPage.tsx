import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Users,
  Mic,
  MicOff,
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
import Button from "./ui/Button";

interface GroupDiscussionPageProps {
  studentProfile: StudentProfile;
  onNavigate: (view: string) => void;
}

interface GDParticipant {
  id: string;
  name: string;
  roll: string;
  isHost: boolean;
  joinedAt: number;
}

interface GDTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerRoll: string;
  text: string;
  timestamp: number;
}

interface GDEvalCriterion {
  score: number;
  comments: string;
}

interface GDEvaluationParticipant {
  name: string;
  roll: string;
  overallScore: number;
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
}

interface GDEvaluation {
  participants: GDEvaluationParticipant[];
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

  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [topic, setTopic] = useState(PRESET_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  const [participantName, setParticipantName] = useState(studentProfile.studentId || "");
  const [participantRoll, setParticipantRoll] = useState(studentProfile.studentId || "");

  const [participants, setParticipants] = useState<GDParticipant[]>([]);
  const [dialogue, setDialogue] = useState<GDTurn[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomStarted, setRoomStarted] = useState(false);
  const [joinedRoomCode, setJoinedRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [evaluation, setEvaluation] = useState<GDEvaluation | null>(null);

  const [currentText, setCurrentText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [receiveLog, setReceiveLog] = useState<string[]>([]);
  const [isPollingMode, setIsPollingMode] = useState(false);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    setupSpeechRecognition();
    return () => {
      cleanupAudioStreams();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          // no-op
        }
      }
      socketRef.current?.close();
    };
  }, []);

  // HTTP Polling loop to get room state when in polling mode (e.g. Vercel serverless)
  useEffect(() => {
    if (!isPollingMode || !joinedRoomCode || !myParticipantId || step !== "discussion") return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/gd-room/state?roomCode=${joinedRoomCode}&participantId=${myParticipantId}&t=${Date.now()}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch state");
        }
        const state = await res.json();
        if (!active) return;

        setError(null); // Clear connection lost error since polling succeeded

        // Sync local states with polled state
        setParticipants(state.participants || []);
        setDialogue(state.dialogue || []);
        setHostId(state.hostId || null);
        setRoomStarted(Boolean(state.startedAt));
        if (state.evaluation) {
          setEvaluation(state.evaluation);
          setStep("results");
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setError("Connection lost. Retrying to sync room...");
      }
    };

    poll(); // run immediately
    const interval = setInterval(poll, 2500); // poll every 2.5 seconds

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isPollingMode, joinedRoomCode, myParticipantId, step]);

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: any) => {
      let finalTranscript = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + " ";
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setCurrentText((prev) => (prev + " " + finalTranscript).trim());
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };

    rec.onerror = (e: any) => {
      console.error("GD Speech Recognition error:", e);
      isRecordingRef.current = false;
      setIsRecording(false);
      setInterimText("");

      if (e.error === "not-allowed") {
        setError("Microphone permission was denied. Please allow mic access or use manual keyboard typing.");
      } else if (e.error === "network") {
        setError("Speech recognition network error. Try switching to manual keyboard mode.");
      } else if (e.error === "no-speech") {
        setError("No speech was detected. Please try speaking closer to the microphone.");
      } else {
        setError(`Speech recognition issue (${e.error}). You can switch to manual keyboard mode.`);
      }
    };

    rec.onend = () => {
      if (isRecordingRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          setIsRecording(false);
          isRecordingRef.current = false;
          setInterimText("");
        }
      } else {
        setIsRecording(false);
        isRecordingRef.current = false;
        setInterimText("");
      }
    };

    recognitionRef.current = rec;
  };

  const connectToRoomSocket = () => {
    return new Promise<void>((resolve, reject) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      setConnectionLoading(true);
      setError(null);

      try {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        // If served from Vite dev server (e.g., port 5173), direct the WebSocket to the backend port 3000
        const host = (window.location.port && window.location.port !== "3000") ? `${window.location.hostname}:3000` : window.location.host;
        const socket = new WebSocket(`${protocol}://${host}/ws/gd-room`);
        socketRef.current = socket;

        socket.onopen = () => {
          setSocketConnected(true);
          setConnectionLoading(false);
          setReceiveLog((prev) => [...prev, "Connected to discussion room server."]);
          resolve();
        };

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === "joined_room") {
              setJoinedRoomCode(message.roomCode);
              setMyParticipantId(message.participantId);
              setIsHost(Boolean(message.isHost));
              setReceiveLog((prev) => [...prev, `Joined room ${message.roomCode}.`]);
            }

            if (message.type === "room_state") {
              setParticipants(message.participants || []);
              setDialogue(message.dialogue || []);
              setHostId(message.hostId || null);
              setRoomStarted(Boolean(message.startedAt));
              if (!joinedRoomCode && message.roomCode) {
                setJoinedRoomCode(message.roomCode);
              }
            }

            if (message.type === "new_turn") {
              setDialogue((prev) => [...prev, message.turn]);
            }

            if (message.type === "discussion_started") {
              setRoomStarted(true);
              setReceiveLog((prev) => [...prev, "Discussion started."]);
            }

            if (message.type === "evaluation_result") {
              setEvaluation(message.evaluation);
              setStep("results");
              setReceiveLog((prev) => [...prev, "Evaluation received."]);
            }

            if (message.type === "error") {
              setError(message.message || "An error occurred.");
            }
          } catch (e) {
            console.error("Invalid socket message:", e, event.data);
          }
        };

        socket.onclose = () => {
          setSocketConnected(false);
          setConnectionLoading(false);
          setReceiveLog((prev) => [...prev, "Socket connection closed. Switching to HTTP Polling..."]);
          setIsPollingMode(true);
        };

        socket.onerror = (event) => {
          console.error("Socket error:", event);
          setError("WebSocket connection error. Please refresh and try again.");
          reject(event);
        };
      } catch (err) {
        setConnectionLoading(false);
        setError("Failed to open WebSocket connection.");
        reject(err);
      }
    });
  };

  const sendSocketMessage = (payload: any) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("Socket is not connected. Please connect or refresh the page.");
      return;
    }
    socketRef.current.send(JSON.stringify(payload));
  };

  const joinRoom = async () => {
    if (!participantName.trim()) {
      setError("Enter your name before joining a room.");
      return;
    }
    if (!participantRoll.trim()) {
      setError("Enter your roll number before joining a room.");
      return;
    }
    if (mode === "join" && !roomCode.trim()) {
      setError("Enter a room code to join.");
      return;
    }
    if (mode === "create" && !(useCustomTopic ? customTopic.trim() : topic.trim())) {
      setError("Enter a topic to create a room.");
      return;
    }

    setError(null);
    try {
      // Try WebSocket connection first
      await connectToRoomSocket();
      sendSocketMessage({
        type: "join_room",
        createNew: mode === "create",
        roomCode: roomCode.trim(),
        topic: mode === "create" ? (useCustomTopic ? customTopic.trim() : topic.trim()) : undefined,
        name: participantName.trim(),
        roll: participantRoll.trim(),
      });
      setStep("discussion");
    } catch (err) {
      console.warn("WebSocket room connection failed, falling back to HTTP Polling...", err);
      // Fallback: HTTP Polling mode!
      try {
        setConnectionLoading(true);
        setError(null); // Clear WebSocket errors since we are falling back to polling
        const res = await fetch("/api/gd-room/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: participantName.trim(),
            roll: participantRoll.trim(),
            createNew: mode === "create",
            roomCode: roomCode.trim(),
            topic: mode === "create" ? (useCustomTopic ? customTopic.trim() : topic.trim()) : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to join room via HTTP.");
        }
        setJoinedRoomCode(data.roomCode);
        setMyParticipantId(data.participantId);
        setIsHost(Boolean(data.isHost));
        setIsPollingMode(true);
        setStep("discussion");
        setReceiveLog((prev) => [...prev, "Connected to room via HTTP Polling mode (WebSockets not available)."]);
      } catch (httpErr: any) {
        setError(httpErr.message || "Unable to connect to the group discussion room.");
      } finally {
        setConnectionLoading(false);
      }
    }
  };

  const startDiscussionRoom = async () => {
    if (!isHost) {
      setError("Only the host can start the discussion.");
      return;
    }
    if (isPollingMode) {
      try {
        const res = await fetch("/api/gd-room/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: joinedRoomCode, participantId: myParticipantId }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to start room.");
        }
      } catch (err: any) {
        setError(err.message);
      }
    } else {
      sendSocketMessage({ type: "start_discussion" });
    }
  };

  const submitRoomTurn = async () => {
    if (!currentText.trim()) {
      setError("Type or speak a response before submitting.");
      return;
    }
    if (!roomStarted) {
      setError("The discussion has not started yet.");
      return;
    }

    setError(null);
    if (isPollingMode) {
      try {
        const res = await fetch("/api/gd-room/submit-turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: joinedRoomCode, participantId: myParticipantId, text: currentText.trim() }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to submit response.");
        }
        setCurrentText("");
      } catch (err: any) {
        setError(err.message);
      }
    } else {
      sendSocketMessage({ type: "submit_turn", text: currentText.trim() });
      setCurrentText("");
    }
  };

  const endRoomDiscussion = async () => {
    if (!isHost) {
      setError("Only the host can end the discussion.");
      return;
    }
    if (isPollingMode) {
      setConnectionLoading(true);
      try {
        const res = await fetch("/api/gd-room/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: joinedRoomCode, participantId: myParticipantId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to end discussion.");
        }
        setEvaluation(data.evaluation);
        setStep("results");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setConnectionLoading(false);
      }
    } else {
      sendSocketMessage({ type: "end_discussion" });
    }
  };

  const leaveRoom = async () => {
    if (isPollingMode) {
      try {
        await fetch("/api/gd-room/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: joinedRoomCode, participantId: myParticipantId }),
        });
      } catch (err) {
        console.error("Error leaving room:", err);
      }
      setIsPollingMode(false);
      setMyParticipantId(null);
    } else {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        sendSocketMessage({ type: "leave_room" });
        socketRef.current.close();
      }
    }
    setSocketConnected(false);
    setStep("setup");
    setParticipants([]);
    setDialogue([]);
    setJoinedRoomCode(null);
    setIsHost(false);
    setRoomStarted(false);
    setEvaluation(null);
    setReceiveLog([]);
  };

  const startVoiceCapture = async () => {
    setError(null);
    setIsRecording(true);
    isRecordingRef.current = true;
    setInterimText("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Speech recognition start failed:", e);
      }
    }

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
        for (let i = 0; i < bufferLength; i += 1) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicLevel(Math.min(100, Math.round((average / 110) * 100)));
        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (err) {
      console.warn("Could not start audio visualizer:", err);
    }
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setInterimText("");
    setMicLevel(0);
    cleanupAudioStreams();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
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

  const topicToUse = useCustomTopic ? customTopic.trim() : topic;
  const roomStatusText = roomStarted ? "Active discussion" : "Waiting for host to start the discussion";
  const participantCount = participants.length;

  const renderCriterionRow = (
    label: string,
    leftCrit: GDEvalCriterion,
    rightCrit?: GDEvalCriterion
  ) => {
    const renderStars = (score: number) => (
      <div className="flex items-center space-x-0.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <span
            key={value}
            className={`text-lg font-bold ${value <= score ? "text-brand-primary" : "text-slate-200"}`}
          >
            ★
          </span>
        ))}
        <span className="text-xs font-mono font-bold text-slate-700 ml-1">({leftCrit.score}/5)</span>
      </div>
    );

    return (
      <tr className="border-b border-slate-100 text-slate-700 text-xs">
        <td className="py-3 px-4 font-semibold text-slate-800 align-top w-1/4">{label}</td>
        <td className="py-3 px-4 w-3/8 align-top border-r border-slate-100">
          {renderStars(leftCrit.score)}
          <p className="mt-1 text-slate-600 text-[11px] leading-normal font-sans">{leftCrit.comments}</p>
        </td>
        <td className="py-3 px-4 w-3/8 align-top">
          {rightCrit ? (
            <>
              {renderStars(rightCrit.score)}
              <p className="mt-1 text-slate-600 text-[11px] leading-normal font-sans">{rightCrit.comments}</p>
            </>
          ) : (
            <span className="text-[11px] text-slate-500">N/A</span>
          )}
        </td>
      </tr>
    );
  };

  const resetGD = () => {
    setStep("setup");
    setDialogue([]);
    setParticipants([]);
    setJoinedRoomCode(null);
    setIsHost(false);
    setRoomStarted(false);
    setEvaluation(null);
    setError(null);
    setReceiveLog([]);
    setCurrentText("");
  };

  const evaluationParticipants = evaluation?.participants || [];
  const primaryParticipant = evaluationParticipants[0];
  const secondaryParticipant = evaluationParticipants[1];

  return (
    <div id="gd-workspace-page" className="max-w-7xl mx-auto px-6 py-8 font-sans space-y-6">
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
            <h1 className="font-display font-bold text-2xl text-slate-900 leading-tight">Group Discussion Assessment</h1>
            <p className="text-xs text-slate-500 font-mono">Aditya Soft Skills Training Cell • Evaluation Center</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {step !== "setup" && (
            <Button variant="ghost" size="sm" onClick={resetGD}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Reset Workspace
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onNavigate("dashboard")}>Back to Command</Button>
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

      {step === "setup" && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          <div className="lg:col-span-8 bg-white border border-slate-100 shadow-sm rounded-2xl p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center">
                <Users className="w-4 h-4 text-brand-primary mr-2" />
                Discussion Room Setup
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Create or join a live room for multi-participant group discussion.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === "create"}
                  onChange={() => setMode("create")}
                  className="accent-brand-primary"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Create a room</div>
                  <div className="text-xs text-slate-500">Start a new discussion and invite peers with the room code.</div>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer">
                <input
                  type="radio"
                  checked={mode === "join"}
                  onChange={() => setMode("join")}
                  className="accent-brand-primary"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Join an existing room</div>
                  <div className="text-xs text-slate-500">Enter a room code to participate in a live discussion.</div>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Your name</label>
                <input
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary"
                  placeholder="e.g. Arjun Prasad"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Roll number</label>
                <input
                  value={participantRoll}
                  onChange={(e) => setParticipantRoll(e.target.value)}
                  className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary uppercase"
                  placeholder="e.g. 23A91A0501"
                />
              </div>
            </div>

            {mode === "join" ? (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px] mb-1">Room code</label>
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary uppercase"
                  placeholder="Enter existing room code"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.5px]">Discussion topic</label>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={!useCustomTopic}
                      onChange={() => setUseCustomTopic(false)}
                      className="accent-brand-primary"
                    />
                    Preset topic
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      checked={useCustomTopic}
                      onChange={() => setUseCustomTopic(true)}
                      className="accent-brand-primary"
                    />
                    Custom topic
                  </label>
                </div>

                {!useCustomTopic ? (
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary"
                  >
                    {PRESET_TOPICS.map((option, index) => (
                      <option key={index} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    rows={3}
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="w-full text-xs py-3 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-brand-primary font-sans"
                    placeholder="Enter a custom group discussion topic"
                  />
                )}
              </div>
            )}

            <div className="pt-2">
              <Button onClick={joinRoom} className="w-full badge-white-text">
                {mode === "create" ? "Create Room" : "Join Room"}
              </Button>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">Group Discussion Workflow</h3>
              <ul className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>Each participant joins with a shared room code and submits text/audio turns live.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>The room host starts the discussion once peers have joined.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-brand-primary mt-0.5 shrink-0" />
                  <span>All turns are collected and evaluated automatically when the discussion ends.</span>
                </li>
              </ul>
            </div>

            <div className="bg-brand-accent/5 border border-brand-accent/15 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-brand-accent uppercase tracking-wider flex items-center">
                <Sparkles className="w-4 h-4 mr-1.5 shrink-0" /> Soft Skills Assessment
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Evaluations use discussion dynamics, participation, listening, reasoning, collaboration, and leadership indicators to generate a coach-ready report.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {step === "discussion" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Room Code</span>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">{joinedRoomCode || roomCode || "—"}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-500 uppercase font-mono">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                    <div className="font-bold text-slate-800">{participantCount}</div>
                    Participants
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                    <div className="font-bold text-slate-800">{roomStarted ? "Live" : "Pending"}</div>
                    Status
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500">{roomStatusText}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.map((p) => (
                  <div key={p.id} className="border border-slate-100 rounded-2xl p-3 bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                        <div className="text-[10px] uppercase tracking-[0.5px] text-slate-500">{p.roll}</div>
                      </div>
                      {p.isHost && <span className="text-[10px] font-semibold uppercase text-brand-primary">Host</span>}
                    </div>
                  </div>
                ))}
              </div>

              {!roomStarted && isHost && (
                <div className="pt-4">
                  <Button onClick={startDiscussionRoom} className="badge-white-text w-full">
                    Start Discussion
                  </Button>
                </div>
              )}
              {!roomStarted && !isHost && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-slate-600 text-xs">
                  Waiting for the host to start the discussion. You can still prepare your response text.
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Current Topic</span>
                  <h3 className="text-base font-bold text-slate-800 mt-0.5">{topicToUse}</h3>
                </div>
                <div className="text-xs text-slate-500">Turns: {dialogue.length}</div>
              </div>

              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 min-h-[150px] scrollbar-thin">
                {dialogue.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-mono text-xs border border-dashed border-slate-200 rounded-xl">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Discussion transcript is empty. Submit the first turn once the discussion begins.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dialogue.map((turn) => (
                      <div key={turn.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-[0.5px] mb-2">
                          <span>{turn.speakerName} • {turn.speakerRoll}</span>
                          <span>{new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-slate-800 leading-relaxed">{turn.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Live Submission</span>
                  <h3 className="text-base font-bold text-slate-800 mt-0.5">Your turn</h3>
                </div>
                <span className="text-[10px] uppercase tracking-[0.5px] font-semibold text-slate-500">{socketConnected ? "Connected" : isPollingMode ? "Connected (Polling)" : connectionLoading ? "Connecting..." : "Disconnected"}</span>
              </div>

              <textarea
                rows={5}
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                placeholder={roomStarted ? "Type your turn text here..." : "Prepare your response before the discussion starts..."}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-primary font-sans"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                  className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold border transition ${
                    isRecording
                      ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                      : "bg-brand-primary/5 border-brand-primary/15 text-brand-primary hover:bg-brand-primary/10"
                  }`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isRecording ? "Stop Recording" : "Record Speech"}
                </button>
                <Button onClick={submitRoomTurn} className="badge-white-text w-full" disabled={!roomStarted}>
                  <Check className="w-4 h-4 mr-1" /> Submit Turn
                </Button>
              </div>

              {isRecording && (
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-slate-600 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Recording active</span>
                    <span>{micLevel}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-primary transition-all" style={{ width: `${micLevel}%` }} />
                  </div>
                  {interimText && <p className="mt-2 italic text-[11px] text-slate-500">Spoken: "{interimText}"</p>}
                </div>
              )}

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-[11px] flex items-start gap-2">
                <HelpCircle className="w-4 h-4 mt-0.5" />
                <div>If voice input fails, type your paragraph directly above. The host can end the discussion when the group is ready for evaluation.</div>
              </div>

              {isHost && roomStarted && (
                <Button onClick={endRoomDiscussion} className="badge-white-text w-full">
                  End Discussion & Evaluate
                </Button>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">Room Activity Log</h3>
              <div className="space-y-2 text-[11px] text-slate-600">
                {receiveLog.length === 0 ? (
                  <p className="text-slate-400">No events yet. Room updates appear here.</p>
                ) : (
                  receiveLog.slice(-5).map((item, index) => (
                    <div key={index} className="rounded-xl bg-white border border-slate-100 p-3 text-slate-700">{item}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "results" && evaluation && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {evaluationParticipants.map((participant) => (
              <div key={participant.roll} className="bg-white border border-slate-100 shadow-xs p-5 rounded-2xl">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Candidate Scorecard</span>
                    <h3 className="text-lg font-bold text-slate-800 mt-1">{participant.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Roll Number: {participant.roll}</p>
                  </div>
                  <div className="text-center bg-slate-50 p-3 border border-slate-100 rounded-xl">
                    <span className="text-[9px] font-mono text-slate-400 uppercase">Overall Grade</span>
                    <div className="text-xl font-mono font-black text-brand-primary">{participant.overallScore}%</div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                  {participant.strengths.slice(0, 2).map((strength, index) => (
                    <span key={index} className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-brand-primary/5 text-brand-primary border border-brand-primary/10">✓ {strength}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Soft Skills Rubric Matrix</h3>
                <p className="text-[11px] text-slate-400 mt-1">Comparison of your discussion performance across evaluated criteria.</p>
              </div>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200"
              >
                <Printer className="w-3.5 h-3.5" /> Print Scorecard
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase font-mono tracking-wider">
                    <th className="py-2.5 px-4">Soft Skill Parameter</th>
                    <th className="py-2.5 px-4 w-3/8 text-brand-primary">{primaryParticipant?.name || "Participant 1"}</th>
                    <th className="py-2.5 px-4 w-3/8 text-brand-accent">{secondaryParticipant?.name || "Participant 2"}</th>
                  </tr>
                </thead>
                <tbody>
                  {primaryParticipant && renderCriterionRow("Participation & Engagement", primaryParticipant.criteria.participation, secondaryParticipant?.criteria.participation)}
                  {primaryParticipant && renderCriterionRow("Listening Skills", primaryParticipant.criteria.listeningSkills, secondaryParticipant?.criteria.listeningSkills)}
                  {primaryParticipant && renderCriterionRow("Argument Quality & Logic", primaryParticipant.criteria.argumentQuality, secondaryParticipant?.criteria.argumentQuality)}
                  {primaryParticipant && renderCriterionRow("Team Collaboration", primaryParticipant.criteria.teamCollaboration, secondaryParticipant?.criteria.teamCollaboration)}
                  {primaryParticipant && renderCriterionRow("Leadership Indicators", primaryParticipant.criteria.leadershipIndicators, secondaryParticipant?.criteria.leadershipIndicators)}
                  {primaryParticipant && renderCriterionRow("Conflict Handling", primaryParticipant.criteria.conflictHandling, secondaryParticipant?.criteria.conflictHandling)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {evaluationParticipants.map((participant) => (
              <div key={participant.roll} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2">Detailed Review: {participant.name}</h3>
                <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                  <div>
                    <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Key Strengths</span>
                    <ul className="list-disc pl-4 mt-1.5 space-y-1">
                      {participant.strengths.map((strength, index) => (
                        <li key={index}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Recommended Improvements</span>
                    <ul className="list-disc pl-4 mt-1.5 space-y-1">
                      {participant.improvements.map((improvement, index) => (
                        <li key={index}>{improvement}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider block">Coach Commentary</span>
                    <p className="mt-1.5 font-sans text-slate-600 leading-relaxed text-[11px]">{participant.coachFeedback}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2">Assessor's Panel Verdict</h4>
            <p className="text-xs leading-relaxed text-slate-600 font-sans">{evaluation.overallVerdict}</p>
          </div>

          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              #gd-workspace-page, #gd-workspace-page * { visibility: visible; }
              #gd-workspace-page { position: absolute; left: 0; top: 0; width: 100%; background: white !important; color: black !important; }
              .no-print, button, a { display: none !important; }
            }
          ` }} />
        </motion.div>
      )}
    </div>
  );
}
