import React from 'react';
import type { InterviewReport, InterviewTurn } from '../lib/interviewTypes';

const titles: Record<string, string> = {
  technicalAccuracy: 'Technical accuracy', reasoningQuality: 'Reasoning', communicationClarity: 'Communication clarity',
  relevance: 'Relevance', completeness: 'Completeness', problemSolving: 'Problem solving', supportedConfidence: 'Supported confidence',
};
export default function EvidenceReport({ report, turns = [] }: { report: InterviewReport; turns?: InterviewTurn[] }) {
  return <section className="coach-report" aria-labelledby="report-heading">
    <div className="coach-heading"><div><p className="coach-eyebrow">Interview report</p><h1 id="report-heading">Feedback you can act on</h1></div>
      <div className="coach-score"><strong>{report.overallScore ?? '—'}</strong><span>{report.overallScore === null ? 'Insufficient evidence' : 'Overall / 100'}</span></div></div>
    <p>{report.summary}</p>
    <p className="coach-muted">Scores describe this transcript against the stated criteria. They do not assess personality, honesty, or psychological traits.</p>
    <div className="coach-report-grid">{Object.entries(report.dimensions).map(([key, value]) => <article className="coach-panel" key={key}>
      <div className="coach-heading"><h2>{titles[key] || key}</h2><strong>{value.score === null ? 'Not assessed' : `${value.score}/100`}</strong></div>
      <p>{value.feedback}</p>{value.evidence.map((e, index) => <blockquote key={`${e.turnId}-${index}`}><p>“{e.quote}”</p><small>{e.explanation}</small></blockquote>)}
    </article>)}</div>
    <div className="coach-report-grid">{[['Strengths', report.strengths], ['Areas to practice', report.improvements]].map(([title, entries]) => <article className="coach-panel" key={String(title)}>
      <h2>{String(title)}</h2>{(entries as typeof report.strengths).length ? <ul>{(entries as typeof report.strengths).map((entry, index) => <li key={index}>{entry.text}{entry.evidence.map((e, i) => <blockquote key={i}>“{e.quote}”</blockquote>)}</li>)}</ul> : <p>No supported observations for this category.</p>}
    </article>)}</div>
    <article className="coach-panel"><h2>Next practice session</h2><ul>{report.practiceExercises.map((exercise, index) => <li key={index}>{exercise}</li>)}</ul></article>
    {report.limitations.length > 0 && <article className="coach-notice"><h2>Evidence limits</h2><ul>{report.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></article>}
    {turns.length > 0 && <details className="coach-panel"><summary>Read the session transcript</summary>{turns.map(turn => <div className="coach-transcript-turn" key={turn.id}><strong>{turn.role === 'candidate' ? 'You' : 'Interviewer'}</strong><p>{turn.text}</p></div>)}</details>}
    <small className="coach-muted">Generated {new Date(report.createdAt).toLocaleString()} · {report.provider} / {report.model}</small>
  </section>;
}
