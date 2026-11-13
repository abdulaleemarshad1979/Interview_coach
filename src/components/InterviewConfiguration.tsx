import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { InterviewConfig, InterviewMode } from '../lib/interviewTypes';
import type { VoiceOptions } from '../lib/naturalVoice';

const modes: Array<[InterviewMode, string]> = [
  ['technical', 'Technical'], ['hr', 'HR'], ['behavioral', 'Behavioral'], ['resume', 'Resume based'],
  ['project', 'Project based'], ['system-design', 'System design'], ['coding', 'Coding'], ['mixed', 'Mixed mock interview'],
];
export default function InterviewConfiguration({ config, onChange, voice, onVoiceChange, busy, onStart }: {
  config: InterviewConfig; onChange: (value: InterviewConfig) => void;
  voice: VoiceOptions; onVoiceChange: (value: Partial<VoiceOptions>) => void; busy: boolean; onStart: () => void;
}) {
  const [banks, setBanks] = useState<Array<{ _id: string; company: string; role: string }>>([]);
  const [bankPage, setBankPage] = useState(0);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankError, setBankError] = useState('');
  useEffect(() => {
    let active = true;
    void apiFetch(`/api/campus/question-banks?limit=50&offset=${bankPage * 50}`).then(async response => {
      if (!response.ok) throw new Error('Company question banks are unavailable. You can still configure a custom interview.');
      return response.json();
    }).then(data => { if (active) { setBanks(data.items); setBankTotal(data.total); setBankError(''); } }).catch(e => { if (active) setBankError(e.message); });
    return () => { active = false; };
  }, [bankPage]);
  const change = (key: keyof InterviewConfig, value: string | number) => onChange({ ...config, [key]: value });
  return <form onSubmit={event => { event.preventDefault(); onStart(); }} className="coach-config" aria-busy={busy}>
    <section className="coach-panel"><p className="coach-eyebrow">Personalize your practice</p><h2>What are you preparing for?</h2><div className="coach-form-grid">
      <label>Company question bank<select value={config.questionBankId || ''} onChange={e => {
        const bank = banks.find(b => b._id === e.target.value);
        onChange({ ...config, questionBankId: bank?._id, ...(bank ? { companyName: bank.company, targetRole: bank.role } : {}) });
      }}><option value="">Custom interview</option>{banks.map(bank => <option key={bank._id} value={bank._id}>{bank.company} · {bank.role}</option>)}</select></label>
      <label>Interview mode<select value={config.mode} onChange={event => change('mode', event.target.value)}>{modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Target role<input required maxLength={120} value={config.targetRole} onChange={event => change('targetRole', event.target.value)} placeholder="Software engineer" /></label>
      <label>Experience<select value={config.experienceLevel} onChange={event => change('experienceLevel', event.target.value)}><option value="student">Student / graduate</option><option value="junior">Junior</option><option value="mid">Mid level</option><option value="senior">Senior</option></select></label>
      <label>Technical domain<input required maxLength={160} value={config.technicalDomain} onChange={event => change('technicalDomain', event.target.value)} placeholder="Backend engineering, data science…" /></label>
      <label>Difficulty<select value={config.difficulty} onChange={event => change('difficulty', event.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <label>Duration (minutes)<input type="number" min={5} max={60} required value={config.durationMinutes} onChange={event => change('durationMinutes', Number(event.target.value))} /></label>
      <label>Company (optional)<input maxLength={120} value={config.companyName || ''} onChange={event => change('companyName', event.target.value)} /></label>
      <label>Voice<select value={voice.voice} onChange={event => onVoiceChange({ voice: event.target.value as VoiceOptions['voice'] })}><option value="hannah">Hannah</option><option value="autumn">Autumn</option><option value="diana">Diana</option></select></label>
      <label>Voice provider<select value={voice.provider || 'groq'} onChange={event => onVoiceChange({ provider: event.target.value as VoiceOptions['provider'] })}><option value="groq">Groq Orpheus</option><option value="browser">Browser speech (device dependent)</option></select></label>
      <label>Speaking rate<select value={voice.rate} onChange={event => onVoiceChange({ rate: Number(event.target.value) })}><option value={0.9}>Slower · 0.9×</option><option value={1}>Natural · 1×</option><option value={1.1}>Faster · 1.1×</option></select></label>
    </div>{bankError && <p role="status" className="coach-muted">{bankError}</p>}{bankTotal > 50 && <div className="coach-actions"><button type="button" className="coach-button" disabled={bankPage === 0} onClick={() => { setBankPage(p => p - 1); onChange({ ...config, questionBankId: undefined }); }}>Previous companies</button><button type="button" className="coach-button" disabled={(bankPage + 1) * 50 >= bankTotal} onClick={() => { setBankPage(p => p + 1); onChange({ ...config, questionBankId: undefined }); }}>More companies</button></div>}
    <label>Resume context (optional)<textarea rows={5} maxLength={12000} value={config.resumeText || ''} onChange={event => change('resumeText', event.target.value)} placeholder="Paste relevant experience and projects, or use the resume you already analyzed." /></label>
      <label>GitHub project context (optional)<textarea rows={3} maxLength={8000} value={config.githubContext || ''} onChange={event => change('githubContext', event.target.value)} placeholder="Your analyzed repositories and technologies appear here." /></label>
      <label>Job description (optional)<textarea rows={3} maxLength={6000} value={config.jobDescription || ''} onChange={event => change('jobDescription', event.target.value)} /></label>
    </section><aside className="coach-panel"><p className="coach-eyebrow">How the session works</p><h2>A conversation with context</h2><ol className="coach-steps"><li>The interviewer asks one question at a time.</li><li>Record your answer or type it. Review the transcript before sending.</li><li>Follow-up questions draw on what you actually said.</li><li>Your report links observations to transcript excerpts.</li></ol>
      <p className="coach-muted">Microphone access starts when you select Record answer. Submitted audio is sent to the configured speech provider for transcription; raw audio is not saved by this app. Your transcript and report are saved until you delete the session. If you enable report sharing below, your assigned proctors and super admin can review this report.</p>
      <label className="coach-inline-label"><input type="checkbox" checked={config.shareWithFaculty === true} onChange={event => onChange({ ...config, shareWithFaculty: event.target.checked })} />Share this session’s assessment report with my assigned proctors and super admin.</label>
      <p className="coach-muted">Coding mode supports written code and reasoning. It does not execute or grade code in a sandbox.</p>
      <button className="coach-button primary" type="submit" disabled={busy}>{busy ? 'Preparing interview…' : 'Start interview'}</button>
    </aside>
  </form>;
}
