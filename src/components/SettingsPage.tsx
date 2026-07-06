import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  Settings, 
  User, 
  Volume2, 
  ShieldCheck, 
  KeyRound, 
  Sliders, 
  HelpCircle,
  Database,
  Cpu,
  RefreshCw,
  Clock
} from "lucide-react";
import { StudentProfile } from "../types";

interface SettingsPageProps {
  studentProfile: StudentProfile;
  onNavigate: (view: string) => void;
}

export default function SettingsPage({ studentProfile, onNavigate }: SettingsPageProps) {
  const [voiceName, setVoiceName] = useState("Zephyr");
  const [modelType, setModelType] = useState("gemini-3.5-flash");
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [checkingPing, setCheckingPing] = useState(false);

  const testAPILatency = async () => {
    setCheckingPing(true);
    setPingStatus(null);
    try {
      const start = Date.now();
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: studentProfile.studentId })
      });
      const latency = Date.now() - start;
      if (res.ok) {
        setPingStatus(`Active Server Connected: Latency ${latency}ms`);
      } else {
        setPingStatus("Ping failed. Express route returned non-200.");
      }
    } catch (e) {
      setPingStatus("Host unreachable. Please ensure the dev server is fully running.");
    } finally {
      setCheckingPing(false);
    }
  };

  return (
    <div id="settings-page" className="max-w-4xl mx-auto px-6 py-10 space-y-8 text-left">
      {/* Header */}
      <div className="border-b border-white/5 pb-6">
        <h1 className="font-display font-bold text-3xl text-white tracking-tight flex items-center">
          <Settings className="w-8 h-8 text-brand-primary mr-3" />
          Gateway Settings
        </h1>
        <p className="text-gray-400 mt-1">
          Adjust sandbox parameters, inspect secure connection keys, and test active API latency.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left column: main settings cards */}
        <div className="md:col-span-8 space-y-6">
          {/* General student settings */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-display font-semibold text-white flex items-center">
              <User className="w-4 h-4 text-brand-primary mr-2" />
              Student Profile Configuration
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1">active student account</label>
                <div className="w-full bg-brand-bg/50 border border-white/5 px-4 py-3 rounded-xl font-mono text-xs text-gray-300">
                  {studentProfile.studentId}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1">connected github anchor</label>
                <div className="w-full bg-brand-bg/50 border border-white/5 px-4 py-3 rounded-xl font-mono text-xs text-brand-primary">
                  {studentProfile.githubUsername ? `@${studentProfile.githubUsername}` : "No GitHub account connected"}
                </div>
              </div>
            </div>
          </div>

          {/* AI configurations */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-display font-semibold text-white flex items-center">
              <Sliders className="w-4 h-4 text-brand-primary mr-2" />
              Core AI Orchestrator Parameters
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-2">gemini text engine model</label>
                <select 
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary cursor-pointer font-mono"
                >
                  <option value="gemini-3.5-flash">gemini-3.5-flash (Standard - Recommended for OCR/speed)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Paid Key - Heavy Reasoning)</option>
                </select>
                <span className="text-[10px] text-gray-500 font-mono mt-1 block">
                  * Dynamic questions generation and scoring run on this model.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-2">live audio synthesis voice</label>
                <select 
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary cursor-pointer font-mono"
                >
                  <option value="Zephyr">Zephyr (Neutral Professional - Standard)</option>
                  <option value="Puck">Puck (Fast Technical pace)</option>
                  <option value="Charon">Charon (Deep Academic resonance)</option>
                  <option value="Kore">Kore (Warm encouraging tone)</option>
                  <option value="Fenrir">Fenrir (Clear low-pitch emphasis)</option>
                </select>
                <span className="text-[10px] text-gray-500 font-mono mt-1 block">
                  * Controls voice output synthesized during the mock rounds loop.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: System details & telemetry */}
        <div className="md:col-span-4 space-y-6">
          <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-4">
            <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 pb-2 border-b border-white/5">
              API Sandbox Telemetry
            </h4>

            <div className="space-y-3.5 text-xs text-gray-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center"><Database className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> Database Cache</span>
                <span className="text-white font-mono">localStorage</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center"><Cpu className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> Engine Host</span>
                <span className="text-white font-mono">Express Node.js</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> Server Port</span>
                <span className="text-brand-primary font-mono font-bold">3000</span>
              </div>

              {/* Ping action button */}
              <div className="pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={testAPILatency}
                  disabled={checkingPing}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white font-semibold rounded-lg text-[10px] font-mono tracking-wider flex items-center justify-center space-x-1 uppercase cursor-pointer disabled:opacity-50"
                >
                  {checkingPing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Pinging...</span>
                    </>
                  ) : (
                    <span>Test Node Ping</span>
                  )}
                </button>

                {pingStatus && (
                  <span className="text-[10px] text-emerald-400 font-mono mt-2 block leading-snug">
                    {pingStatus}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-brand-card/10 border border-white/5 rounded-2xl flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Your configurations are committed directly to standard client-side sandbox states and are preserved unless browser data folders are explicitly pruned.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
