import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import EvidenceReport from './EvidenceReport';
import DiscussionReport from './DiscussionReport';

interface Classroom { _id: string; portal: string; department: string; section: string; cohort: string; proctorIds: string[]; revision: number }
interface Teacher { id: string; name: string; email: string; is_faculty: boolean; is_admin: boolean; lastLoginAt: string | null }
interface Student { id: string; name: string; student_name: string; roll_number: string; class_id: string | null; attendance?: number; profile_image?: string }
const label = (c: Classroom) => `${c.portal.toUpperCase()} · ${c.department} ${c.section} · ${c.cohort}`;
async function read(path: string, init?: RequestInit) {
  const res = await apiFetch(`/api/campus${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed. Please retry.');
  return data;
}
export default function CampusDashboard({ admin, name, onNavigate }: { admin: boolean; name: string; onNavigate: (view: string) => void }) {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [classPage, setClassPage] = useState(0);
  const [classTotal, setClassTotal] = useState(0);
  const [staffPage, setStaffPage] = useState(0);
  const [staffTotal, setStaffTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [reports, setReports] = useState<any>(null);
  const [reportStudent, setReportStudent] = useState<Student | null>(null);
  const [reportPage, setReportPage] = useState(0);
  const [proctorIds, setProctorIds] = useState<string[]>([]);
  const selectedClass = classes.find(c => c._id === classId);
  const [classForm, setClassForm] = useState({ portal: 'aus', department: '', section: '', cohort: '' });
  const [faculty, setFaculty] = useState({ name: '', email: '', password: '' });
  const [bank, setBank] = useState({ company: '', role: '', questions: '' });
  const [banks, setBanks] = useState<any[]>([]);
  const [bankPage, setBankPage] = useState(0);
  const [bankTotal, setBankTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    void Promise.all([
      read(`/classes?limit=50&offset=${classPage * 50}`),
      read(`/students?limit=25&offset=${page * 25}${classId ? `&classId=${classId}` : ''}`),
      admin ? read(`/staff?limit=50&offset=${staffPage * 50}`) : Promise.resolve(null),
      admin ? read('/summary') : Promise.resolve(null),
      read(`/question-banks?limit=25&offset=${bankPage * 25}`),
    ]).then(([c, s, t, counts, q]) => {
      if (!alive) return;
      setClasses(c.items); setClassTotal(c.total); setStudents(s.items); setTotal(s.total);
      if (t) { setTeachers(t.items); setStaffTotal(t.total); }
      setSummary(counts); setBanks(q.items); setBankTotal(q.total);
    }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [admin, classId, page, classPage, staffPage, bankPage, refresh]);
  useEffect(() => { setProctorIds(selectedClass?.proctorIds || []); }, [selectedClass?._id, selectedClass?.revision]);
  useEffect(() => { setReports(null); setReportStudent(null); setReportPage(0); }, [classId]);
  async function mutate(path: string, method: string, body: unknown, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await read(path, { method, body: JSON.stringify(body) }); setMessage(success); setRefresh(v => v + 1); return true; }
    catch (e: any) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  async function viewReports(s: Student, nextPage = 0) {
    setBusy(true); setError(''); setReports(null); setReportStudent(s); setReportPage(nextPage);
    try { setReports(await read(`/students/${encodeURIComponent(s.id)}/reports?limit=20&offset=${nextPage * 20}`)); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const pages = (index: number, count: number, size: number, change: (v: number) => void) => <div className="coach-actions mt-3"><button className="coach-button" disabled={index === 0 || busy || loading} onClick={() => change(index - 1)}>Previous</button><span className="text-sm">{count ? `${index * size + 1}–${Math.min((index + 1) * size, count)} of ${count}` : 'No records'}</span><button className="coach-button" disabled={(index + 1) * size >= count || busy || loading} onClick={() => change(index + 1)}>Next</button></div>;
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="coach-eyebrow">{admin ? 'Super admin' : 'Faculty / proctor'}</p><h1 className="text-3xl font-semibold">{admin ? 'Classes & faculty' : 'My classes'}</h1><p className="mt-2 text-slate-600">Welcome, {name}. {admin ? 'Manage verified students and their class proctors.' : 'Review students assigned to you and their assessment evidence.'}</p></div><div className="coach-actions"><button className="coach-button" disabled={busy || loading} onClick={() => setRefresh(v => v + 1)}>Refresh</button><button className="coach-button primary" onClick={() => onNavigate('group-discussion')}>Host group discussion</button></div></header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
    {summary && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Verified students', summary.students], ['Staff accounts', summary.teachers], ['Classes', summary.classes], ['Classes with students', summary.enrolledClasses], ['Staff with valid sessions', summary.teachersWithValidSessions]].map(([title, value]) => <section key={title} className="coach-panel"><p className="text-sm text-slate-600">{title}</p><p className="mt-2 text-3xl font-semibold">{value}</p></section>)}</div>}
    {summary && <p className="text-xs text-slate-500">Valid sessions expire after seven days; this count does not mean staff are currently online.</p>}
    <section className="coach-panel space-y-4"><h2 className="text-xl font-semibold">Class roster</h2><label className="block">Class<select className="mt-2 w-full rounded-lg border p-3" value={classId} disabled={busy || loading} onChange={e => { setClassId(e.target.value); setPage(0); }}><option value="">{admin ? 'All verified students' : 'All assigned classes'}</option>{classes.map(c => <option key={c._id} value={c._id}>{label(c)}</option>)}</select></label>
      {classTotal > 50 && pages(classPage, classTotal, 50, n => { setClassPage(n); setClassId(''); setPage(0); })}
      {selectedClass && <p className="text-sm text-slate-600">Proctors assigned: {selectedClass.proctorIds.length}/2</p>}
      {admin && selectedClass && <fieldset disabled={busy || loading} className="rounded-xl border p-4"><legend className="px-2 font-medium">Assign up to two proctors</legend><div className="flex flex-wrap gap-4">{teachers.filter(t => t.is_faculty).map(t => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={proctorIds.includes(t.id)} disabled={!proctorIds.includes(t.id) && proctorIds.length >= 2} onChange={e => setProctorIds(prior => e.target.checked ? [...prior, t.id] : prior.filter(id => id !== t.id))} />{t.name}</label>)}</div><p className="my-3 text-xs text-slate-500">Assignments on other faculty pages remain selected. Selected: {proctorIds.length}/2.</p><button className="coach-button" onClick={() => void mutate(`/classes/${selectedClass._id}/proctors`, 'PUT', { proctorIds, revision: selectedClass.revision }, 'Class proctors saved.')}>Save proctors</button></fieldset>}
      {loading ? <p role="status">Loading roster…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Student</th><th className="p-3">Roll number</th><th className="p-3">Attendance</th><th className="p-3">Class</th><th className="p-3">Reports</th></tr></thead><tbody>{students.map(s => <tr key={s.id} className="border-b"><td className="p-3">{s.student_name || s.name}</td><td className="p-3 font-mono">{s.roll_number}</td><td className="p-3">{typeof s.attendance === 'number' ? `${s.attendance}%` : 'Not synced'}</td><td className="p-3">{admin ? <select aria-label={`Class for ${s.roll_number}`} className="max-w-64 rounded border p-2" disabled={busy} value={s.class_id || ''} onChange={e => void mutate(`/students/${encodeURIComponent(s.id)}/class`, 'PUT', { classId: e.target.value || null, expectedClassId: s.class_id || null }, 'Student class saved.')}><option value="">Unassigned</option>{s.class_id && !classes.some(c => c._id === s.class_id) && <option value={s.class_id}>Assigned class (another page)</option>}{classes.map(c => <option key={c._id} value={c._id}>{label(c)}</option>)}</select> : (classes.find(c => c._id === s.class_id) ? label(classes.find(c => c._id === s.class_id)!) : 'Assigned class')}</td><td className="p-3"><button className="coach-button" disabled={busy} onClick={() => void viewReports(s)}>View results</button></td></tr>)}</tbody></table>{!students.length && <p className="py-6 text-slate-600">{admin ? 'No verified students here yet. Students must sign in first, then be assigned to a class.' : 'No students in your assigned classes yet. Contact your super admin.'}</p>}</div>}
      {pages(page, total, 25, setPage)}
    </section>
    {reportStudent && <section className="coach-panel space-y-4"><div className="flex justify-between"><h2 className="text-xl font-semibold">Results · {reportStudent.roll_number}</h2><button className="coach-button" onClick={() => { setReportStudent(null); setReports(null); }}>Close</button></div><p className="text-sm text-slate-600">Only saved assessments are shown. Missing scores are not treated as zero.</p>{!reports ? <p>Loading results…</p> : <><h3 className="font-semibold">Interview reports</h3>{reports.interviews.length === 0 && <p>No completed interview reports on this page.</p>}{reports.interviews.map((r: any) => <details key={r._id} className="rounded-lg border p-4"><summary className="cursor-pointer">{r.payload.config.targetRole} · {r.payload.report.overallScore ?? 'Unscored'}/100</summary><EvidenceReport report={r.payload.report} /></details>)}<h3 className="font-semibold">Group discussion reports</h3>{reports.discussions.length === 0 && <p>No retained group discussion reports on this page.</p>}{reports.discussions.map((r: any) => <details key={r._id} className="rounded-lg border p-4"><summary className="cursor-pointer">Room {r.roomCode}</summary><DiscussionReport report={r.report} name={reportStudent.student_name || reportStudent.name} /></details>)}<div className="coach-actions"><button className="coach-button" disabled={busy || reportPage === 0} onClick={() => void viewReports(reportStudent, reportPage - 1)}>Previous reports</button><button className="coach-button" disabled={busy || (reports.interviews.length < 20 && reports.discussions.length < 20)} onClick={() => void viewReports(reportStudent, reportPage + 1)}>More reports</button></div></>}</section>}
    {admin && <div className="grid gap-6 lg:grid-cols-2">
      <form className="coach-panel space-y-4" onSubmit={async e => { e.preventDefault(); const ok = await mutate('/classes', 'POST', classForm, 'Class created. Assign its two proctors above.'); if (ok) setClassForm({ ...classForm, section: '' }); }}><h2 className="text-xl font-semibold">Create class</h2><div className="coach-form-grid"><label>Portal<select value={classForm.portal} onChange={e => setClassForm({ ...classForm, portal: e.target.value })}><option value="aus">AUS</option><option value="acet">ACET</option></select></label>{(['department', 'section', 'cohort'] as const).map(key => <label key={key}>{key === 'cohort' ? 'Academic years (2024-2028)' : key === 'department' ? 'Department (IT)' : 'Section (A)'}<input required maxLength={key === 'cohort' ? 9 : 100} value={classForm[key]} onChange={e => setClassForm({ ...classForm, [key]: e.target.value })} /></label>)}</div><button className="coach-button primary" disabled={busy}>Create class</button></form>
      <form className="coach-panel space-y-4" onSubmit={async e => { e.preventDefault(); const ok = await mutate('/staff', 'POST', faculty, 'Faculty account created. Share credentials through your approved channel.'); setFaculty(f => ({ ...f, password: '' })); if (ok) setFaculty({ name: '', email: '', password: '' }); }}><h2 className="text-xl font-semibold">Add faculty</h2><div className="coach-form-grid">{(['name', 'email', 'password'] as const).map(key => <label key={key}>{key === 'password' ? 'Initial password (12+ characters)' : key === 'email' ? 'Email' : 'Name'}<input required type={key === 'name' ? 'text' : key} autoComplete={key === 'password' ? 'new-password' : 'off'} minLength={key === 'password' ? 12 : undefined} maxLength={key === 'name' ? 120 : 254} value={faculty[key]} onChange={e => setFaculty({ ...faculty, [key]: e.target.value })} /></label>)}</div><button className="coach-button primary" disabled={busy}>Create faculty account</button></form>
      <section className="coach-panel space-y-4 lg:col-span-2"><h2 className="text-xl font-semibold">Faculty directory</h2>{teachers.map(t => <article key={t.id} className="flex flex-wrap justify-between gap-2 border-b py-3"><div><strong>{t.name}</strong><p className="text-sm text-slate-600">{t.email} · {t.is_admin ? 'Super admin' : t.is_faculty ? 'Faculty' : 'Inactive role'}</p><p className="text-sm">{classes.filter(c => c.proctorIds.includes(t.id)).map(label).join('; ') || 'No assignments on this class page'}</p></div><span className="text-xs text-slate-500">{t.lastLoginAt ? `Last login: ${new Date(t.lastLoginAt).toLocaleString()}` : 'No recorded login'}</span></article>)}{pages(staffPage, staffTotal, 50, setStaffPage)}</section>
      <form className="coach-panel space-y-4 lg:col-span-2" onSubmit={async e => { e.preventDefault(); const ok = await mutate('/question-banks', 'POST', { company: bank.company, role: bank.role, questions: bank.questions.split('\n').map(q => q.trim()).filter(Boolean) }, 'Company questions published for interview practice.'); if (ok) setBank({ company: '', role: '', questions: '' }); }}><h2 className="text-xl font-semibold">Add company questions</h2><div className="coach-form-grid"><label>Company<input required maxLength={120} value={bank.company} onChange={e => setBank({ ...bank, company: e.target.value })} /></label><label>Role<input required maxLength={160} value={bank.role} onChange={e => setBank({ ...bank, role: e.target.value })} /></label></div><label className="block">Questions, one per line (up to 50)<textarea className="mt-2 w-full rounded-lg border p-3" required rows={6} maxLength={50000} value={bank.questions} onChange={e => setBank({ ...bank, questions: e.target.value })} /></label><button className="coach-button primary" disabled={busy}>Save question bank</button></form>
    </div>}
    <section className="coach-panel space-y-3"><h2 className="text-xl font-semibold">Company question banks</h2>{banks.map(b => <details key={b._id} className="rounded-lg border p-3"><summary className="cursor-pointer">{b.company} · {b.role} · {b.questions.length} questions</summary><ol className="mt-3 list-decimal space-y-2 pl-6 text-sm">{b.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ol></details>)}{!banks.length && <p className="text-sm text-slate-600">No question banks yet.</p>}{pages(bankPage, bankTotal, 25, setBankPage)}</section>
  </main>;
}
