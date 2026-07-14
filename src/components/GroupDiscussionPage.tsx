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
  Edit2,
  Video,
  VideoOff,
  Play,
  PhoneOff
} from "lucide-react";
import { StudentProfile } from "../types";
import Button from "./ui/Button";
import { getApiUrl, getWsUrl } from "../lib/api";

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



// Helper to generate a dynamic avatar color based on the participant's roll number
const getAvatarColor = (roll: string) => {
  const colors = [
    "bg-emerald-500", "bg-blue-500", "bg-indigo-500", "bg-purple-500",
    "bg-pink-500", "bg-rose-500", "bg-orange-500", "bg-amber-500",
    "bg-yellow-500", "bg-teal-500", "bg-cyan-500", "bg-violet-500",
    "bg-sky-500", "bg-lime-500"
  ];
  let sum = 0;
  const cleanRoll = String(roll || "").trim();
  for (let i = 0; i < cleanRoll.length; i++) {
    sum += cleanRoll.charCodeAt(i);
  }
  return colors[sum % colors.length];
};

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

  // Discord-like media control states
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [raisedHand, setRaisedHand] = useState(false);
  const [speakingPeerId, setSpeakingPeerId] = useState<string | null>(null);
  
  // Webcam/Audio media handles
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{[peerId: string]: MediaStream}>({});
  const peerConnectionsRef = useRef<{[peerId: string]: RTCPeerConnection}>({});

  // Dynamically calculate grid layout classes based on the number of participants
  const totalFeeds = 1 + participants.filter((p) => p.id !== myParticipantId).length;

  let gridLayoutClass = "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
  let cardHeightClass = "aspect-video";

  if (totalFeeds === 1) {
    gridLayoutClass = "grid-cols-1 max-w-[450px] mx-auto";
    cardHeightClass = "h-[320px] aspect-video";
  } else if (totalFeeds === 2) {
    gridLayoutClass = "grid-cols-1 md:grid-cols-2 max-w-[850px] mx-auto";
    cardHeightClass = "h-[300px] aspect-video";
  } else if (totalFeeds === 3) {
    gridLayoutClass = "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 max-w-[950px] mx-auto";
    cardHeightClass = "h-[250px] aspect-video";
  } else if (totalFeeds === 4) {
    gridLayoutClass = "grid-cols-2 max-w-[850px] mx-auto";
    cardHeightClass = "h-[220px] aspect-video";
  } else if (totalFeeds <= 6) {
    gridLayoutClass = "grid-cols-2 md:grid-cols-3 max-w-[1000px] mx-auto";
    cardHeightClass = "aspect-video";
  } else {
    gridLayoutClass = "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
    cardHeightClass = "aspect-video";
  }



  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // Load Proctor assigned tasks automatically
  useEffect(() => {
    if (studentProfile && studentProfile.studentId) {
      const roll = studentProfile.studentId;
      const storedGD = localStorage.getItem(`assignedGD_${roll}`);
      if (storedGD) {
        try {
          const parsed = JSON.parse(storedGD);
          setRoomCode(parsed.roomCode);
          setJoinedRoomCode(parsed.roomCode);
          setMode("join");
          setTopic(parsed.topic);
          setUseCustomTopic(false);
        } catch {}
      }
    }
  }, [studentProfile]);

  // Helper to create RTCPeerConnection for a peer
  const createPeerConnection = (peerId: string, stream: MediaStream) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ]
    });

    peerConnectionsRef.current[peerId] = pc;

    // Add local tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Send ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSocketMessage({
          type: "signal",
          targetId: peerId,
          signal: { candidate: event.candidate }
        });
      }
    };

    // When remote track arrives, save the stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({
        ...prev,
        [peerId]: remoteStream
      }));
    };

    return pc;
  };

  // Triggers peer connections to all existing participants
  const initializeWebRTC = (stream: MediaStream) => {
    if (!myParticipantId) return;
    participants.forEach(p => {
      if (p.id !== myParticipantId && !peerConnectionsRef.current[p.id]) {
        const pc = createPeerConnection(p.id, stream);
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .then(() => {
            sendSocketMessage({
              type: "signal",
              targetId: p.id,
              signal: { sdp: pc.localDescription }
            });
          })
          .catch(e => console.error("Error creating WebRTC offer:", e));
      }
    });
  };

  // Cleanup peer connections for participants who left
  useEffect(() => {
    const activeIds = new Set(participants.map(p => p.id));
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      if (!activeIds.has(peerId)) {
        peerConnectionsRef.current[peerId]?.close();
        delete peerConnectionsRef.current[peerId];
        setRemoteStreams(prev => {
          const updated = { ...prev };
          delete updated[peerId];
          return updated;
        });
      }
    });
  }, [participants]);

  // Request Webcam & Mic streams and initialize WebRTC
  useEffect(() => {
    if (step === "discussion") {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          setLocalStream(stream);
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          // Set initial track states
          stream.getAudioTracks().forEach(t => t.enabled = !micMuted);
          stream.getVideoTracks().forEach(t => t.enabled = cameraEnabled);

          // Connect WebRTC peers
          initializeWebRTC(stream);
        })
        .catch(err => {
          console.error("Camera/Mic acquisition failed:", err);
          setError("Failed to access camera/microphone. Please verify browser permissions.");
        });
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      Object.keys(peerConnectionsRef.current).forEach(peerId => peerConnectionsRef.current[peerId]?.close());
      peerConnectionsRef.current = {};
      setRemoteStreams({});
    }
  }, [step]);

  // Dynamically update audio track enablement based on micMuted state
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !micMuted;
      });
    }
  }, [micMuted, localStream]);

  // Dynamically update video track enablement based on cameraEnabled state
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = cameraEnabled;
      });
    }
  }, [cameraEnabled, localStream]);

  // Triggers WebRTC connections when participants list changes
  useEffect(() => {
    const stream = mediaStreamRef.current;
    if (stream && step === "discussion" && myParticipantId) {
      initializeWebRTC(stream);
    }
  }, [participants, myParticipantId, step]);

  // Active speaker detection: highlight the peer who submitted the last dialogue turn
  useEffect(() => {
    if (dialogue.length > 0) {
      const lastTurn = dialogue[dialogue.length - 1];
      setSpeakingPeerId(lastTurn.speakerId);
      const timer = setTimeout(() => {
        setSpeakingPeerId(null);
      }, 5000); // highlight for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [dialogue]);

  useEffect(() => {
    setupSpeechRecognition();
    return () => {
      cleanupAudioStreams();
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
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
        const res = await fetch(getApiUrl(`/api/gd-room/state?roomCode=${joinedRoomCode}&participantId=${myParticipantId}&t=${Date.now()}`));
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

  const submitSpeechTurn = async (text: string) => {
    if (!text.trim()) return;
    if (!roomStarted) return;

    if (isPollingMode) {
      try {
        await fetch(getApiUrl("/api/gd-room/submit-turn"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: joinedRoomCode,
            participantId: myParticipantId,
            text: text.trim()
          }),
        });
      } catch (err) {
        console.error("Auto-submit speech turn error:", err);
      }
    } else {
      sendSocketMessage({ type: "submit_turn", text: text.trim() });
    }
  };

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
        const socket = new WebSocket(getWsUrl("/ws/gd-room"));
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

            if (message.type === "signal") {
              const senderId = message.senderId;
              const signal = message.signal;

              if (senderId && signal) {
                const stream = mediaStreamRef.current;
                if (stream) {
                  let pc = peerConnectionsRef.current[senderId];
                  if (!pc) {
                    pc = createPeerConnection(senderId, stream);
                  }

                  if (signal.sdp) {
                    pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                      .then(() => {
                        if (signal.sdp.type === "offer") {
                          return pc.createAnswer()
                            .then(answer => pc.setLocalDescription(answer))
                            .then(() => {
                              sendSocketMessage({
                                type: "signal",
                                targetId: senderId,
                                signal: { sdp: pc.localDescription }
                              });
                            });
                        }
                      })
                      .catch(e => console.error("Error setting SDP:", e));
                  } else if (signal.candidate) {
                    pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
                      .catch(e => console.error("Error adding ICE candidate:", e));
                  }
                }
              }
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
        const res = await fetch(getApiUrl("/api/gd-room/join"), {
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
        const res = await fetch(getApiUrl("/api/gd-room/start"), {
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
        const res = await fetch(getApiUrl("/api/gd-room/submit-turn"), {
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
        const res = await fetch(getApiUrl("/api/gd-room/end"), {
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
        await fetch(getApiUrl("/api/gd-room/leave"), {
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

  const startVoiceCapture = () => {
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
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setInterimText("");
    setMicLevel(0);

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
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  // Automatically start/stop speech recognition based on mic muting and room start state
  useEffect(() => {
    if (step === "discussion" && roomStarted) {
      if (!micMuted) {
        startVoiceCapture();
      } else {
        stopVoiceCapture();
      }
    } else {
      stopVoiceCapture();
    }
  }, [micMuted, roomStarted, step]);

  // Start/Stop mic visualizer using the existing WebRTC localStream
  useEffect(() => {
    if (localStream && !micMuted && step === "discussion") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(localStream);
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
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      setMicLevel(0);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [localStream, micMuted, step]);

  // Auto-submit turn when user mutes their microphone (passing their turn)
  useEffect(() => {
    if (micMuted && currentText.trim() && step === "discussion" && roomStarted) {
      submitSpeechTurn(currentText);
      setCurrentText("");
    }
  }, [micMuted, roomStarted, step]);

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-slate-200 rounded-3xl overflow-hidden min-h-[700px] shadow-lg relative text-left text-slate-700">
          
          {/* 1. DISCORD LEFT SIDEBAR */}
          <div className="lg:col-span-3 bg-slate-50 border-r border-slate-200 flex flex-col justify-between text-slate-750 select-none">
            <div className="p-4 space-y-6">
              {/* Sidebar Header */}
              <div className="bg-white border border-slate-200 p-3.5 rounded-2xl space-y-2.5 shadow-xs">
                <span className="text-[9px] font-mono uppercase tracking-[2px] text-brand-primary block font-bold">Group Discussion Room</span>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-brand-primary flex items-center gap-2 font-mono">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {joinedRoomCode || roomCode || "—"}
                  </h3>
                  <button
                    onClick={() => {
                      const code = joinedRoomCode || roomCode;
                      if (code) {
                        navigator.clipboard.writeText(code);
                        alert("Room Code copied to clipboard: " + code);
                      }
                    }}
                    className="text-[10px] font-sans font-semibold text-slate-600 hover:text-brand-primary bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition cursor-pointer border border-slate-200"
                  >
                    Copy Code
                  </button>
                </div>
              </div>

              {/* Voice Channels List */}
              <div className="space-y-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block px-2">Voice Channels</span>
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-xs font-bold cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔊</span>
                      <span>GD Room call</span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-brand-primary/20 rounded text-[9px] font-mono">
                      {participants.length} member{participants.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supervised Banner */}
              <div className="p-3 bg-brand-accent/5 border border-brand-accent/20 rounded-xl space-y-1.5">
                <span className="text-[9px] font-bold text-brand-accent uppercase tracking-wider font-mono block">Proctor Assigned Topic</span>
                <p className="text-xs text-slate-700 leading-relaxed font-sans font-semibold">{topicToUse}</p>
              </div>
            </div>

            {/* Sidebar footer showing logged-in proctor profile / student info */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-350 font-mono font-bold text-xs text-brand-primary">
                  {participantRoll.substring(0, 2)}
                </div>
                <div className="truncate">
                  <span className="text-xs font-bold text-slate-800 block truncate leading-none mb-1">{participantName}</span>
                  <span className="text-[9px] font-mono text-slate-500 leading-none">{participantRoll}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setMicMuted(prev => !prev)}
                  className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-250 cursor-pointer ${micMuted ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : ""}`}
                  title={micMuted ? "Unmute Mic" : "Mute Mic"}
                >
                  {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={() => setCameraEnabled(prev => !prev)}
                  className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-250 cursor-pointer ${!cameraEnabled ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : ""}`}
                  title={cameraEnabled ? "Turn off camera" : "Turn on camera"}
                >
                  {!cameraEnabled ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 2. DISCORD CENTER STAGE (AUDIO/VIDEO CALL GRID) */}
          <div className="lg:col-span-6 bg-white flex flex-col p-4 justify-between min-h-[580px]">
            {/* Live Audio/Video Grid */}
            <div className={`grid gap-4 flex-1 items-center justify-center py-2 w-full ${gridLayoutClass}`}>
              {/* Local User Card (Slot 1) */}
              <div 
                className={`relative bg-slate-900 rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center shadow-lg w-full ${cardHeightClass} ${
                  !micMuted && micLevel > 5
                    ? "border-emerald-500 ring-4 ring-emerald-500/20 scale-[1.02]" 
                    : "border-slate-800"
                }`}
              >
                {/* Local Webcam stream */}
                {cameraEnabled && step === "discussion" ? (
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                ) : (
                  /* Avatar fallback if camera disabled */
                  <div className="relative flex flex-col items-center justify-center">
                    {!micMuted && micLevel > 5 && (
                      <>
                        <div className="absolute w-20 h-20 bg-emerald-500/20 rounded-full animate-ping" />
                        <div className="absolute w-24 h-24 bg-emerald-500/10 rounded-full animate-pulse" />
                      </>
                    )}
                    <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center border-2 border-white shadow-md font-mono text-white font-bold text-xl relative z-10">
                      {participantRoll.slice(-2) || "??"}
                    </div>
                  </div>
                )}

                {/* Name & Roll label overlay */}
                <div className="absolute bottom-3 left-3 z-20 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-white border border-white/10 max-w-[80%]">
                  <span className="font-bold truncate block">{participantName} (You)</span>
                </div>

                {/* Turn Speaking indicator overlay */}
                {!micMuted && (
                  <div className="absolute top-3 left-3 z-20 bg-emerald-500/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>Speaking Turn</span>
                  </div>
                )}

                {/* Muted/Unmuted Indicator Badges */}
                <div className="absolute top-3 right-3 z-20">
                  {micMuted ? (
                    <span className="bg-red-500 text-white p-1.5 rounded-full inline-block border border-white/15 shadow-sm">
                      <MicOff className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="bg-emerald-500 text-white p-1.5 rounded-full inline-block border border-white/15 shadow-sm">
                      <Mic className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Real Participants Cards */}
              {participants
                .filter((p) => p.id !== myParticipantId)
                .map((peer) => {
                  const isSpeaking = speakingPeerId === peer.id;
                  const avatarColor = getAvatarColor(peer.roll);
                  return (
                    <div 
                      key={peer.id}
                      className={`relative bg-slate-900 rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col items-center justify-center shadow-lg w-full ${cardHeightClass} ${
                        isSpeaking 
                          ? "border-emerald-500 ring-4 ring-emerald-500/20 scale-[1.02]" 
                          : "border-slate-800"
                      }`}
                    >
                      {/* Hidden Audio element to play remote streams */}
                      {remoteStreams[peer.id] && (
                        <audio
                          ref={el => {
                            if (el && el.srcObject !== remoteStreams[peer.id]) {
                              el.srcObject = remoteStreams[peer.id];
                            }
                          }}
                          autoPlay
                          playsInline
                        />
                      )}

                      {/* Remote Peer Video or Avatar */}
                      {remoteStreams[peer.id] ? (
                        <video
                          ref={el => {
                            if (el && el.srcObject !== remoteStreams[peer.id]) {
                              el.srcObject = remoteStreams[peer.id];
                            }
                          }}
                          autoPlay
                          playsInline
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        /* Avatar fallback if no remote video stream */
                        <div className="relative flex flex-col items-center justify-center">
                          {isSpeaking && (
                            <>
                              <div className="absolute w-20 h-20 bg-emerald-500/20 rounded-full animate-ping" />
                              <div className="absolute w-24 h-24 bg-emerald-500/10 rounded-full animate-pulse" />
                            </>
                          )}
                          <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center border-2 border-white shadow-md font-mono text-white font-bold text-xl relative z-10`}>
                            {peer.roll.slice(-2) || "??"}
                          </div>
                        </div>
                      )}

                      {/* Name & Roll label overlay */}
                      <div className="absolute bottom-3 left-3 z-20 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-white border border-white/10 flex items-center gap-1.5 max-w-[80%]">
                        <span className="font-bold truncate">{peer.name}</span>
                        {peer.isHost && (
                          <span className="text-[8px] bg-brand-primary text-white px-1.5 py-0.5 rounded font-sans uppercase font-bold">
                            Host
                          </span>
                        )}
                      </div>

                      {/* Active speaking turn badge */}
                      {isSpeaking && (
                        <div className="absolute top-3 left-3 z-20 bg-emerald-500/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          <span>Speaking Turn</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Bottom Actions toolbar */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 mt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMicMuted(prev => !prev)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                    micMuted
                      ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                      : "bg-slate-105 border-slate-200 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{micMuted ? "Unmute" : "Mute"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCameraEnabled(prev => !prev)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                    !cameraEnabled
                      ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                      : "bg-slate-105 border-slate-200 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {!cameraEnabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  <span>Camera</span>
                </button>
              </div>

              {/* Host specific controllers to start/end discussion */}
              <div className="flex gap-2">
                {!roomStarted && isHost && (
                  <button
                    onClick={startDiscussionRoom}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md cursor-pointer animate-pulse"
                  >
                    <Play className="w-3.5 h-3.5 fill-white text-white" />
                    <span>Start Discussion</span>
                  </button>
                )}
                {roomStarted && isHost && (
                  <button
                    onClick={endRoomDiscussion}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-brand-accent hover:bg-orange-600 text-white shadow-md cursor-pointer badge-white-text"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>End & Evaluate</span>
                  </button>
                )}
                {!roomStarted && !isHost && (
                  <span className="text-[10px] uppercase font-mono text-slate-500 self-center tracking-wider bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    Waiting for Host...
                  </span>
                )}
              </div>

              {/* Exit Room button */}
              <button
                onClick={resetGD}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md cursor-pointer badge-white-text"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>

          {/* 3. DISCORD RIGHT TRANSCRIPT & LIVE SUBMISSION SIDEBAR */}
          <div className="lg:col-span-3 bg-slate-50 border-l border-slate-200 flex flex-col justify-between">
            {/* Scrollable Dialogue transcripts */}
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block border-b border-slate-200 pb-2">Live Transcript Feed</span>
              
              <div className="flex-1 overflow-y-auto mt-3 space-y-3.5 pr-1 max-h-[350px]">
                {dialogue.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 font-mono text-[10px] border border-dashed border-slate-200 rounded-xl p-4 bg-white">
                    <MessageSquare className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    Discussion transcript is empty. Simulating active speakers.
                  </div>
                ) : (
                  dialogue.map((turn) => {
                    const isMe = turn.speakerRoll === participantRoll;
                    return (
                      <div key={turn.id} className="text-xs space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.5px]">
                          <span className={isMe ? "text-brand-accent font-bold" : "text-slate-500"}>
                            {turn.speakerName.split(" ")[0]}
                          </span>
                          <span className="text-slate-400">
                            {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className={`p-2.5 rounded-xl leading-relaxed ${isMe ? "bg-white text-slate-800 border border-slate-205 shadow-xs" : "bg-slate-100 text-slate-700"}`}>
                          {turn.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Live turn submission form */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-mono text-slate-400">
                <span>Submit Your Point</span>
                <span>{socketConnected ? "socket active" : "local practice"}</span>
              </div>
              
              <textarea
                rows={3}
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                placeholder={roomStarted ? "Speak or type your argument turn..." : "Lock in topic to enable turn entries..."}
                disabled={!roomStarted}
                className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />

              <div className="w-full">
                <button
                  onClick={submitRoomTurn}
                  disabled={!roomStarted || !currentText.trim()}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold bg-brand-primary hover:bg-blue-600 text-white cursor-pointer badge-white-text disabled:opacity-50 disabled:hover:bg-brand-primary transition"
                >
                  <Check className="w-4 h-4" />
                  <span>Send Text Argument</span>
                </button>
              </div>

              {isRecording && (
                <div className="rounded-xl bg-white border border-slate-200 p-2 text-slate-650 text-[10px] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-600">Capturing audio...</span>
                    <span>{micLevel}%</span>
                  </div>
                  {interimText && <p className="italic text-[9px] text-slate-400">"{interimText}"</p>}
                </div>
              )}
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
