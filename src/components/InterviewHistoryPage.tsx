import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { readApiJson } from '../lib/interviewClient';
import type { InterviewSessionSummary } from '../lib/interviewTypes';

export default function InterviewHistoryPage({ onSelect, onNavigate }: { onSelect: (id: string) => void; onNavigate: (view: string) => void }) {
  const [sessions, setSessions] = useState<InterviewSessionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = async (before?: string) => {
    setBusy(true); setError('');
    try {
      const data = await readApiJson<{ sessions: InterviewSessionSummary[]; nextCursor: string | null }>(await apiFetch(`/api/interview/sessions?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`));
      setSessions(old => before ? [...old, ...data.sessions] : data.sessions); setCursor(data.nextCursor);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const remove = async (id: string) => {
    if (!window.confirm('Delete this interview, its transcript and report? This cannot be undone.')) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/interview/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) await readApiJson(response);
      setSessions(old => old.filter(item => item.id !== id));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="coach-page"><div className="coach-heading"><div><p className="coach-eyebrow">Your practice record</p><h1>Interview history</h1><p>Resume a session or revisit feedback grounded in your answers.</p></div><button className="coach-button primary" onClick={() => onNavigate('interview')}>New interview</button></div>
    {error && <div className="coach-error" role="alert">{error}<button onClick={() => void load()}>Retry</button></div>}
    {busy && sessions.length === 0 && <p role="status">Loading your sessions…</p>}
    {!busy && !error && sessions.length === 0 && <div className="coach-panel"><h2>Your first session starts here</h2><p>Create an interview to build your practice history. Completed sessions include transcript evidence and suggested exercises.</p></div>}
    <div className="coach-history">{sessions.map(session => <article className="coach-panel coach-heading" key={session.id}><div><h2>{session.targetRole}</h2><p>{session.mode.replace('-', ' ')} · {session.answerCount} answers · {new Date(session.createdAt).toLocaleDateString()}</p><span className="coach-status">{session.state.replaceAll('_', ' ')}</span></div><div className="coach-actions"><span>{session.overallScore === null ? 'Not scored' : `${session.overallScore}/100`}</span><button className="coach-button" onClick={() => onSelect(session.id)}>{session.state === 'COMPLETED' ? 'View report' : 'Resume'}</button><button className="coach-button danger" disabled={busy} onClick={() => void remove(session.id)}>Delete</button></div></article>)}</div>
    {cursor && <button className="coach-button" disabled={busy} onClick={() => void load(cursor)}>Load more</button>}
  </div>;
}
