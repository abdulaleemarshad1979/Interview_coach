import React, { Suspense, lazy, memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { readApiJson } from '../lib/interviewClient';
import { DISCUSSION_CRITERIA, type DiscussionSession, type DiscussionTurn } from '../lib/discussionTypes';
import type { DeliveryMetrics } from '../lib/interviewTypes';
import { getVoiceOptions, speakNaturalAI, stopNaturalSpeech } from '../lib/naturalVoice';
import { MicrophoneCapture, transcribeRecordedSpeech } from '../lib/speechCapture';
import type { CameraSample } from './CameraObserver';

const CameraObserver = lazy(() => import('./CameraObserver'));
const MemoCamera = memo(function MemoCamera({ onSample }: { onSample: (sample: CameraSample) => void }) {
  return <Suspense fallback={null}><CameraObserver compact title="Camera (optional)" subtitle="Adds eye contact and presence to your delivery score" onSample={onSample} /></Suspense>;
});

const VOICES: Record<string, 'Jade-PlayAI' | 'Fritz-PlayAI' | 'Aaliyah-PlayAI'> = { aisha: 'Jade-PlayAI', rahul: 'Fritz-PlayAI', meera: 'Aaliyah-PlayAI' };
const TOPICS = [
  'How should software teams use AI while preserving engineering judgment?',
  'Remote work and office work: what helps a team collaborate effectively?',
  'Should engineering education place more emphasis on practical projects?',
];
const emptyDelivery = () => ({ durationMs: 0, speechMs: 0, silenceMs: 0, longPauses: 0, samples: 0, face: 0, eye: 0, movement: 0, inPause: false });

export default function AiPanelDiscussion({ initialTopic, onExit }: { initialTopic?: string; onExit: () => void }) {
  const [topic, setTopic] = useState(initialTopic || TOPICS[0]);
  const [session, setSession] = useState<DiscussionSession | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const alive = useRef(true);
  const capture = useRef<MicrophoneCapture | null>(null);
  const recordingRef = useRef(false);
  const delivery = useRef(emptyDelivery());
  const spoken = useRef(new Set<string>());
  const autoSpeakRef = useRef(true);
  autoSpeakRef.current = autoSpeak;

  useEffect(() => { alive.current = true; return () => { alive.current = false; capture.current?.cancel(); void stopNaturalSpeech(); }; }, []);

  const speak = useCallback(async (turns: DiscussionTurn[]) => {
    for (const turn of turns) {
      if (!alive.current || !autoSpeakRef.current || spoken.current.has(turn.id)) continue;
      spoken.current.add(turn.id);
      setSpeakingId(turn.id);
      try { await speakNaturalAI(turn.text, undefined, undefined, { ...getVoiceOptions(), voice: VOICES[turn.speaker] || 'Jade-PlayAI', allowBrowserFallback: true }); } catch { /* text stays visible */ }
    }
    if (alive.current) setSpeakingId('');
  }, []);
  const show = useCallback((next: DiscussionSession) => {
    setSession(next);
    void speak(next.turns.filter(turn => turn.role === 'interviewer'));
  }, [speak]);
  const call = async (label: string, request: () => Promise<Response>) => {
    setBusy(label); setError('');
    try { return await readApiJson<{ session: DiscussionSession }>(await request()); }
    catch (failure: any) { setError(failure.message); throw failure; }
    finally { if (alive.current) setBusy(''); }
  };

  const start = () => void call('Starting the panel…', () => apiFetch('/api/discussions', { method: 'POST', body: JSON.stringify({ topic }) })).then(data => show(data.session)).catch(() => {});
  const send = async () => {
    if (!session || !draft.trim()) return;
    const d = delivery.current;
    const metrics: DeliveryMetrics | undefined = d.durationMs >= 1000 ? { durationMs: Math.round(d.durationMs), speechMs: Math.round(d.speechMs), silenceMs: Math.round(d.silenceMs), longPauses: d.longPauses,
      ...(d.samples >= 5 ? { camera: { samples: d.samples, faceRatio: d.face / d.samples, eyeContactRatio: d.eye / d.samples, steadiness: Math.max(0, 1 - (d.movement / d.samples) / 0.02) } } : {}) } : undefined;
    void stopNaturalSpeech();
    try {
      const data = await call('The panel is responding…', () => apiFetch(`/api/discussions/${session.id}/turns`, { method: 'POST', body: JSON.stringify({ text: draft.trim(), expectedVersion: session.version, delivery: metrics }) }));
      setDraft(''); delivery.current = emptyDelivery(); show(data.session);
    } catch { /* the saved turn is restored by the refresh below */ }
    const fresh = await readApiJson<{ session: DiscussionSession }>(await apiFetch(`/api/discussions/${session.id}`)).catch(() => null);
    if (fresh && alive.current) { setSession(fresh.session); if (fresh.session.turns.some(turn => turn.text === draft.trim() && turn.role === 'candidate')) setDraft(''); }
  };
  const finish = () => session && void call('Evaluating your discussion…', () => apiFetch(`/api/discussions/${session.id}/complete`, { method: 'POST', body: '{}' })).then(data => { void stopNaturalSpeech(); setSession(data.session); }).catch(() => {});

  const onCameraSample = useCallback((sample: CameraSample) => {
    if (!recordingRef.current) return;
    const d = delivery.current; d.samples++; d.movement += sample.movement;
    if (sample.face) d.face++;
    if (sample.eyeContact) d.eye++;
  }, []);
  const record = async () => {
    setError(''); void stopNaturalSpeech(); setSpeakingId('');
    const recorder = new MicrophoneCapture(); capture.current = recorder;
    recorder.subscribe(value => {
      const d = delivery.current;
      if (value.silenceMs >= 1500 && !d.inPause) { d.inPause = true; d.longPauses++; } else if (value.silenceMs < 1500) d.inPause = false;
      if (value.error && alive.current) setError(value.error);
    });
    try { await recorder.start(); recordingRef.current = true; setRecording(true); } catch (failure) { setError((failure as Error).message); }
  };
  const stopRecording = async () => {
    const recorder = capture.current; if (!recorder) return;
    recordingRef.current = false; setRecording(false); setBusy('Transcribing…');
    try {
      const audio = await recorder.stop();
      if (!audio.speechDetected) throw new Error('No speech was detected. Check your microphone and try again.');
      const d = delivery.current; d.durationMs += audio.durationMs; d.speechMs += audio.voicedDurationMs; d.silenceMs += Math.max(0, audio.durationMs - audio.voicedDurationMs);
      const result = await transcribeRecordedSpeech(audio);
      if (alive.current) setDraft(old => `${old}${old ? ' ' : ''}${result.text}`.trim());
    } catch (failure) { if (alive.current) setError((failure as Error).message); }
    finally { if (alive.current) setBusy(''); }
  };

  const report = session?.report;
  const yourTurns = session?.turns.filter(turn => turn.role === 'candidate').length || 0;
  return <div className="coach-page">
    <div className="coach-heading"><div><p className="coach-eyebrow">Group discussion</p><h1>{session ? 'Discussion with your AI panel' : 'Practise with an AI panel'}</h1><p>{session ? session.topic : 'Three AI participants discuss a topic with you. Speak your points, respond to theirs, then get an evidence-based report.'}</p></div>
      <button className="coach-button" type="button" onClick={onExit}><ArrowLeft size={16} />Back</button></div>
    {error && <div className="coach-error" role="alert">{error}</div>}
    {!session && <section className="coach-panel">
      <label>Discussion topic<textarea rows={3} maxLength={400} value={topic} onChange={event => setTopic(event.target.value)} /></label>
      <div className="coach-actions">{TOPICS.map((item, index) => <button key={item} type="button" className="coach-button" onClick={() => setTopic(item)}>Topic {index + 1}</button>)}</div>
      <div className="coach-actions"><button className="coach-button primary" disabled={Boolean(busy) || topic.trim().length < 5} onClick={start}>{busy || 'Start discussion'}</button></div>
    </section>}
    {session && !report && <>
      <MemoCamera onSample={onCameraSample} />
      <section className="coach-panel" aria-label="Discussion transcript" aria-live="polite">
        {session.turns.map(turn => <div key={turn.id} className="coach-transcript-turn"><strong>{turn.role === 'candidate' ? 'You' : turn.name}{speakingId === turn.id ? ' · speaking' : ''}</strong><p>{turn.text}</p></div>)}
        {busy && <p className="coach-muted" role="status">{busy}</p>}
      </section>
      <section className="coach-panel">
        <p className="coach-eyebrow">Your turn · {yourTurns} contribution{yourTurns === 1 ? '' : 's'}</p>
        <div className="coach-actions">
          <button className="coach-button" disabled={Boolean(busy) && !recording} onClick={() => recording ? void stopRecording() : void record()}>{recording ? <Square size={17} /> : <Mic size={17} />}{recording ? 'Stop and transcribe' : 'Speak your point'}</button>
          <label className="coach-inline-label"><input type="checkbox" checked={autoSpeak} onChange={event => { setAutoSpeak(event.target.checked); if (!event.target.checked) { void stopNaturalSpeech(); setSpeakingId(''); } }} />{autoSpeak ? <Volume2 size={15} /> : <VolumeX size={15} />} Panel speaks aloud</label>
        </div>
        <label>Review your transcribed point before sending<textarea rows={3} maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Record your point, or edit the transcript here." /></label>
        <div className="coach-actions">
          <button className="coach-button primary" disabled={Boolean(busy) || recording || !draft.trim()} onClick={() => void send()}>Send to panel</button>
          <button className="coach-button" disabled={Boolean(busy) || recording || yourTurns === 0} onClick={finish}>Finish &amp; get report</button>
        </div>
      </section>
    </>}
    {report && <section className="coach-report" aria-labelledby="gd-report">
      <div className="coach-heading"><div><p className="coach-eyebrow">Discussion report</p><h2 id="gd-report">How you came across</h2></div><div className="coach-score"><strong>{report.overallScore ?? '—'}</strong><span>Overall / 100</span></div></div>
      <p>{report.summary}</p>
      {report.contentScore != null && report.delivery.score != null && <p className="coach-muted">{Math.round((1 - report.delivery.weight) * 100)}% discussion content ({report.contentScore}) + {Math.round(report.delivery.weight * 100)}% delivery ({report.delivery.score}).</p>}
      <div className="coach-report-grid">{DISCUSSION_CRITERIA.map(key => { const value = report.criteria[key]; return <article className="coach-panel" key={key}>
        <div className="coach-heading"><h3>{key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</h3><strong>{value.score === null ? 'Not assessed' : `${value.score}/100`}</strong></div>
        <p>{value.feedback}</p>{value.evidence.map((e, i) => <blockquote key={i}>“{e.quote}”</blockquote>)}</article>; })}</div>
      <div className="coach-report-grid">
        <article className="coach-panel"><h3>Strengths</h3><ul>{report.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></article>
        <article className="coach-panel"><h3>Practise next</h3><ul>{report.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul></article>
        {report.delivery.notes.length > 0 && <article className="coach-panel"><h3>Delivery</h3>{report.delivery.notes.map((x, i) => <p key={i}>{x}</p>)}</article>}
      </div>
      <p className="coach-muted">{report.limitations.join(' ')}</p>
      <div className="coach-actions"><button className="coach-button primary" onClick={() => { setSession(null); setDraft(''); spoken.current.clear(); }}>New discussion</button></div>
    </section>}
  </div>;
}
