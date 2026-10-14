import React, { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import { Check, Copy, Hand, Loader2, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Settings2, ShieldCheck, Users, Video, VideoOff, X } from "lucide-react";
import { formatMeetingId, meetingInvitation, meetingRequest, postMeeting, type MeetingReport, type MeetingSnapshot } from "../lib/meetingApi";
import { observeLocalMicrophone, type MicrophoneObserverStop } from "../lib/meetingRecorder";

interface LiveMeetingProps { initialSnapshot: MeetingSnapshot; onLeave: () => void }
type Panel = "PARTICIPANTS" | "TOPIC" | "TRANSCRIPT" | "CHAT" | "REPORTS";
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";

function VideoTrack({ track, label, screen = false }: { track?: Track; label: string; screen?: boolean }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!track || !element.current) return;
    const video = element.current;
    track.attach(video);
    video.muted = true;
    return () => { track.detach(video); };
  }, [track]);
  return <video ref={element} autoPlay playsInline muted aria-label={label} data-track-source={screen ? "screen_share" : "camera"} className={`h-full w-full ${screen ? "object-contain" : "object-cover"}`} />;
}
function AudioTrack({ track, identity }: { track: Track; identity: string }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const audio = element.current;
    track.attach(audio);
    return () => { track.detach(audio); };
  }, [track]);
  return <audio ref={element} autoPlay data-participant-identity={identity} className="hidden" />;
}
function ParticipantTile({ participant }: { participant: Participant }) {
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const name = participant.name || "Participant";
  return <div data-participant-identity={participant.identity} data-speaking={participant.isSpeaking} className={`relative min-h-44 overflow-hidden rounded-xl border-2 bg-slate-800 sm:aspect-video ${participant.isSpeaking ? "border-blue-400 ring-2 ring-blue-400/25" : "border-slate-700"}`}>
    {camera?.track && !camera.isMuted ? <VideoTrack track={camera.track} label={`${name} camera`} /> : <div className="flex h-full min-h-44 items-center justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-600 text-xl font-semibold text-white">{name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</div></div>}
    <div className="absolute bottom-3 left-3 flex max-w-[85%] items-center gap-2 rounded-md bg-slate-950/80 px-2.5 py-1.5 text-xs text-white">{participant.isMicrophoneEnabled ? <Mic size={13} /> : <MicOff size={13} />}<span className="truncate">{name}{participant.isLocal ? " (you)" : ""}</span>{participant.isSpeaking && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" aria-label="Speaking" />}</div>
  </div>;
}
function ReportView({ report, name }: { report: MeetingReport; name: string }) {
  return <div className="space-y-5 text-sm leading-6">
    <div><h3 className="text-lg font-semibold text-slate-900">{name}</h3><p className="mt-2 text-slate-600">{report.summary}</p></div>
    <div className="flex flex-wrap gap-3"><span className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-800">{report.overallScore === null ? "Insufficient evidence to score" : `${report.overallScore}/100`}</span><span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">{report.turnCount} speech segments · ~{report.speakingSeconds}s voice activity</span></div>
    {report.strongestArguments.length > 0 && <div><h4 className="font-semibold text-slate-900">Strongest arguments</h4>{report.strongestArguments.map((item, index) => <blockquote key={`${item.segmentId}-${index}`} className="mt-2 border-l-2 border-blue-400 pl-3 text-slate-600">“{item.quote}”<span className="mt-1 block font-mono text-[10px] text-slate-400">Evidence {item.segmentId.slice(0, 8)}</span></blockquote>)}</div>}
    {report.criteria.map((criterion) => <div key={criterion.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><h4 className="font-semibold text-slate-900">{criterion.label}</h4><span className="shrink-0 text-xs text-slate-500">{criterion.score === null ? "Unscored" : `${criterion.score}/5`} · {criterion.weight}%</span></div><p className="mt-2 text-xs text-slate-600">{criterion.explanation}</p>{criterion.evidence.map((item, index) => <blockquote key={`${item.segmentId}-${index}`} className="mt-2 border-l-2 border-slate-300 pl-2 text-xs text-slate-600">“{item.quote}”</blockquote>)}</div>)}
    {[{ title: "Areas to practice", items: report.improvements }, { title: "Practice exercises", items: report.exercises }, { title: "Evidence limitations", items: report.uncertainties }].filter((group) => group.items.length).map((group) => <div key={group.title}><h4 className="font-semibold text-slate-900">{group.title}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{group.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}
    <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">{report.attribution} {report.durationSource} {report.model ? `Analysis: ${report.model}.` : "No AI assessment was generated without transcript evidence."}</p>
  </div>;
}

export default function LiveMeeting({ initialSnapshot, onLeave }: LiveMeetingProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [rtc, setRtc] = useState<Room | null>(null);
  const rtcRef = useRef<Room | null>(null);
  const snapshotRef = useRef(initialSnapshot);
  const [connection, setConnection] = useState("disconnected");
  const [version, setVersion] = useState(0);
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [panel, setPanel] = useState<Panel>(initialSnapshot.room.status === "ENDED" ? "REPORTS" : "PARTICIPANTS");
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(Date.now());
  const [chat, setChat] = useState("");
  const [transcriptionStatus, setTranscriptionStatus] = useState("Transcription paused");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicePanel, setDevicePanel] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [reportIdentity, setReportIdentity] = useState(initialSnapshot.me.identity);
  const [editSegment, setEditSegment] = useState("");
  const [editedText, setEditedText] = useState("");
  const [deleteAction, setDeleteAction] = useState<"SELF" | "ALL" | "ROOM" | null>(null);
  const observerStop = useRef<MicrophoneObserverStop | undefined>(undefined);
  const leaving = useRef(false);
  const roomCode = snapshot.room.code;
  const isHost = snapshot.me.role === "HOST";
  const ended = snapshot.room.status === "ENDED";
  const waiting = snapshot.me.status === "WAITING";
  const mediaReady = connection === "connected";
  snapshotRef.current = snapshot;

  const refreshSnapshot = useCallback(async () => {
    const updated = await meetingRequest<MeetingSnapshot>(`/${roomCode}`);
    setSnapshot(updated);
    return updated;
  }, [roomCode]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let next: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const updated = await meetingRequest<MeetingSnapshot>(`/${roomCode}`, { signal: controller.signal });
        if (!active) return;
        setSnapshot(updated);
        if (updated.room.status === "ENDED") { observerStop.current?.(); observerStop.current = undefined; void rtcRef.current?.disconnect(); }
      } catch (failure: any) {
        if (active && failure.name !== "AbortError") {
          setError(failure.message);
          if (["ROOM_ACCESS_DENIED", "ROOM_NOT_FOUND", "AUTH_REQUIRED"].includes(failure.code)) { observerStop.current?.(); void rtcRef.current?.disconnect(); }
        }
      } finally { if (active) next = setTimeout(poll, 2000); }
    };
    next = setTimeout(poll, 1000);
    return () => { active = false; clearTimeout(next); controller.abort(); };
  }, [roomCode]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (snapshot.me.status !== "ADMITTED" || snapshot.room.status !== "OPEN") return;
    let disposed = false;
    const controller = new AbortController();
    const room = new Room({ adaptiveStream: true, dynacast: true });
    rtcRef.current = room;
    setRtc(room);
    const refresh = () => { if (!disposed) { setVersion((prior) => prior + 1); setConnection(room.state); } };
    const failMedia = (failure: Error) => { if (!disposed) setError(failure?.name === "NotAllowedError" ? "Camera or microphone access was denied. Update this site’s browser permissions, then try again." : "A media device is unavailable. Check your selected microphone or camera."); };
    const playback = () => { if (!disposed) setAudioBlocked(!room.canPlaybackAudio); };
    const disconnected = () => { refresh(); if (!disposed && snapshotRef.current.room.status === "OPEN" && !leaving.current) setNotice("The media connection closed. You can rejoin while the discussion remains open."); };
    [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ConnectionStateChanged, RoomEvent.Reconnecting, RoomEvent.Reconnected].forEach((event) => room.on(event, refresh));
    room.on(RoomEvent.Disconnected, disconnected);
    room.on(RoomEvent.MediaDevicesError, failMedia);
    room.on(RoomEvent.AudioPlaybackStatusChanged, playback);
    setConnection("connecting"); setNotice("");
    void (async () => {
      try {
        const credentials = await postMeeting<{ token: string; serverUrl: string }>(`/${roomCode}/token`, {}, controller.signal);
        if (disposed) return;
        await room.connect(credentials.serverUrl, credentials.token);
        if (disposed) { await room.disconnect(); return; }
        await room.startAudio();
        refresh(); playback();
      } catch (failure: any) {
        if (!disposed && failure.name !== "AbortError") { setError(failure.message || "Unable to connect to the discussion. Please retry."); setConnection("disconnected"); }
      }
    })();
    return () => { disposed = true; controller.abort(); observerStop.current?.(); observerStop.current = undefined; room.removeAllListeners(); void room.disconnect(); if (rtcRef.current === room) rtcRef.current = null; };
  }, [roomCode, snapshot.me.status, snapshot.room.status, joinAttempt]);

  const micPublication = rtc?.localParticipant.getTrackPublication(Track.Source.Microphone);
  const microphoneTrack = micPublication?.track;
  const micEnabled = !!rtc?.localParticipant.isMicrophoneEnabled;
  const cameraEnabled = !!rtc?.localParticipant.isCameraEnabled;
  const sharing = !!rtc?.localParticipant.isScreenShareEnabled;
  useEffect(() => {
    let canceled = false;
    let stop: MicrophoneObserverStop | undefined;
    if (!mediaReady || ended || !snapshot.me.transcriptConsent || snapshot.room.observerMode === "OFF" || !micEnabled || !microphoneTrack || !micPublication?.trackSid) {
      setTranscriptionStatus(snapshot.me.transcriptConsent ? "Transcription paused while your microphone is off" : "Your speech is excluded from AI analysis");
      return;
    }
    void observeLocalMicrophone({ roomCode, trackSid: micPublication.trackSid, microphone: microphoneTrack.mediaStreamTrack,
      onStatus: (message) => { if (!canceled) setTranscriptionStatus(message); }, onError: (message) => { if (!canceled) setError(message); } })
      .then((cleanup) => { if (canceled) cleanup(); else { stop = cleanup; observerStop.current = cleanup; } })
      .catch((failure) => { if (!canceled) setError(failure.message); });
    return () => { canceled = true; stop?.(); if (observerStop.current === stop) observerStop.current = undefined; };
  }, [roomCode, mediaReady, ended, snapshot.me.transcriptConsent, snapshot.room.observerMode, micEnabled, microphoneTrack, micPublication?.trackSid]);

  const perform = async (name: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(name); setError("");
    try { await action(); }
    catch (failure: any) { setError(failure.message || "This action could not be completed. Please retry."); }
    finally { setBusy(""); }
  };
  const toggleMedia = (kind: "microphone" | "camera" | "screen") => void perform(kind, async () => {
    if (!rtcRef.current || !mediaReady) throw new Error("Connect to the media room before enabling your devices.");
    if (!navigator.mediaDevices) throw new Error("Microphone and camera access requires a secure browser connection.");
    try {
      const local = rtcRef.current.localParticipant;
      if (kind === "microphone") await local.setMicrophoneEnabled(!local.isMicrophoneEnabled, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (kind === "camera") await local.setCameraEnabled(!local.isCameraEnabled);
      if (kind === "screen") await local.setScreenShareEnabled(!local.isScreenShareEnabled, { audio: true });
      setVersion((prior) => prior + 1);
    } catch (failure: any) {
      if (failure.name === "NotAllowedError") throw new Error(kind === "screen" ? "Screen sharing was canceled or denied. Choose a screen or window to retry." : "Camera or microphone permission was denied. Allow this site in your browser settings, then retry.");
      throw failure;
    }
  });
  const changeConsent = (granted: boolean) => {
    if (granted) { void perform("consent", async () => { await postMeeting(`/${roomCode}/consent`, { granted: true }); await refreshSnapshot(); }); return; }
    // Withdrawal stops browser capture immediately, including during another pending action.
    void observerStop.current?.(); observerStop.current = undefined;
    setSnapshot((prior) => ({ ...prior, me: { ...prior.me, transcriptConsent: false } }));
    void postMeeting(`/${roomCode}/consent`, { granted: false }).then(() => refreshSnapshot()).catch((failure) => setError(`Your local transcription is stopped. Consent could not be saved: ${failure.message}`));
  };
  const leave = () => void perform("leave", async () => {
    leaving.current = true; observerStop.current?.(); observerStop.current = undefined;
    await rtcRef.current?.disconnect();
    try { await postMeeting(`/${roomCode}/leave`); } finally { onLeave(); }
  });
  const end = () => void perform("end", async () => {
    await observerStop.current?.(true); observerStop.current = undefined;
    await postMeeting(`/${roomCode}/end`);
    await refreshSnapshot(); setPanel("REPORTS"); setPanelOpen(true);
  });
  const copyInvite = () => void perform("copy", async () => {
    await navigator.clipboard.writeText(meetingInvitation(roomCode)); setNotice("Invitation link copied. Share the passcode separately if this room has one.");
  });
  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chat.trim()) return;
    void perform("chat", async () => { await postMeeting(`/${roomCode}/chat`, { text: chat }); setChat(""); await refreshSnapshot(); });
  };
  const chooseDevices = () => void perform("devices", async () => {
    if (!navigator.mediaDevices) throw new Error("Device selection requires a secure browser connection.");
    const available = await Room.getLocalDevices(undefined, true); setDevices(available); setDevicePanel(true);
  });
  const deleteData = () => void perform("delete", async () => {
    observerStop.current?.(); observerStop.current = undefined;
    await meetingRequest(`/${roomCode}${deleteAction === "ROOM" ? "" : `/data${deleteAction === "ALL" ? "?scope=all" : ""}`}`, { method: "DELETE" });
    setDeleteAction(null);
    if (deleteAction === "ROOM") { await rtcRef.current?.disconnect(); onLeave(); }
    else { await refreshSnapshot(); setNotice("The selected discussion data has been deleted. New transcription requires consent again."); }
  });

  const participants = rtc && (mediaReady || connection === "reconnecting") ? [rtc.localParticipant, ...rtc.remoteParticipants.values()] : [];
  const screens = participants.map((participant) => ({ participant, publication: participant.getTrackPublication(Track.Source.ScreenShare) })).filter((item) => item.publication?.track && !item.publication.isMuted);
  const remoteAudio = participants.filter((participant) => !participant.isLocal).flatMap((participant) => participant.getTrackPublications().filter((publication) => publication.kind === Track.Kind.Audio && publication.track).map((publication) => ({ identity: participant.identity, track: publication.track! })));
  const elapsedSeconds = Math.max(0, Math.floor(((snapshot.room.endedAt ? new Date(snapshot.room.endedAt).getTime() : now) - new Date(snapshot.room.startedAt).getTime()) / 1000));
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const availableReports = isHost ? snapshot.reports || [] : snapshot.me.report ? [{ identity: snapshot.me.identity, displayName: snapshot.me.displayName, report: snapshot.me.report }] : [];
  const selectedReport = availableReports.find((item) => item.identity === reportIdentity) || availableReports[0];
  void version; // SDK events refresh mutable participant/track state through this render counter.

  if (waiting) return <div className="mx-auto max-w-xl px-5 py-16 text-center text-slate-900"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Users size={28} /></div><h1 className="text-2xl font-semibold">You’re in the waiting room</h1><p className="mt-3 text-sm leading-6 text-slate-600">The host will admit you to <strong>{snapshot.room.title}</strong>. Your microphone and camera remain off while you wait.</p><p className="mt-3 font-mono text-sm text-slate-500">{formatMeetingId(roomCode)}</p>{error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}<p className="mt-6 inline-flex items-center gap-2 text-xs text-slate-500"><Loader2 size={15} className="animate-spin" /> Checking your admission status</p><div className="mt-6"><button onClick={leave} disabled={!!busy} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium">Leave waiting room</button></div></div>;

  return <div className="meeting-room flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-white sm:m-4">
    {remoteAudio.map((item) => <React.Fragment key={item.track.sid || item.identity}><AudioTrack track={item.track} identity={item.identity} /></React.Fragment>)}
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-6"><div className="min-w-0"><h1 className="truncate text-base font-semibold">{snapshot.room.title}</h1><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span className="font-mono">{formatMeetingId(roomCode)}</span><span>{elapsed}</span><span role="status" className={`inline-flex items-center gap-1.5 ${mediaReady ? "text-emerald-300" : "text-amber-200"}`}><span className={`h-1.5 w-1.5 rounded-full ${mediaReady ? "bg-emerald-400" : "bg-amber-300"}`} />{ended ? "Discussion ended" : connection === "reconnecting" ? "Reconnecting…" : connection === "connecting" ? "Connecting…" : mediaReady ? "Connected" : "Disconnected"}</span></div></div><div className="flex gap-2"><button onClick={copyInvite} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800"><Copy size={14} /> Invite</button><button aria-label="Toggle discussion sidebar" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)} className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800"><Users size={17} /></button></div></header>
    {error && <div role="alert" className="flex items-start justify-between gap-3 border-b border-red-900/50 bg-red-950 px-4 py-3 text-sm text-red-100"><p>{error}</p><button aria-label="Dismiss error" onClick={() => setError("")} className="shrink-0 rounded p-1"><X size={15} /></button></div>}
    {notice && <div role="status" className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-300">{notice}</div>}
    {snapshot.room.observerMode !== "OFF" && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-blue-950/30 px-4 py-2 text-xs text-blue-100"><span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> AI transcription and analysis enabled · {transcriptionStatus}</span><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={snapshot.me.transcriptConsent} onChange={(event) => changeConsent(event.target.checked)} disabled={busy === "consent"} className="accent-blue-400" /> Consent to my speech analysis</label></div>}
    <div className="flex flex-1 flex-col lg:flex-row">
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        {ended ? <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-xl font-semibold">Discussion complete</h2><p className="text-sm leading-6 text-slate-300">Your room has ended. Review the retained transcript and evidence-based feedback in the sidebar.</p>{isHost && <button disabled={!!busy} onClick={() => void perform("reports", async () => { setSnapshot(await postMeeting<MeetingSnapshot>(`/${roomCode}/reports`)); setPanel("REPORTS"); setPanelOpen(true); })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">{busy === "reports" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Generate participant reports</button>}<p className="text-xs leading-5 text-slate-400">Only captured, consented speech can support a report. Missing evidence remains unscored. Data is retained until {new Date(snapshot.room.expiresAt).toLocaleString()}.</p></div> : !participants.length ? <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center"><Video size={38} className="text-slate-600" /><h2 className="text-xl font-medium">{connection === "connecting" ? "Connecting to your meeting" : "Ready to rejoin?"}</h2><p className="max-w-sm text-sm leading-6 text-slate-400">Your camera and microphone start off. Enable them once your connection is ready.</p>{connection !== "connecting" && <button onClick={() => { setError(""); setJoinAttempt((prior) => prior + 1); }} disabled={!!busy} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium">Rejoin media room</button>}</div> : <>
          {screens.map((item) => <div key={`screen-${item.participant.identity}`} className="mb-5 overflow-hidden rounded-xl border border-slate-700 bg-black"><div className="border-b border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">{item.participant.name || "Participant"} is sharing a screen</div><div className="aspect-video"><VideoTrack track={item.publication!.track} label={`${item.participant.name} screen share`} screen /></div></div>)}
          <div className={`grid gap-3 ${participants.length === 1 ? "mx-auto max-w-2xl grid-cols-1" : participants.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>{participants.map((participant) => <React.Fragment key={participant.identity}><ParticipantTile participant={participant} /></React.Fragment>)}</div>
          {audioBlocked && <button onClick={() => void perform("audio", async () => { await rtc?.startAudio(); setAudioBlocked(!rtc?.canPlaybackAudio); })} className="mt-4 rounded-lg bg-amber-200 px-4 py-2 text-sm font-medium text-slate-900">Enable meeting audio</button>}
        </>}
      </main>
      {panelOpen && <aside className="flex w-full flex-col border-t border-slate-200 bg-slate-50 text-slate-900 lg:w-96 lg:shrink-0 lg:border-l lg:border-t-0">
        <nav className="flex overflow-x-auto border-b border-slate-200 bg-white px-2" aria-label="Discussion panels">{(["PARTICIPANTS", "TOPIC", "TRANSCRIPT", "CHAT", "REPORTS"] as Panel[]).map((item) => <button key={item} onClick={() => setPanel(item)} aria-current={panel === item ? "page" : undefined} className={`shrink-0 border-b-2 px-2.5 py-3 text-xs font-medium ${panel === item ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{item.charAt(0) + item.slice(1).toLowerCase()}</button>)}</nav>
        <div className="max-h-[65dvh] flex-1 overflow-y-auto p-4 lg:max-h-[calc(100dvh-22rem)]">
          {panel === "PARTICIPANTS" && <div className="space-y-4"><h2 className="text-sm font-semibold">Participants</h2><p className="text-xs leading-5 text-slate-500">{participants.length} connected to media. Activity below reflects consented, captured speech only.</p>{snapshot.participants.map((member) => <div key={member.identity} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{member.displayName}{member.identity === snapshot.me.identity ? " (you)" : ""}</p><p className="mt-1 text-xs text-slate-500">{member.role === "HOST" ? "Host" : "Participant"} · {member.status === "WAITING" ? "Waiting for admission" : participants.some((participant) => participant.identity === member.identity) ? "Connected" : member.status.toLowerCase()}</p>{member.activity && <p className="mt-1 text-[10px] text-slate-500">{member.activity.turnCount} segments · ~{member.activity.speakingSeconds}s · {member.activity.participationShare === null ? "No speech captured" : `${member.activity.participationShare}% of captured voice activity`}</p>}</div>{member.handRaised && <Hand size={17} className="shrink-0 text-amber-600" aria-label="Hand raised" />}</div>{isHost && member.status === "WAITING" && <div className="mt-3 flex gap-2"><button disabled={!!busy} aria-label={`Admit ${member.displayName}`} onClick={() => void perform("admit", async () => { await postMeeting(`/${roomCode}/admission`, { identity: member.identity, admit: true }); await refreshSnapshot(); })} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white">Admit</button><button disabled={!!busy} aria-label={`Decline ${member.displayName}`} onClick={() => void perform("decline", async () => { await postMeeting(`/${roomCode}/admission`, { identity: member.identity, admit: false }); await refreshSnapshot(); })} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">Decline</button></div>}{isHost && member.role !== "HOST" && member.status === "ADMITTED" && !ended && <button disabled={!!busy} aria-label={`Remove ${member.displayName}`} onClick={() => void perform("remove", async () => { await postMeeting(`/${roomCode}/admission`, { identity: member.identity, admit: false }); await refreshSnapshot(); })} className="mt-2 text-xs text-red-700 hover:underline">Remove from room</button>}</div>)}</div>}
          {panel === "TOPIC" && <div className="space-y-5"><div><h2 className="text-sm font-semibold">Discussion topic</h2><p className="mt-3 text-sm leading-6 text-slate-600">{snapshot.room.topic}</p></div><div><h3 className="text-sm font-semibold">Scoring criteria</h3><div className="mt-3 space-y-3">{snapshot.room.rubric.map((criterion) => <div key={criterion.id}><p className="text-xs font-semibold">{criterion.label} · {criterion.weight}%</p><p className="mt-1 text-xs leading-5 text-slate-500">{criterion.description}</p></div>)}</div></div>{isHost && snapshot.room.observerMode === "ACTIVE" && !ended && <div className="space-y-2 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Host-led AI moderation</h3><p className="text-xs leading-5 text-slate-500">The AI posts one text intervention only when you request it.</p>{[{ action: "INTRODUCE", label: "Introduce the topic" }, { action: "TIME_REMINDER", label: "Post a time reminder" }, { action: "BALANCE", label: "Invite more perspectives" }].map((item) => <button key={item.action} disabled={!!busy} onClick={() => void perform("moderate", async () => { await postMeeting(`/${roomCode}/moderation`, { action: item.action }); await refreshSnapshot(); setPanel("CHAT"); })} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs hover:border-blue-400">{item.label}</button>)}</div>}<div className="border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Privacy and retention</h3><p className="mt-2 text-xs leading-5 text-slate-500">AI analysis uses only consented microphone speech. Audio is processed without saving recordings. Transcripts and reports expire {new Date(snapshot.room.expiresAt).toLocaleString()}. Participant speech and topic text are treated as content, not AI instructions.</p><button onClick={() => setDeleteAction("SELF")} className="mt-3 text-xs text-red-700 hover:underline">Delete my discussion data</button>{isHost && <div className="mt-3 flex flex-col items-start gap-3"><button onClick={() => setDeleteAction("ALL")} className="text-xs text-red-700 hover:underline">Delete everyone’s discussion data</button><button onClick={() => setDeleteAction("ROOM")} className="text-xs text-red-700 hover:underline">Delete this room</button></div>}</div></div>}
          {panel === "TRANSCRIPT" && <div className="space-y-4"><h2 className="text-sm font-semibold">Live transcript</h2><p className="text-xs leading-5 text-slate-500">Speaker labels come from authenticated microphone track ownership. Each browser sends its own audio. Transcription may miss words or overlap; you can correct your segments.</p>{snapshot.transcript.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm leading-6 text-slate-500">No speech has been transcribed yet. Enable your microphone and consent to analysis when the observer is active.</p> : snapshot.transcript.map((segment) => <article key={segment.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold">{segment.speakerName}</h3><time className="shrink-0 text-[10px] text-slate-500">{new Date(segment.startedAt).toLocaleTimeString()}</time></div>{editSegment === segment.id ? <form onSubmit={(event) => { event.preventDefault(); void perform("correct", async () => { await meetingRequest(`/${roomCode}/transcripts/${segment.id}`, { method: "PATCH", body: JSON.stringify({ text: editedText }) }); setEditSegment(""); await refreshSnapshot(); }); }} className="mt-2"><textarea aria-label="Correct your transcript" required maxLength={6000} value={editedText} onChange={(event) => setEditedText(event.target.value)} rows={3} className={inputClass} /><div className="mt-2 flex gap-2"><button disabled={!!busy} className="rounded bg-blue-700 px-3 py-1 text-xs text-white">Save correction</button><button type="button" onClick={() => setEditSegment("")} className="px-2 py-1 text-xs text-slate-600">Cancel</button></div></form> : <><p className="mt-2 text-sm leading-6 text-slate-700">{segment.status === "TRANSCRIBING" ? "Transcribing…" : segment.status === "FAILED" ? "Transcription failed for this segment. No words were added." : segment.text || "No speech recognized."}</p><div className="mt-2 flex items-center justify-between text-[10px] text-slate-400"><span>{segment.status.toLowerCase()}</span>{segment.identity === snapshot.me.identity && ["FINAL", "CORRECTED"].includes(segment.status) && <button onClick={() => { setEditSegment(segment.id); setEditedText(segment.text); }} className="text-blue-700">Correct my transcript</button>}</div></>}</article>)}</div>}
          {panel === "CHAT" && <div className="space-y-3"><h2 className="text-sm font-semibold">Meeting chat</h2>{snapshot.events.length === 0 ? <p className="py-6 text-sm leading-6 text-slate-500">Use chat to share a link or add a point to the discussion. Chat messages are not treated as spoken evidence.</p> : snapshot.events.map((event) => <article key={event.id} className={`rounded-xl border p-3 ${event.type === "MODERATOR" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}><p className="text-xs font-semibold">{event.speakerName}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{event.text}</p><time className="mt-2 block text-[10px] text-slate-400">{new Date(event.createdAt).toLocaleTimeString()}</time></article>)}{!ended && <form onSubmit={sendChat} className="sticky bottom-0 rounded-xl border border-slate-200 bg-white p-3"><label className="sr-only" htmlFor="meeting-chat-input">Message the discussion</label><textarea id="meeting-chat-input" maxLength={2000} value={chat} onChange={(event) => setChat(event.target.value)} rows={2} placeholder="Add to the conversation…" className={inputClass} /><button disabled={!!busy || !chat.trim()} className="mt-2 w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send message</button></form>}</div>}
          {panel === "REPORTS" && <div className="space-y-4"><h2 className="text-sm font-semibold">Discussion reports</h2>{isHost && availableReports.length > 1 && <label className="block text-xs"><span className="mb-2 block font-medium">Select participant report</span><select value={selectedReport?.identity || ""} onChange={(event) => setReportIdentity(event.target.value)} className={inputClass}>{availableReports.map((item) => <option key={item.identity} value={item.identity}>{item.displayName}</option>)}</select></label>}{selectedReport ? <ReportView report={selectedReport.report} name={selectedReport.displayName} /> : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm leading-6 text-slate-500">{ended ? isHost ? "Generate participant reports after all transcript segments have finished. Scores require actual evidence." : "The host has not generated your report yet. You can return to this room from your discussion history." : "Feedback becomes available after the host ends the discussion."}</p>}</div>}
        </div>
      </aside>}
    </div>
    {deleteAction && <div role="alertdialog" aria-modal="true" aria-labelledby="delete-meeting-data-title" className="border-t border-red-900 bg-red-950 p-5"><h2 id="delete-meeting-data-title" className="font-semibold">{deleteAction === "ROOM" ? "Delete this room and its data?" : deleteAction === "ALL" ? "Delete all participants’ discussion data?" : "Delete your discussion data?"}</h2><p className="mt-2 text-sm leading-6 text-red-100">{deleteAction === "ROOM" ? "This ends an open meeting and removes its transcripts, chat, reports, memberships, and consent records." : "This permanently removes the selected transcripts, chat messages, and reports, and withdraws consent to future analysis. The room remains available."}</p><div className="mt-4 flex gap-3"><button onClick={deleteData} disabled={!!busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold">Confirm deletion</button><button onClick={() => setDeleteAction(null)} className="rounded-lg border border-red-800 px-4 py-2 text-sm">Cancel</button></div></div>}
    {devicePanel && <div className="border-t border-slate-700 bg-slate-900 p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Audio and camera devices</h2><button onClick={() => setDevicePanel(false)} aria-label="Close device settings"><X size={16} /></button></div><div className="grid gap-3 sm:grid-cols-3">{[{ kind: "audioinput", label: "Microphone" }, { kind: "videoinput", label: "Camera" }, { kind: "audiooutput", label: "Speaker" }].map((group) => <label key={group.kind} className="text-xs"><span className="mb-2 block">{group.label}</span><select aria-label={`${group.label} device`} defaultValue={rtc?.getActiveDevice(group.kind as MediaDeviceKind) || "default"} onChange={(event) => void perform("device", async () => { await rtc?.switchActiveDevice(group.kind as MediaDeviceKind, event.target.value); setVersion((prior) => prior + 1); })} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white">{devices.filter((device) => device.kind === group.kind).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `${group.label} ${index + 1}`}</option>)}</select></label>)}</div></div>}
    <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-4 sm:justify-between sm:px-6"><div className="flex flex-wrap items-center justify-center gap-2">
      <button aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"} aria-pressed={micEnabled} disabled={!mediaReady || ended || !!busy} onClick={() => toggleMedia("microphone")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-3 text-xs disabled:opacity-40 ${micEnabled ? "bg-slate-800 hover:bg-slate-700" : "bg-red-950 text-red-200"}`}>{micEnabled ? <Mic size={18} /> : <MicOff size={18} />}<span className="hidden sm:inline">{micEnabled ? "Mute" : "Unmute"}</span></button>
      <button aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} aria-pressed={cameraEnabled} disabled={!mediaReady || ended || !!busy} onClick={() => toggleMedia("camera")} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-3 text-xs hover:bg-slate-700 disabled:opacity-40">{cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}<span className="hidden sm:inline">Camera</span></button>
      <button aria-label={sharing ? "Stop screen sharing" : "Share screen"} aria-pressed={sharing} disabled={!mediaReady || ended || !!busy} onClick={() => toggleMedia("screen")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-3 text-xs disabled:opacity-40 ${sharing ? "bg-blue-700" : "bg-slate-800 hover:bg-slate-700"}`}><MonitorUp size={18} /><span className="hidden sm:inline">Share</span></button>
      <button aria-label={snapshot.me.handRaised ? "Lower hand" : "Raise hand"} aria-pressed={snapshot.me.handRaised} disabled={ended || !!busy} onClick={() => void perform("hand", async () => { await postMeeting(`/${roomCode}/hand`, { raised: !snapshot.me.handRaised }); await refreshSnapshot(); })} className={`rounded-lg px-3 py-3 text-xs ${snapshot.me.handRaised ? "bg-amber-300 text-slate-900" : "bg-slate-800 hover:bg-slate-700"}`}><Hand size={18} /></button>
      <button aria-label="Open meeting chat" onClick={() => { setPanel("CHAT"); setPanelOpen(true); }} className="rounded-lg bg-slate-800 px-3 py-3 hover:bg-slate-700"><MessageSquare size={18} /></button>
      <button aria-label="Choose microphone camera and speaker devices" disabled={ended || !!busy} onClick={chooseDevices} className="rounded-lg bg-slate-800 px-3 py-3 hover:bg-slate-700 disabled:opacity-40"><Settings2 size={18} /></button>
    </div><div className="flex gap-2">{isHost && !ended && <button disabled={!!busy} onClick={end} className="rounded-lg border border-red-800 px-4 py-3 text-xs font-semibold text-red-200 hover:bg-red-950">{busy === "end" ? "Ending…" : "End for everyone"}</button>}<button onClick={leave} disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"><PhoneOff size={17} /> Leave</button></div></footer>
  </div>;
}
