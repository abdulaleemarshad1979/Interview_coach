import React, { Suspense, lazy, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, ArrowLeft, RotateCcw, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { mutateInterview, readApiJson } from '../lib/interviewClient';
import type { InterviewConfig, InterviewSession } from '../lib/interviewTypes';
import type { FullAnalysisResult, StudentProfile } from '../types';
import { getVoiceOptions, setVoiceOptions, speakNaturalAI, stopNaturalSpeech, type VoiceOptions } from '../lib/naturalVoice';
import { MicrophoneCapture, listMicrophoneDevices, transcribeRecordedSpeech } from '../lib/speechCapture';
import type { DeliveryMetrics } from '../lib/interviewTypes';
import type { CameraSample } from './CameraObserver';
import InterviewConfiguration from './InterviewConfiguration';
// Heavy modules (MediaPipe face tracking, report view) load only when needed.
const CameraObserver = lazy(() => import('./CameraObserver'));
const EvidenceReport = lazy(() => import('./EvidenceReport'));

/** Owns the 1 Hz clock so a ticking timer re-renders only this bar, not the whole interview page. */
const SessionBar = memo(function SessionBar({ endsAt, durationMinutes, state, answers, hasQuestion }: { endsAt: string | null; durationMinutes: number; state: string; answers: number; hasQuestion: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000)) : durationMinutes * 60;
  return <>
    <div className="coach-session-bar"><span className="coach-status">{state.replaceAll('_', ' ')}</span><span aria-label="Time remaining">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} remaining</span><span>{answers} answers saved</span></div>
    {remaining === 0 && hasQuestion && <div className="coach-notice">The session time has ended. You can submit your final answer, then generate your report.</div>}
  </>;
});
const MemoCamera = memo(function MemoCamera({ onSample }: { onSample: (sample: CameraSample) => void }) {
  return <Suspense fallback={<div className="coach-panel coach-muted">Loading camera tools…</div>}><CameraObserver onSample={onSample} /></Suspense>;
});

const emptyDelivery = () => ({ durationMs: 0, speechMs: 0, silenceMs: 0, longPauses: 0, samples: 0, face: 0, eye: 0, movement: 0, inPause: false });

interface Props { studentProfile: StudentProfile; analysisResult: FullAnalysisResult | null; sessionId?: string | null; onNavigate: (view: string) => void }
type PendingAction = { action: 'start' | 'messages' | 'complete'; requestId: string; questionId?: string; text?: string; delivery?: DeliveryMetrics };

export default function AdaptiveInterviewPage({ studentProfile, analysisResult, sessionId, onNavigate }: Props) {
  const [config, setConfig] = useState<InterviewConfig>({
    mode: 'technical', targetRole: studentProfile.assignedCompanyDrive?.roleTitle || 'Software engineer',
    experienceLevel: 'student', technicalDomain: studentProfile.assignedInterviewTopic || studentProfile.department || 'Software engineering',
    difficulty: 'intermediate', durationMinutes: 15,
    resumeText: analysisResult ? JSON.stringify(analysisResult.parsedResume, null, 2).slice(0, 12000) : '',
    githubContext: analysisResult?.githubAnalysis ? JSON.stringify(analysisResult.githubAnalysis, null, 2).slice(0, 8000) : '',
    companyName: studentProfile.assignedCompanyDrive?.companyName || '',
    githubUsername: studentProfile.githubUsername || undefined,
  });
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [voice, setVoice] = useState<VoiceOptions>(getVoiceOptions);
  const [busy, setBusy] = useState(Boolean(sessionId));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [untranscribedAudio, setUntranscribedAudio] = useState(false);
  const [captureInfo, setCaptureInfo] = useState({ level: 0, speaking: false, silenceMs: 0, durationMs: 0 });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [retry, setRetry] = useState<PendingAction | null>(null);
  const activeSession = useRef<InterviewSession | null>(null);
  const capture = useRef<MicrophoneCapture | null>(null);
  const controller = useRef<AbortController | null>(null);
  const spokenId = useRef('');
  const alive = useRef(true);
  const recordingRef = useRef(false);
  const delivery = useRef(emptyDelivery());
  const saveSession = (value: InterviewSession) => { activeSession.current = value; setSession(value); };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); capture.current?.cancel(); stopNaturalSpeech(); };
  }, []);
  const refresh = async (id: string) => {
    const data = await readApiJson<{ session: InterviewSession }>(await apiFetch(`/api/interview/sessions/${encodeURIComponent(id)}`));
    saveSession(data.session); return data.session;
  };
  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    setBusy(true);
    void refresh(sessionId).then(value => {
      if (!current) return;
      if (value.pendingAnswer) {
        const pending = value.pendingAnswer;
        const text = value.turns.find(turn => turn.id === pending.turnId)?.text || '';
        setAnswer(text); setRetry({ action: 'messages', requestId: pending.requestId, questionId: pending.questionId, text });
      }
    }).catch(failure => current && setError(failure.message)).finally(() => current && setBusy(false));
    return () => { current = false; };
  }, [sessionId]);
  useEffect(() => {
    if (!session?.isProcessing || busy) return;
    const timer = setTimeout(() => void refresh(session.id).catch(failure => setError(failure.message)), 2000);
    return () => clearTimeout(timer);
  }, [session?.id, session?.version, session?.isProcessing, busy]);
  const onCameraSample = useCallback((sample: CameraSample) => {
    if (!recordingRef.current) return; // only the moments the candidate is answering count
    const d = delivery.current;
    d.samples++; d.movement += sample.movement;
    if (sample.face) d.face++;
    if (sample.eyeContact) d.eye++;
  }, []);
  const deliverySnapshot = (): DeliveryMetrics | undefined => {
    const d = delivery.current;
    if (d.durationMs < 1000) return undefined;
    return { durationMs: Math.round(d.durationMs), speechMs: Math.round(d.speechMs), silenceMs: Math.round(d.silenceMs), longPauses: d.longPauses,
      ...(d.samples >= 5 ? { camera: { samples: d.samples, faceRatio: d.face / d.samples, eyeContactRatio: d.eye / d.samples, steadiness: Math.max(0, 1 - (d.movement / d.samples) / 0.02) } } : {}) };
  };
  const updateVoice = (value: Partial<VoiceOptions>) => { setVoiceOptions({ ...voice, ...value }); setVoice(getVoiceOptions()); };
  const say = async (text: string) => {
    stopNaturalSpeech(); setError('');
    try {
      const result = await speakNaturalAI(text, () => alive.current && setSpeaking(true), () => alive.current && setSpeaking(false), { ...voice, allowBrowserFallback: true });
      if (result.status === 'failed') throw new Error(result.error || 'Playback unavailable');
    }
    catch (failure) {
      try {
        const fallback = await speakNaturalAI(text, () => alive.current && setSpeaking(true), () => alive.current && setSpeaking(false), { ...voice, provider: 'browser' });
        if (fallback.status === 'failed') throw failure;
      } catch {
        if (alive.current) setError(`Voice playback failed: ${(failure as Error).message}. Use Replay or choose browser speech in voice settings.`);
      }
    }
    finally { if (alive.current) setSpeaking(false); }
  };
  useEffect(() => {
    const latest = session?.turns.filter(turn => turn.role === 'interviewer').at(-1);
    if (!latest || latest.id === spokenId.current || !autoSpeak || session?.state === 'COMPLETED') return;
    spokenId.current = latest.id;
    void say(latest.text);
  }, [session?.version, autoSpeak]);
  const run = async (pending: PendingAction, initial?: InterviewSession) => {
    const current = initial || activeSession.current;
    if (!current) return;
    capture.current?.cancel(); recordingRef.current = false; setRecording(false); setUntranscribedAudio(false); stopNaturalSpeech(); setSpeaking(false);
    setBusy(true); setError(''); setPreview(''); setRetry(pending);
    const abort = new AbortController(); controller.current = abort;
    try {
      const next = await mutateInterview(current.id, pending.action, { ...pending, action: undefined, expectedVersion: current.version, ...(pending.action === 'messages' ? { delivery: pending.delivery } : {}) }, {
        signal: abort.signal, onPreview: text => alive.current && setPreview(text), onStatus: text => alive.current && setStatus(text),
      });
      if (!alive.current) return;
      saveSession(next); setRetry(null); setAnswer(''); setPreview(''); delivery.current = emptyDelivery();
    } catch (failure) {
      if (!alive.current) return;
      setError(abort.signal.aborted ? 'Request cancelled. Your saved answer can be retried.' : (failure as Error).message);
      await refresh(current.id).catch(() => {});
    } finally { if (alive.current) { setBusy(false); setStatus(''); } }
  };
  const start = async () => {
    setBusy(true); setError('');
    try {
      const data = await readApiJson<{ session: InterviewSession }>(await apiFetch('/api/interview/sessions', { method: 'POST', body: JSON.stringify({ config }) }));
      saveSession(data.session);
      await run({ action: 'start', requestId: crypto.randomUUID() }, data.session);
    } catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  const beginRecording = async () => {
    setError(''); stopNaturalSpeech(); setSpeaking(false); setUntranscribedAudio(false);
    const recorder = new MicrophoneCapture({ deviceId: deviceId || undefined }); capture.current = recorder;
    recorder.subscribe(value => {
      if (!alive.current) return;
      const d = delivery.current;
      if (value.silenceMs >= 1500 && !d.inPause) { d.inPause = true; d.longPauses++; }
      else if (value.silenceMs < 1500) d.inPause = false;
      setCaptureInfo(value);
      if (value.status === 'stopped' || value.status === 'error') setRecording(false);
      if (value.status === 'stopped') setUntranscribedAudio(true);
      if (value.error) setError(value.error);
    });
    try { await recorder.start(); if (alive.current) { recordingRef.current = true; setRecording(true); setDevices(await listMicrophoneDevices()); } }
    catch (failure) { setError((failure as Error).message); }
  };
  const endRecording = async () => {
    const recorder = capture.current;
    if (!recorder) return;
    recordingRef.current = false;
    setBusy(true); setStatus('Transcribing your answer…'); setRecording(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const audio = await recorder.stop();
      if (!audio.speechDetected) throw new Error('No speech was detected. Check your microphone or type your answer.');
      const d = delivery.current;
      d.durationMs += audio.durationMs; d.speechMs += audio.voicedDurationMs; d.silenceMs += Math.max(0, audio.durationMs - audio.voicedDurationMs);
      const result = await transcribeRecordedSpeech(audio, { signal: abort.signal });
      if (alive.current) { setAnswer(old => `${old}${old ? '\n' : ''}${result.text}`.trim()); setUntranscribedAudio(false); }
    } catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { if (alive.current) { setBusy(false); setStatus(''); } }
  };
  const cancelRequest = async () => {
    controller.current?.abort();
    if (!activeSession.current) return;
    try {
      const data = await readApiJson<{ session: InterviewSession }>(await apiFetch(`/api/interview/sessions/${activeSession.current.id}/cancel`, { method: 'POST' }));
      if (alive.current) saveSession(data.session);
    } catch (failure) { if (alive.current) setError((failure as Error).message); }
  };
  const canAnswer = !session?.isProcessing && session?.currentQuestion && !['PREPARING', 'CLOSING', 'EVALUATION', 'COMPLETED'].includes(session.state);
  const currentUtterance = session?.turns.filter(turn => turn.role === 'interviewer').at(-1)?.text || '';
  return <div className="coach-page">
    <div className="coach-heading"><div><p className="coach-eyebrow">Interview Coach</p><h1>{session ? session.config.targetRole : 'Prepare for your next conversation'}</h1><p>{session ? `${session.config.mode.replace('-', ' ')} interview · ${session.config.experienceLevel}` : 'Practice real answers. Get meaningful follow-up questions.'}</p></div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="coach-button" type="button" onClick={() => onNavigate('group-discussion')}><Users size={16} />Group discussion</button>
        <button className="coach-button" type="button" onClick={() => onNavigate('history')}><ArrowLeft size={16} />Session history</button>
      </div>
    </div>
    {error && <div className="coach-error" role="alert">{error}</div>}
    {retry && session && !busy && !session.isProcessing && <div className="coach-notice"><p>{session.pendingAnswer ? 'Your answer is saved. Resume generation to continue from it.' : 'This turn can be retried without duplicating your transcript.'}</p><button className="coach-button" onClick={() => void refresh(session.id).then(fresh => run(retry, fresh)).catch(failure => setError(failure.message))}><RotateCcw size={16} />Retry saved turn</button></div>}
    {!session && <InterviewConfiguration config={config} onChange={setConfig} voice={voice} onVoiceChange={updateVoice} busy={busy} onStart={() => void start()} />}
    {session?.report && <Suspense fallback={<p className="coach-muted" role="status">Loading your report…</p>}><EvidenceReport report={session.report} turns={session.turns} /></Suspense>}
    {session && !session.report && <>
      <SessionBar endsAt={session.endsAt} durationMinutes={session.config.durationMinutes} state={session.state} answers={session.turns.filter(turn => turn.role === 'candidate').length} hasQuestion={Boolean(session.currentQuestion)} />
      <MemoCamera onSample={onCameraSample} />
      <div className="coach-room-grid"><section className="coach-panel coach-question"><p className="coach-eyebrow">Your interviewer</p><h2>{currentUtterance || 'Ready when you are'}</h2>
        {session.currentQuestion?.groundedIn && <p className="coach-muted">Following up on your answer: “{session.currentQuestion.groundedIn}”</p>}
        {(busy || session.isProcessing) && <div className="coach-notice" role="status"><p>{status || 'Preparing the next turn…'}</p>{preview && <p className="coach-preview">{preview}</p>}<button className="coach-button" onClick={() => void cancelRequest()}>Cancel request</button></div>}
        <div className="coach-actions"><button className="coach-button" disabled={!currentUtterance || busy || recording} onClick={() => speaking ? (stopNaturalSpeech(), setSpeaking(false)) : void say(currentUtterance)}>{speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}{speaking ? 'Stop voice' : 'Replay question'}</button>
          <label className="coach-inline-label"><input type="checkbox" checked={autoSpeak} onChange={event => { setAutoSpeak(event.target.checked); if (!event.target.checked) { stopNaturalSpeech(); setSpeaking(false); } }} />Speak new questions</label></div>
        <details><summary>Voice settings</summary><div className="coach-form-grid"><label>Voice<select value={voice.voice} onChange={event => updateVoice({ voice: event.target.value as VoiceOptions['voice'] })}>{[['Jade-PlayAI','Jade'],['Aaliyah-PlayAI','Aaliyah'],['Constance-PlayAI','Constance'],['Fritz-PlayAI','Fritz']].map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Provider<select value={voice.provider || 'groq'} onChange={event => updateVoice({ provider: event.target.value as VoiceOptions['provider'] })}><option value="groq">Groq PlayAI</option><option value="browser">Browser speech</option></select></label></div></details>
      </section><section className="coach-panel"><p className="coach-eyebrow">Your response</p><h2>Take a moment, then answer</h2>
        <div className="coach-actions"><button className="coach-button" disabled={busy || (!recording && !canAnswer)} onClick={() => recording ? void endRecording() : void beginRecording()}>{recording ? <Square size={17} /> : <Mic size={17} />}{recording ? 'Stop and transcribe' : 'Record answer'}</button>{recording && <span role="status">{captureInfo.speaking ? 'Speech detected' : 'Listening'} · {Math.floor(captureInfo.durationMs / 1000)}s</span>}</div>
        {recording && <><progress aria-label="Microphone activity" max={1} value={captureInfo.level} />{captureInfo.silenceMs > 1800 && <p className="coach-muted">Take your time. Stop recording when your answer is complete.</p>}</>}
        {devices.length > 0 && <label>Microphone<select disabled={recording} value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">System default</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>}
        {!recording && untranscribedAudio && !busy && <button className="coach-button" onClick={() => void endRecording()}>Transcribe saved recording</button>}
        <div aria-live="polite"><strong>Your transcribed answer</strong><p className="coach-muted">{answer || 'Record your answer. The transcript appears here for you to review before sending.'}</p></div>
        <p className="coach-muted">Answers are spoken, not typed. Only the answer you submit is evaluated. Turn your camera on to include eye contact and presence in your delivery score; no emotion or personality is inferred.</p>
        <div className="coach-actions"><button className="coach-button primary" disabled={busy || recording || !canAnswer || !answer.trim() || Boolean(session.pendingAnswer)} onClick={() => void run({ action: 'messages', requestId: crypto.randomUUID(), questionId: session.currentQuestion!.id, text: answer.trim(), delivery: deliverySnapshot() })}>Send answer</button>
          <button className="coach-button" disabled={busy || recording || session.isProcessing || session.turns.every(turn => turn.role !== 'candidate')} onClick={() => void run({ action: 'complete', requestId: crypto.randomUUID() })}>Finish & get report</button>
          {session.state === 'PREPARING' && <button className="coach-button primary" disabled={busy} onClick={() => void run({ action: 'start', requestId: retry?.requestId || crypto.randomUUID() })}>Begin questions</button>}</div>
      </section></div>
      <details className="coach-panel"><summary>Conversation transcript · {session.turns.length} turns</summary>{session.turns.map(turn => <div key={turn.id} className="coach-transcript-turn"><strong>{turn.role === 'candidate' ? 'You' : 'Interviewer'}</strong><p>{turn.text}</p></div>)}</details>
      <p className="coach-muted">Saved to your account. Leaving this page releases the microphone and stops playback; you can resume from history.</p>
    </>}
  </div>;
}
