import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AccountLogin({ onLoginSuccess, onBack }: { onLoginSuccess: (id: string, email?: string) => void; onBack: () => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = signup ? await supabase.auth.signUp({ email, password, options: { data: { student_name: name } } }) : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error(result.error.message);
      onLoginSuccess(result.data.user.user_metadata?.roll_number || email.split('@')[0].toUpperCase(), email);
    } catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  return <div className="coach-page coach-account"><p className="coach-eyebrow">Interview Coach account</p><h1>{signup ? 'Create your practice account' : 'Welcome back'}</h1><p>Use your app account to access interviews, meetings and saved reports.</p>
    <form className="coach-panel" onSubmit={submit} aria-busy={busy}>
      {error && <div className="coach-error" role="alert">{error}</div>}
      {signup && <label>Your name<input autoComplete="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>}
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : 1} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="coach-button primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
      <div className="coach-actions"><button className="coach-button" type="button" onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Use existing account' : 'Create an account'}</button><button className="coach-button" type="button" onClick={onBack}>College portal sign-in</button></div>
      <p className="coach-muted">Staff access is assigned by the administrator after registration.</p>
    </form>
  </div>;
}
