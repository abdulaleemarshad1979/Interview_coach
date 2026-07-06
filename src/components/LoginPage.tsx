import React, { useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, ArrowRight, UserPlus, Fingerprint, Loader2 } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (studentId: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) {
      setError("Please enter your Student ID.");
      return;
    }
    if (studentId.trim().length < 4) {
      setError("Student ID must be at least 4 characters long.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onLoginSuccess(data.studentId);
      } else {
        setError(data.error || "Authentication failed. Try again.");
      }
    } catch (err: any) {
      setError("Unable to connect to the server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-page" className="relative min-h-[calc(100vh-140px)] flex items-center justify-center px-6 py-12">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-brand-primary/5 blur-[80px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-brand-card/75 border border-white/5 p-8 rounded-2xl shadow-2xl glass-panel relative"
      >
        {/* Card Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4 border border-brand-primary/20">
            <Fingerprint className="w-6 h-6 text-brand-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold text-white tracking-tight">Student Login</h2>
          <p className="text-xs text-gray-400 font-mono mt-1.5 uppercase">University Mock Interview Gateway</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="student-id-input" className="block text-xs font-mono tracking-wider text-gray-400 uppercase mb-2">
              Student ID
            </label>
            <div className="relative">
              <input
                id="student-id-input"
                type="text"
                placeholder="e.g., STU-2026-8941"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setError(null);
                }}
                disabled={loading}
                className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-hidden focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all font-mono text-sm uppercase"
              />
            </div>
            <p className="text-[10px] text-gray-500 font-mono mt-2 leading-relaxed">
              * Enter any valid ID with at least 4 characters to construct your custom dashboard.
            </p>
          </div>

          {/* Feedback Messages */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-950/25 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center"
            >
              <span>{error}</span>
            </motion.div>
          )}

          {/* Action trigger */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl flex items-center justify-center space-x-2 neon-glow-btn hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:hover:shadow-none"
            id="btn-login-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Validating Session...</span>
              </>
            ) : (
              <>
                <span>Enter Portal</span>
                <ArrowRight className="w-4 h-4 text-brand-bg" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center flex items-center justify-center space-x-2 text-xs text-gray-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Active Session SSL Sandbox</span>
        </div>
      </motion.div>
    </div>
  );
}
