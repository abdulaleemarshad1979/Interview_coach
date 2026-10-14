import React, { useState } from "react";
import { AlertCircle, GraduationCap, Lock, User } from "lucide-react";
import Button from "./ui/Button";
import InputField from "./ui/InputField";
import { supabase } from "../lib/supabaseClient";

type CollegePortal = "aus" | "acet";

interface LoginPageProps {
  onLoginSuccess: (studentId: string, email?: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [rollNo, setRollNo] = useState("");
  const [password, setPassword] = useState("");
  const [classSection, setClassSection] = useState("");
  const [portal, setPortal] = useState<CollegePortal>("acet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);

  const updateRollNo = (value: string) => {
    setRollNo(value);
    setError(null);
    setVerificationRequired(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedRollNo = rollNo.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,24}$/.test(normalizedRollNo)) {
      setError("Enter a valid college roll number (4–24 letters or numbers).");
      return;
    }
    if (!password) {
      setError("Enter your ECAP password.");
      return;
    }

    setLoading(true);
    setError(null);
    setVerificationRequired(false);
    try {
      const result = await supabase.auth.signInWithCollegePortal({
        rollNo: normalizedRollNo,
        password,
        portal,
        classSection: classSection.trim() || undefined,
      });
      if (result.error) {
        setError(result.error.message);
        setVerificationRequired(result.error.code === "PORTAL_VERIFICATION_REQUIRED");
        return;
      }
      if (!result.data?.session || !result.data.user) {
        setError("The server did not return a complete login session. Please retry.");
        return;
      }
      setPassword("");
      onLoginSuccess(normalizedRollNo, result.data.user.email);
    } catch {
      setError("Unable to reach the sign-in server. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-slate-800 font-sans lg:flex">
      <section className="hidden lg:flex lg:w-[45%] bg-slate-50 border-r border-slate-200 p-16 flex-col justify-center">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[2px] text-brand-primary">Interview Coach</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-900 leading-tight">
            Your interview.<br /><span className="text-brand-accent">Perfected.</span>
          </h1>
          <p className="mt-6 text-base leading-relaxed text-slate-600">
            Practice interviews and review your progress using your college account.
          </p>
        </div>
      </section>

      <section className="flex-1 flex items-center justify-center px-6 py-12 lg:p-16">
        <div className="w-full max-w-[420px] rounded-[20px] border border-slate-200 bg-slate-50 p-8 lg:border-0 lg:bg-white lg:p-0">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">College portal</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Student sign in</h2>
            <p className="mt-2 text-sm text-slate-600">Use your official AUS or ACET ECAP credentials.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={loading}>
            <fieldset disabled={loading}>
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">Select college portal</legend>
              <div className="flex rounded-[10px] border border-slate-200 bg-white p-1">
                {(["aus", "acet"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={portal === option}
                    onClick={() => { setPortal(option); setError(null); setVerificationRequired(false); }}
                    className={`flex-1 rounded-[8px] py-2 text-sm font-semibold uppercase focus-visible:outline-2 focus-visible:outline-brand-primary ${portal === option ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <InputField label="Student roll number" type="text" placeholder="e.g. 24P31A1234" value={rollNo}
              onChange={updateRollNo} disabled={loading} autoComplete="username" maxLength={24} icon={User} required />
            <InputField label="ECAP password" type="password" placeholder="Your portal password" value={password}
              onChange={(value) => { setPassword(value); setError(null); }} disabled={loading} autoComplete="current-password" icon={Lock} required />
            <InputField label="Class section (optional)" type="text" placeholder="e.g. Section A" value={classSection}
              onChange={setClassSection} disabled={loading} maxLength={100} icon={GraduationCap} />

            {error && (
              <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>{error}</p>
                  {verificationRequired && (
                    <a href={`https://info.aec.edu.in/${portal}/default.aspx`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline">
                      Open the official {portal.toUpperCase()} portal
                    </a>
                  )}
                </div>
              </div>
            )}

            <Button type="submit" loading={loading} disabled={loading} className="h-12 w-full rounded-[10px] bg-brand-primary text-sm font-bold text-white">
              {loading ? "Verifying with college portal…" : "Sign in with college portal"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
