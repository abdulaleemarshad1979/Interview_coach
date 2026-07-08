import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  X, 
  ShieldCheck, 
  GraduationCap, 
  Award, 
  RefreshCw, 
  Clock, 
  Database, 
  Key, 
  Lock, 
  Check, 
  Info, 
  Activity, 
  User,
  ExternalLink,
  Loader2,
  FileCheck2
} from "lucide-react";
import { StudentProfile, Scorecard } from "../types";
import { fetchStudentFromAdityaDb } from "../lib/collegeDb";
import abdulProfileImg from "../../assets/abdul_profile.png";



interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentProfile: StudentProfile;
  onProfileUpdate: (updatedProfile: StudentProfile) => void;
  scorecard: Scorecard | null;
}

export default function ProfileModal({ 
  isOpen, 
  onClose, 
  studentProfile, 
  onProfileUpdate, 
  scorecard 
}: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"academics" | "coach" | "integration">("academics");
  const [isSyncing, setIsSyncing] = useState(false);

  // Dynamic fallbacks for Roll Number 24P31A1234 to show correct avatar and official name
  const displayProfileImage = studentProfile.profileImage || (studentProfile.studentId === "24P31A1234" ? abdulProfileImg : undefined);
  const displayName = studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User");
  const displayClass = studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "III B.Tech CSE - Section A" : "Aditya College of Engineering & Technology");

  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [turnstilePassed, setTurnstilePassed] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handle Simulated Turnstile Verification
  const handleTurnstileClick = () => {
    if (turnstilePassed) return;
    setTurnstileLoading(true);
    setTimeout(() => {
      setTurnstileLoading(false);
      setTurnstilePassed(true);
    }, 1500);
  };

  // Handle Simulated Aditya University Sync
  const handleStartSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncPassword) {
      setSyncError("Please enter your AEC Portal password.");
      return;
    }
    if (!turnstilePassed) {
      setSyncError("Please complete the Cloudflare security validation check.");
      return;
    }

    setSyncError(null);
    setIsSyncing(true);
    setSyncProgress(5);
    setSyncStepText("Connecting to info.aec.edu.in gateway...");

    // Multi-stage fake sync process to look highly professional & premium
    const steps = [
      { progress: 20, text: "Bypassing Cloudflare protection layers..." },
      { progress: 45, text: "Authenticating with Student credentials..." },
      { progress: 65, text: "Session established. Extracting basic registration details..." },
      { progress: 85, text: "Extracting Semester GPA, Mid-term marks, and attendance matrices..." },
      { progress: 95, text: "Writing metadata back to secure profile nodes..." },
      { progress: 100, text: "Synchronization completed successfully!" }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setSyncProgress(step.progress);
        setSyncStepText(step.text);
        if (step.progress === 100) {
          setTimeout(() => {
            // Fetch mock student profile
            const syncedDetails = fetchStudentFromAdityaDb(studentProfile.studentId);
            onProfileUpdate({
              ...studentProfile,
              ...syncedDetails,
              isSynced: true
            });
            setIsSyncing(false);
            setSyncPassword("");
            setTurnstilePassed(false);
          }, 800);
        }
      }, (index + 1) * 800);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop overlay */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[85vh] md:h-[620px] z-10 text-left"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-slate-800/50 border border-white/5 hover:bg-slate-800 transition-colors z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* LEFT COLUMN: Student Card (Static details or initial info) */}
        <div className="w-full md:w-1/3 bg-slate-950/50 border-r border-white/5 p-6 flex flex-col items-center justify-between relative overflow-y-auto">
          {/* Identity details */}
          <div className="w-full flex flex-col items-center space-y-4 pt-4">
            {/* Avatar frame */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary to-brand-accent rounded-full blur-md opacity-50 group-hover:opacity-85 transition-opacity duration-300" />
              <div className="relative w-28 h-28 rounded-full border-2 border-brand-primary/50 overflow-hidden bg-slate-800 flex items-center justify-center shadow-lg">
                {displayProfileImage ? (
                  <img 
                    src={displayProfileImage} 
                    alt={displayName} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-slate-500" />
                )}
              </div>
            </div>

            {/* Student Info */}
            <div className="text-center space-y-1">
              <h3 className="text-lg font-display font-bold text-white tracking-tight">
                {displayName}
              </h3>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-[10px] font-mono text-brand-primary">
                ID: {studentProfile.studentId}
              </div>
              <p className="text-xs text-gray-400 font-mono mt-1.5">
                {displayClass}
              </p>
              {studentProfile.department && (
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                  {studentProfile.department}
                </p>
              )}
            </div>
          </div>

          {/* Sync status and info footer */}
          <div className="w-full mt-6 space-y-3">
            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-gray-500 uppercase">College DB Sync</span>
                {studentProfile.isSynced ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono text-emerald-400 font-semibold">
                    <Check className="w-2.5 h-2.5 mr-1" /> SYNCED
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-mono text-amber-400 font-semibold animate-pulse">
                    OFFLINE
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 font-mono">
                {studentProfile.isSynced 
                  ? "Connected to Aditya Student Info Systems via Campus Connect." 
                  : "Using a local cached profile. Sync your credentials to load GPA and Section details."
                }
              </div>
            </div>
            
            <div className="text-[9px] text-gray-500 text-center font-mono">
              Aditya University Portal Integration v1.2
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Performance & Configuration Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-900/20">
          {/* Tab Navigation header */}
          <div className="flex border-b border-white/5 px-6 pt-4 bg-slate-950/20">
            <button
              onClick={() => setActiveTab("academics")}
              className={`pb-3.5 text-xs font-medium tracking-tight border-b-2 px-3 transition-all cursor-pointer ${
                activeTab === "academics"
                  ? "text-brand-primary border-brand-primary font-semibold"
                  : "text-gray-400 border-transparent hover:text-white"
              }`}
            >
              College Assessments
            </button>
            <button
              onClick={() => setActiveTab("coach")}
              className={`pb-3.5 text-xs font-medium tracking-tight border-b-2 px-3 transition-all cursor-pointer ${
                activeTab === "coach"
                  ? "text-brand-primary border-brand-primary font-semibold"
                  : "text-gray-400 border-transparent hover:text-white"
              }`}
            >
              Interview Performance
            </button>
            <button
              onClick={() => setActiveTab("integration")}
              className={`pb-3.5 text-xs font-medium tracking-tight border-b-2 px-3 transition-all cursor-pointer ${
                activeTab === "integration"
                  ? "text-brand-primary border-brand-primary font-semibold"
                  : "text-gray-400 border-transparent hover:text-white"
              }`}
            >
              Aditya DB Integration
            </button>
          </div>

          {/* Tab Contents Frame */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            {/* TAB 1: COLLEGE ACADEMICS */}
            {activeTab === "academics" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-display font-semibold text-white">Aditya Academic Track Record</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Verified percentages and semester averages imported from college database logs.</p>
                </div>

                {studentProfile.isSynced && studentProfile.collegeAssessments ? (
                  <div className="space-y-4">
                    {/* General stats cards row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                          <Activity className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-gray-500 uppercase">Average Attendance</div>
                          <div className="text-lg font-bold text-white font-mono mt-0.5">{studentProfile.attendance}%</div>
                        </div>
                      </div>
                      <div className="bg-slate-950/30 border border-white/5 rounded-2xl p-4 flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-gray-500 uppercase">Academic Year</div>
                          <div className="text-xs font-bold text-white font-mono mt-1 truncate max-w-[150px]">
                            {studentProfile.academicYear || "V Semester"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress bars list */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block">Detailed Assessment Breakdown</span>
                      {studentProfile.collegeAssessments.map((assess, idx) => (
                        <div key={idx} className="bg-slate-950/20 border border-white/5 p-3 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-gray-300 font-semibold">{assess.examName}</span>
                            <span className="text-brand-primary font-bold">{assess.marks}</span>
                          </div>
                          
                          {/* Progress bar line */}
                          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/5">
                            <div 
                              className="h-full bg-gradient-to-r from-brand-primary to-brand-accent rounded-full transition-all duration-500" 
                              style={{ width: `${assess.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-white/5 flex items-center justify-center text-slate-500">
                      <Clock className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="max-w-xs space-y-1">
                      <h5 className="text-sm font-semibold text-white">Academic Data Not Synced</h5>
                      <p className="text-xs text-gray-400">Please navigate to the "Aditya DB Integration" tab to connect this platform with the student portal.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("integration")}
                      className="px-4 py-2 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded-xl text-xs hover:bg-brand-primary hover:text-brand-bg transition-all font-semibold font-mono"
                    >
                      Connect Portal Now
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: INTERVIEW COACH PERFORMANCE */}
            {activeTab === "coach" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-display font-semibold text-white">Interview Readiness Diagnostic</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Results collected from active resume verification runs and live speech analysis.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: Scorecard grade */}
                  <div className="bg-slate-950/30 border border-white/5 p-4 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-gray-500 uppercase">General Grade</span>
                      <Award className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold text-white font-mono">
                        {scorecard ? `${scorecard.overallScore}/100` : "No Data"}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {scorecard 
                          ? `Ranked as ${scorecard.candidateLevel} in the technical interview matrix.`
                          : "Please launch a Live Interview round to generate your readiness grade."
                        }
                      </p>
                    </div>
                  </div>

                  {/* Card 2: GitHub compatibility */}
                  <div className="bg-slate-950/30 border border-white/5 p-4 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-gray-500 uppercase">Portfolio Alignment</span>
                      <FileCheck2 className="w-4 h-4 text-brand-accent" />
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold text-white font-mono">
                        {scorecard && scorecard.categoryScores?.resumeStrength 
                          ? `${scorecard.categoryScores.resumeStrength}%` 
                          : scorecard ? "70%" : "No Data"
                        }
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {scorecard
                          ? "Audit match score comparing claimed resume experiences against code commits."
                          : "Please trigger a resume + GitHub analysis under the 'Analyze Profile' section."
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Score breakdown bar charts */}
                {scorecard && (
                  <div className="space-y-3.5 bg-slate-950/20 border border-white/5 p-4 rounded-xl">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider block pb-2 border-b border-white/5">Coach Diagnostic Breakdown</span>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                          <span>Communication & Clarity</span>
                          <span className="text-white">{scorecard.categoryScores?.communicationClarity || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-brand-primary" style={{ width: `${scorecard.categoryScores?.communicationClarity || 0}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                          <span>Technical Depth</span>
                          <span className="text-white">{scorecard.categoryScores?.technicalDepth || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-brand-primary" style={{ width: `${scorecard.categoryScores?.technicalDepth || 0}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                          <span>Problem Solving</span>
                          <span className="text-white">{scorecard.categoryScores?.problemSolving || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-brand-primary" style={{ width: `${scorecard.categoryScores?.problemSolving || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ADITYA INTEGRATION PANEL & ARCHITECTURE GUIDE */}
            {activeTab === "integration" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-display font-semibold text-white">Campus Connect Integration Hub</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Control secure sessions between Interview Coach and Aditya student database.</p>
                </div>

                {/* Sub tabs: Simulated Sync form vs Technical Blueprint */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* LEFT MOCK FORM */}
                  <div className="md:col-span-6 bg-slate-950/30 border border-white/5 p-4 rounded-2xl space-y-4">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-brand-primary" />
                      <span className="text-xs font-bold text-white font-mono uppercase">Portal sync engine</span>
                    </div>

                    {isSyncing ? (
                      <div className="py-12 flex items-center justify-center w-full bg-[#f0f4f8] rounded-2xl border border-slate-200 min-h-[300px]">
                        <div className="bg-white border-2 border-[#82b4df] p-8 rounded-lg shadow-md text-center flex flex-col items-center justify-center max-w-[240px] w-full">
                          {/* Dotted rotating spinner matching the exact AEC portal loader */}
                          <svg className="w-10 h-10 animate-spin text-[#004f9f]" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="3 3" />
                            <circle className="opacity-75" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="8 20" />
                          </svg>
                          <p className="text-[11px] font-semibold text-slate-700 mt-4 font-sans">Please wait while processing....</p>
                          <div className="text-[8px] text-slate-400 font-mono mt-2 truncate w-full">{syncStepText}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#f0f4f8] rounded-2xl border border-slate-200 p-4 space-y-4">
                        {/* Logos banner */}
                        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                          <img 
                            src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg" 
                            alt="Aditya University Logo" 
                            className="h-6 object-contain"
                          />
                          <div className="h-4 w-[1px] bg-slate-300" />
                          <span className="text-[10px] font-bold text-slate-800 tracking-tight font-sans">CAMPUS CONNECT</span>
                        </div>

                        {/* White Login Card */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <h5 className="text-[#0f4c81] font-bold font-sans text-center text-sm mb-3">LOGIN</h5>
                          
                          {/* Radio selectors */}
                          <div className="flex justify-center space-x-4 mb-4 text-[10px] font-sans text-slate-600">
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input type="radio" disabled name="loginType" />
                              <span>Parent</span>
                            </label>
                            <label className="flex items-center space-x-1.5 cursor-pointer font-semibold text-[#0f4c81]">
                              <input type="radio" defaultChecked name="loginType" className="accent-[#0f4c81]" />
                              <span>Student</span>
                            </label>
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input type="radio" disabled name="loginType" />
                              <span>Employee</span>
                            </label>
                          </div>

                          <form onSubmit={handleStartSync} className="space-y-3">
                            {/* User field */}
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <User className="w-3.5 h-3.5" />
                              </div>
                              <input 
                                type="text" 
                                disabled 
                                value={studentProfile.studentId}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-slate-500 focus:outline-hidden"
                              />
                            </div>

                            {/* Password field */}
                            <div className="relative">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Lock className="w-3.5 h-3.5" />
                              </div>
                              <input 
                                type={showPassword ? "text" : "password"} 
                                value={syncPassword}
                                onChange={(e) => setSyncPassword(e.target.value)}
                                placeholder="Portal Password"
                                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-14 py-1.5 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-[#0f4c81] focus:ring-1 focus:ring-[#0f4c81]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#0f4c81] hover:underline font-mono"
                              >
                                {showPassword ? "HIDE" : "SHOW"}
                              </button>
                            </div>

                            {/* Cloudflare turnstile */}
                            <div className="border border-slate-200 bg-slate-50 rounded-lg p-2 flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={handleTurnstileClick}
                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                    turnstilePassed 
                                      ? "bg-emerald-100 border-emerald-500 text-emerald-600" 
                                      : turnstileLoading 
                                        ? "bg-slate-200 border-slate-300"
                                        : "bg-white border-slate-300 hover:border-[#0f4c81]"
                                  }`}
                                >
                                  {turnstilePassed && <Check className="w-3 h-3" />}
                                  {turnstileLoading && <Loader2 className="w-2.5 h-2.5 animate-spin text-[#0f4c81]" />}
                                </button>
                                <span className="text-[9px] text-slate-500 font-sans">
                                  {turnstilePassed ? "Success! Turnstile Verified" : "Verify identity with Turnstile"}
                                </span>
                              </div>
                              <img 
                                src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" 
                                alt="Cloudflare" 
                                className="h-3 opacity-40 grayscale"
                              />
                            </div>

                            {syncError && (
                              <div className="text-[9px] text-red-500 font-sans bg-red-50 border border-red-200 p-1.5 rounded-lg">
                                {syncError}
                              </div>
                            )}

                            {/* Submit button */}
                            <button
                              type="submit"
                              className="w-full py-2 bg-[#0f4c81] hover:bg-[#0d4270] transition-colors text-white font-bold rounded-lg text-xs font-sans tracking-wide cursor-pointer"
                            >
                              LOGIN
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT BLUEPRINT TECHNICAL EXPLANATION */}
                  <div className="md:col-span-6 bg-slate-950/20 border border-white/5 p-4 rounded-2xl space-y-4">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-brand-accent" />
                      <span className="text-xs font-bold text-white font-mono uppercase">Production DB Blueprint</span>
                    </div>

                    <div className="text-[11px] text-gray-400 space-y-3 font-sans leading-relaxed">
                      <p>
                        To link this dashboard with the live Aditya Student Portal, you must resolve three constraints:
                      </p>
                      
                      <ol className="list-decimal list-inside space-y-1.5 font-mono text-[10px] text-gray-300">
                        <li>
                          <strong className="text-white">API Integration (Best Option):</strong> 
                          Expose a REST endpoint on the college main servers (MS SQL/IIS) secured via API Key:
                          <span className="block bg-slate-900 border border-white/5 p-1 rounded mt-0.5 text-[9px] text-brand-primary overflow-x-auto truncate">
                            GET https://info.aec.edu.in/api/student/24P31A1234
                          </span>
                        </li>
                        <li>
                          <strong className="text-white">Headless Scraper (Fallback):</strong>
                          Deploy a microservice using Playwright/Puppeteer to log in, bypass Turnstile validation (e.g. using 2Captcha/CapSolver APIs), parse the ASP.NET VIEWSTATE tokens, and scrape the HTML marks page.
                        </li>
                        <li>
                          <strong className="text-white">Direct DB Views (Enterprise):</strong>
                          Request read-only SQL connection access to student profile tables/views on the Aditya internal intranet database.
                        </li>
                      </ol>

                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <span className="text-[9px] font-mono text-gray-500 uppercase block">Sample Puppeteer Sync Handler:</span>
                        <pre className="bg-slate-950 p-2.5 rounded-xl border border-white/5 text-[9px] font-mono text-gray-300 overflow-x-auto max-h-[140px] scrollbar-thin">
{`// Sample Server-side scraper
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fetchFromAditya(rollNo, password) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to login portal
  await page.goto('https://info.aec.edu.in/aus/default.aspx');
  
  // Fill credentials & trigger login
  await page.type('#txtUser', rollNo);
  await page.type('#txtPassword', password);
  
  // Cloudflare Turnstile bypass block
  await page.waitForSelector('iframe[src*="turnstile"]');
  // Trigger Turnstile solver API here
  
  await page.click('#btnLogin');
  await page.waitForNavigation();
  
  // Parse HTML profile fields
  const name = await page.$eval('#lblStudentName', el => el.innerText);
  const classSec = await page.$eval('#lblClass', el => el.innerText);
  
  await browser.close();
  return { name, classSec };
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
