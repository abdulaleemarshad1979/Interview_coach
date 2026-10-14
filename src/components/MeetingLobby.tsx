import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, KeyRound, Loader2, ShieldCheck, Users, Video } from "lucide-react";
import { StudentProfile } from "../types";
import { formatMeetingId, meetingRequest, postMeeting, type MeetingSnapshot, type MeetingStatus } from "../lib/meetingApi";
import LiveMeeting from "./LiveMeeting";
import CameraObserver from "./CameraObserver";

interface MeetingLobbyProps {
  studentProfile: StudentProfile;
  onNavigate: (view: string) => void;
}
const topics = [
  "How should software teams use AI while preserving engineering judgment?",
  "Remote work and office work: what helps a team collaborate effectively?",
  "Should engineering education place more emphasis on practical projects?",
];
const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

export default function MeetingLobby({ studentProfile, onNavigate }: MeetingLobbyProps) {
  const invitedCode = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("meeting") || studentProfile.assignedGDRoomCode || "" : "";
  const [mode, setMode] = useState<"CREATE" | "JOIN">(invitedCode ? "JOIN" : "CREATE");
  const [title, setTitle] = useState("Practice discussion");
  const [topic, setTopic] = useState(studentProfile.assignedGDTopic || topics[0]);
  const [code, setCode] = useState(invitedCode);
  const [passcode, setPasscode] = useState("");
  const [displayName, setDisplayName] = useState(studentProfile.name || studentProfile.studentId || "");
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [observerMode, setObserverMode] = useState<"OFF" | "PASSIVE" | "ACTIVE">("PASSIVE");
  const [retentionDays, setRetentionDays] = useState(7);
  const [consent, setConsent] = useState(false);
  const [weights, setWeights] = useState([30, 25, 25, 20]);
  const [status, setStatus] = useState<MeetingStatus | null>(null);
  const [recent, setRecent] = useState<Array<Pick<MeetingSnapshot, "room" | "me">>>([]);
  const [snapshot, setSnapshot] = useState<MeetingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRecent = useCallback(async (signal?: AbortSignal) => {
    const result = await meetingRequest<{ data: Array<Pick<MeetingSnapshot, "room" | "me">> }>("/", { signal });
    setRecent(result.data);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([meetingRequest<MeetingStatus>("/status", { signal: controller.signal }).then(setStatus), loadRecent(controller.signal)])
      .catch((failure) => { if (failure.name !== "AbortError") setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadRecent]);

  const enterRoom = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const rubricIds = ["argumentQuality", "topicUnderstanding", "communicationClarity", "collaboration"];
      const path = mode === "CREATE" ? "/" : `/${code.replace(/[-\s]/g, "").toUpperCase()}/join`;
      const result = await postMeeting<MeetingSnapshot>(path, mode === "CREATE"
        ? { title, topic, displayName, passcode, waitingRoom, observerMode, retentionDays, transcriptConsent: consent, rubric: rubricIds.map((id, index) => ({ id, weight: weights[index] })) }
        : { displayName, passcode, transcriptConsent: consent });
      setSnapshot(result);
    } catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const resume = async (item: Pick<MeetingSnapshot, "room" | "me">) => {
    setBusy(true); setError("");
    try {
      if (item.room.status === "OPEN" && item.me.status === "LEFT" && item.me.role === "HOST") {
        setSnapshot(await postMeeting<MeetingSnapshot>(`/${item.room.code}/join`, { displayName: item.me.displayName, transcriptConsent: item.me.transcriptConsent }));
      } else if (item.room.status === "OPEN" && item.me.status === "LEFT") {
        setCode(item.room.code); setMode("JOIN"); setPasscode("");
        setError("Enter this room’s passcode if it has one, then request to join again.");
      } else setSnapshot(await meetingRequest<MeetingSnapshot>(`/${item.room.code}`));
    } catch (failure: any) { setError(failure.message); }
    finally { setBusy(false); }
  };
  if (snapshot) return <LiveMeeting initialSnapshot={snapshot} onLeave={() => { setSnapshot(null); void loadRecent().catch((failure) => setError(failure.message)); }} />;

  return <div className="mx-auto max-w-6xl space-y-7 p-4 text-slate-900 sm:p-6 lg:p-8">
    <button onClick={() => onNavigate("dashboard")} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"><ArrowLeft size={16} /> Dashboard</button>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Practice together</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Group discussions</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Build a strong argument, respond to another perspective, and learn from the conversation.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600"><ShieldCheck size={15} /> Signed-in participants only</span>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {!loading && status && !status.configured && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Live meetings are awaiting administrator setup. You can still view any retained discussion reports. New meetings become available when the meeting service is connected.</div>}
    {invitedCode && !/^[A-Fa-f0-9]{12}$/.test(invitedCode.replace(/[-\s]/g, "")) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">This invitation uses an older room format. Ask your host or faculty member to create a new discussion and share its invitation link.</div>}
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Room setup">
          {(["CREATE", "JOIN"] as const).map((item) => <button key={item} role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setPasscode(""); }} className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${mode === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>{item === "CREATE" ? "Host a discussion" : "Join a discussion"}</button>)}
        </div>
        <form onSubmit={enterRoom} className="space-y-5">
          <label className="block space-y-2 text-sm font-medium"><span>Your display name</span><input required maxLength={80} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={fieldClass} /></label>
          {mode === "CREATE" ? <>
            <label className="block space-y-2 text-sm font-medium"><span>Meeting title</span><input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} /></label>
            <label className="block space-y-2 text-sm font-medium"><span>Discussion topic</span><textarea aria-label="Discussion topic" required minLength={5} maxLength={1200} rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} className={fieldClass} /></label>
            <div className="flex flex-wrap gap-2">{topics.map((item, index) => <button key={item} type="button" onClick={() => setTopic(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700">Topic {index + 1}</button>)}</div>
          </> : <label className="block space-y-2 text-sm font-medium"><span>Meeting ID</span><input required maxLength={16} autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} placeholder="ABCD-1234-5678" className={`${fieldClass} font-mono uppercase tracking-wider`} /></label>}
          <label className="block space-y-2 text-sm font-medium"><span className="flex items-center gap-2"><KeyRound size={15} /> {mode === "CREATE" ? "Room passcode (optional)" : "Room passcode, if required"}</span><input type="password" minLength={mode === "CREATE" && passcode ? 4 : undefined} maxLength={64} autoComplete="off" value={passcode} onChange={(event) => setPasscode(event.target.value)} className={fieldClass} /></label>
          {mode === "CREATE" && <>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={waitingRoom} onChange={(event) => setWaitingRoom(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-700" /><span><strong className="font-medium">Use a waiting room</strong><span className="mt-1 block text-xs leading-5 text-slate-500">You approve participants before they receive access to the meeting.</span></span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium"><span>AI discussion support</span><select value={observerMode} onChange={(event) => setObserverMode(event.target.value as typeof observerMode)} className={fieldClass}><option value="OFF">Off</option><option value="PASSIVE">Passive observer</option><option value="ACTIVE">Observer + host-led moderator</option></select></label>
              <label className="block space-y-2 text-sm font-medium"><span>Keep transcripts and reports</span><select value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} className={fieldClass}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
            </div>
            <details className="rounded-xl border border-slate-200 p-4 text-sm"><summary className="cursor-pointer font-medium">Scoring criteria</summary><p className="my-3 text-xs leading-5 text-slate-500">Each criterion is scored from 0 to 5 using transcript excerpts. Unsupported criteria remain unscored. Weights must total 100%.</p><div className="grid grid-cols-2 gap-3">{["Argument quality", "Topic understanding", "Communication clarity", "Collaboration"].map((label, index) => <label key={label} className="block space-y-1 text-xs"><span>{label} (%)</span><input type="number" min={0} max={100} value={weights[index]} onChange={(event) => setWeights((prior) => prior.map((value, itemIndex) => itemIndex === index ? Number(event.target.value) : value))} className={`${fieldClass} py-2`} /></label>)}</div><p className={`mt-3 text-xs ${weights.reduce((sum, weight) => sum + weight, 0) === 100 ? "text-slate-500" : "text-red-700"}`}>Total: {weights.reduce((sum, weight) => sum + weight, 0)}%</p></details>
          </>}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1.5 h-4 w-4 shrink-0 accent-blue-700" /><span>I consent to AI transcription and analysis of <strong>my microphone</strong> for this discussion.</span></label>
            <p className="mt-2 pl-7 text-xs leading-5 text-slate-600">If the observer is enabled, consented speech is transcribed with your speaker label. Admitted participants can see live transcripts; you and the host can see your report. Audio chunks are sent to the configured speech provider and are not saved as recordings. You can withdraw consent and delete your data in the meeting. Joining without consent keeps your speech out of AI analysis.</p>
          </div>
          <button type="submit" disabled={busy || loading || !status?.configured || (mode === "CREATE" && weights.reduce((sum, weight) => sum + weight, 0) !== 100)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{busy || loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}{mode === "CREATE" ? "Create discussion" : "Request to join"}</button>
          <p className="text-center text-xs leading-5 text-slate-500">Your microphone and camera start off. Enable them when you are ready.</p>
        </form>
      </section>
      <aside className="space-y-5">
        <CameraObserver compact title="Camera & framing check" subtitle="Test face, eyes, and cheekbone tracking before your discussion" />
        <section className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><Users size={22} /></div><h2 className="text-xl font-semibold">A room for better conversations</h2><div className="mt-5 space-y-4 text-sm text-slate-300">{["Share an invitation with your group.", "Check your microphone and camera controls.", "Discuss the topic and build on each other’s ideas.", "Review feedback with actual transcript evidence."].map((item) => <p key={item} className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-blue-300" />{item}</p>)}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><Clock3 size={18} /> Your discussions</h2>{loading ? <p className="mt-5 text-sm text-slate-500">Loading your history…</p> : recent.length === 0 ? <p className="mt-5 text-sm leading-6 text-slate-500">You haven’t joined a discussion yet. Start a room or use an invitation from your host.</p> : <div className="mt-4 space-y-2">{recent.map((item) => <button key={item.room.code} disabled={busy} onClick={() => void resume(item)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.room.title}</p><p className="mt-1 font-mono text-xs text-slate-500">{formatMeetingId(item.room.code)}</p><p className="mt-1 text-xs text-slate-500">{item.room.status === "OPEN" ? item.me.status === "WAITING" ? "Waiting for admission" : "Discussion open" : "View retained report"}</p></div><Video size={18} className="shrink-0 text-slate-500" /></button>)}</div>}</section>
      </aside>
    </div>
  </div>;
}
