import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, ArrowLeft, RotateCcw, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { mutateInterview, readApiJson } from '../lib/interviewClient';
import type { InterviewConfig, InterviewSession } from '../lib/interviewTypes';
import type { FullAnalysisResult, StudentProfile } from '../types';
import { getVoiceOptions, setVoiceOptions, speakNaturalAI, stopNaturalSpeech, type VoiceOptions } from '../lib/naturalVoice';
import { MicrophoneCapture, listMicrophoneDevices, transcribeRecordedSpeech } from '../lib/speechCapture';
import InterviewConfiguration from './InterviewConfiguration';
import EvidenceReport from './EvidenceReport';
import CameraObserver from './CameraObserver';

interface Props { studentProfile: StudentProfile; analysisResult: FullAnalysisResult | null; sessionId?: string | null; onNavigate: (view: string) => void }
type PendingAction = { action: 'start' | 'messages' | 'complete'; requestId: string; questionId?: string; text?: string };

export default function AdaptiveInterviewPage({ studentProfile, analysisResult, sessionId, onNavigate }: Props) {
  const [config, setConfig] = useState<InterviewConfig>({
    mode: 'technical', targetRole: studentProfile.assignedCompanyDrive?.roleTitle || 'Software engineer',
    experienceLevel: 'student', technicalDomain: studentProfile.assignedInterviewTopic || studentProfile.department || 'Software engineering',
    difficulty: 'intermediate', durationMinutes: 15,
    resumeText: analysisResult ? JSON.stringify(analysisResult.parsedResume, null, 2).slice(0, 12000) : '',
    companyName: studentProfile.assignedCompanyDrive?.companyName || '',
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
  const [now, setNow] = useState(Date.now());
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [retry, setRetry] = useState<PendingAction | null>(null);
  const activeSession = useRef<InterviewSession | null>(null);
  const capture = useRef<MicrophoneCapture | null>(null);
  const controller = useRef<AbortController | null>(null);
  const spokenId = useRef('');
  const alive = useRef(true);
  const saveSession = (value: InterviewSession) => { activeSession.current = value; setSession(value); };
  useEffect(() => {
    alive.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { alive.current = false; clearInterval(timer); controller.current?.abort(); capture.current?.cancel(); stopNaturalSpeech(); };
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
  }, [session?.id, session?.version, session?.isProcessing, now, busy]);
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
    capture.current?.cancel(); setRecording(false); setUntranscribedAudio(false); stopNaturalSpeech(); setSpeaking(false);
    setBusy(true); setError(''); setPreview(''); setRetry(pending);
    const abort = new AbortController(); controller.current = abort;
    try {
      const next = await mutateInterview(current.id, pending.action, { ...pending, action: undefined, expectedVersion: current.version }, {
        signal: abort.signal, onPreview: text => alive.current && setPreview(text), onStatus: text => alive.current && setStatus(text),
      });
      if (!alive.current) return;
      saveSession(next); setRetry(null); setAnswer(''); setPreview('');
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
      setCaptureInfo(value);
      if (value.status === 'stopped' || value.status === 'error') setRecording(false);
      if (value.status === 'stopped') setUntranscribedAudio(true);
      if (value.error) setError(value.error);
    });
    try { await recorder.start(); if (alive.current) { setRecording(true); setDevices(await listMicrophoneDevices()); } }
    catch (failure) { setError((failure as Error).message); }
  };
  const endRecording = async () => {
    const recorder = capture.current;
    if (!recorder) return;
    setBusy(true); setStatus('Transcribing your answer…'); setRecording(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const audio = await recorder.stop();
      if (!audio.speechDetected) throw new Error('No speech was detected. Check your microphone or type your answer.');
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
  const remaining = session?.endsAt ? Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 1000)) : config.durationMinutes * 60;
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
    {session?.report && <EvidenceReport report={session.report} turns={session.turns} />}
    {session && !session.report && <>
      <div className="coach-session-bar"><span className="coach-status">{session.state.replaceAll('_', ' ')}</span><span aria-label="Time remaining">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} remaining</span><span>{session.turns.filter(turn => turn.role === 'candidate').length} answers saved</span></div>
      {remaining === 0 && session.currentQuestion && <div className="coach-notice">The session time has ended. You can submit your final answer, then generate your report.</div>}
      <CameraObserver />
      <div className="coach-room-grid"><section className="coach-panel coach-question"><p className="coach-eyebrow">Your interviewer</p><h2>{currentUtterance || 'Ready when you are'}</h2>
        {session.currentQuestion?.groundedIn && <p className="coach-muted">Following up on your answer: “{session.currentQuestion.groundedIn}”</p>}
        {(busy || session.isProcessing) && <div className="coach-notice" role="status"><p>{status || 'Preparing the next turn…'}</p>{preview && <p className="coach-preview">{preview}</p>}<button className="coach-button" onClick={() => void cancelRequest()}>Cancel request</button></div>}
        <div className="coach-actions"><button className="coach-button" disabled={!currentUtterance || busy || recording} onClick={() => speaking ? (stopNaturalSpeech(), setSpeaking(false)) : void say(currentUtterance)}>{speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}{speaking ? 'Stop voice' : 'Replay question'}</button>
          <label className="coach-inline-label"><input type="checkbox" checked={autoSpeak} onChange={event => { setAutoSpeak(event.target.checked); if (!event.target.checked) { stopNaturalSpeech(); setSpeaking(false); } }} />Speak new questions</label></div>
        <details><summary>Voice settings</summary><div className="coach-form-grid"><label>Voice<select value={voice.voice} onChange={event => updateVoice({ voice: event.target.value as VoiceOptions['voice'] })}>{['hannah', 'autumn', 'diana'].map(value => <option value={value} key={value}>{value}</option>)}</select></label><label>Provider<select value={voice.provider || 'groq'} onChange={event => updateVoice({ provider: event.target.value as VoiceOptions['provider'] })}><option value="groq">Groq Orpheus</option><option value="browser">Browser speech</option></select></label></div></details>
      </section><section className="coach-panel"><p className="coach-eyebrow">Your response</p><h2>Take a moment, then answer</h2>
        <div className="coach-actions"><button className="coach-button" disabled={busy || (!recording && !canAnswer)} onClick={() => recording ? void endRecording() : void beginRecording()}>{recording ? <Square size={17} /> : <Mic size={17} />}{recording ? 'Stop and transcribe' : 'Record answer'}</button>{recording && <span role="status">{captureInfo.speaking ? 'Speech detected' : 'Listening'} · {Math.floor(captureInfo.durationMs / 1000)}s</span>}</div>
        {recording && <><progress aria-label="Microphone activity" max={1} value={captureInfo.level} />{captureInfo.silenceMs > 1800 && <p className="coach-muted">Take your time. Stop recording when your answer is complete.</p>}</>}
        {devices.length > 0 && <label>Microphone<select disabled={recording} value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">System default</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>}
        {!recording && untranscribedAudio && !busy && <button className="coach-button" onClick={() => void endRecording()}>Transcribe saved recording</button>}
        <label htmlFor="candidate-answer">Review your answer<textarea id="candidate-answer" rows={8} maxLength={12000} value={answer} onChange={event => setAnswer(event.target.value)} disabled={busy || !canAnswer} placeholder="Type your answer, or record and review the transcript here." /></label>
        <p className="coach-muted">Only the answer you submit is evaluated. No camera or personality assessment is inferred.</p>
        <div className="coach-actions"><button className="coach-button primary" disabled={busy || recording || !canAnswer || !answer.trim() || Boolean(session.pendingAnswer)} onClick={() => void run({ action: 'messages', requestId: crypto.randomUUID(), questionId: session.currentQuestion!.id, text: answer.trim() })}>Send answer</button>
          <button className="coach-button" disabled={busy || recording || session.isProcessing || session.turns.every(turn => turn.role !== 'candidate')} onClick={() => void run({ action: 'complete', requestId: crypto.randomUUID() })}>Finish & get report</button>
          {session.state === 'PREPARING' && <button className="coach-button primary" disabled={busy} onClick={() => void run({ action: 'start', requestId: retry?.requestId || crypto.randomUUID() })}>Begin questions</button>}</div>
      </section></div>
      <details className="coach-panel"><summary>Conversation transcript · {session.turns.length} turns</summary>{session.turns.map(turn => <div key={turn.id} className="coach-transcript-turn"><strong>{turn.role === 'candidate' ? 'You' : 'Interviewer'}</strong><p>{turn.text}</p></div>)}</details>
      <p className="coach-muted">Saved to your account. Leaving this page releases the microphone and stops playback; you can resume from history.</p>
    </>}
  </div>;
}
