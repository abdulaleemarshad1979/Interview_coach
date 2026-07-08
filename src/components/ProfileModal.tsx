import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  X, 
  User, 
  Lock, 
  Check, 
  Loader2, 
  BookOpen, 
  Award, 
  Clock, 
  Database, 
  HelpCircle,
  FileCheck2,
  Menu,
  GraduationCap
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

type PortalView = "ACADAMIC REGISTER" | "ATTENDANCE" | "MARKS" | "PROFILE" | "COACH DIAGNOSTIC" | "DEV BLUEPRINT";

export default function ProfileModal({ 
  isOpen, 
  onClose, 
  studentProfile, 
  onProfileUpdate, 
  scorecard 
}: ProfileModalProps) {
  // Stale cache correction for Roll No 24P31A1234
  const displayProfileImage = studentProfile.profileImage || (studentProfile.studentId === "24P31A1234" ? abdulProfileImg : undefined);
  const displayName = studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User");
  const displayClass = studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "III B.Tech CSE - Section A" : "Aditya College of Engineering & Technology");

  const [activePortalView, setActivePortalView] = useState<PortalView>("PROFILE");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [turnstilePassed, setTurnstilePassed] = useState(false);
  const [turnstileLoading, setTurnstileLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Synchronize state immediately if user is already synced
  const isUserSynced = studentProfile.isSynced || (studentProfile.studentId === "24P31A1234" && studentProfile.name === "MOHAMMAD ABDUL ALEEM ARSHAD");

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

    const steps = [
      { progress: 20, text: "Bypassing Cloudflare protection layers..." },
      { progress: 45, text: "Authenticating with Student credentials..." },
      { progress: 65, text: "Session established. Extracting basic registration details..." },
      { progress: 85, text: "Extracting Semester GPA, Mid-term marks, and attendance matrices..." },
      { progress: 100, text: "Synchronization completed successfully!" }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setSyncProgress(step.progress);
        setSyncStepText(step.text);
        if (step.progress === 100) {
          setTimeout(() => {
            const syncedDetails = fetchStudentFromAdityaDb(studentProfile.studentId);
            onProfileUpdate({
              ...studentProfile,
              ...syncedDetails,
              name: "MOHAMMAD ABDUL ALEEM ARSHAD",
              profileImage: abdulProfileImg,
              isSynced: true
            });
            setIsSyncing(false);
            setSyncPassword("");
            setTurnstilePassed(false);
            setActivePortalView("PROFILE");
          }, 800);
        }
      }, (index + 1) * 800);
    });
  };

  // Revert / Logout portal simulation
  const handlePortalLogout = () => {
    onProfileUpdate({
      studentId: studentProfile.studentId,
      githubUsername: studentProfile.githubUsername,
      resumeFileName: studentProfile.resumeFileName,
      isSynced: false
    });
    setActivePortalView("PROFILE");
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
        className="relative w-full max-w-5xl bg-[#f2f6f9] border border-slate-300 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh] md:h-[680px] z-10 text-left text-slate-800 font-sans"
      >
        {/* Close Button overlay */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors z-30"
          title="Close Portal View"
        >
          <X className="w-4 h-4" />
        </button>

        {/* -------------------- VIEW A: PORTAL LOGIN VIEW -------------------- */}
        {!isUserSynced && !isSyncing && (
          <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 bg-linear-to-b from-[#e1f0fc] to-[#f2f6f9] relative overflow-y-auto">
            {/* Wavy bottom border accent matching the real website design */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-[url('https://info.aec.edu.in/aus/images/wave.png')] bg-repeat-x bg-bottom opacity-20 pointer-events-none" />

            {/* Left side: branding message */}
            <div className="w-full md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left space-y-6 px-6 z-10">
              <div className="flex items-center space-x-3 bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs">
                <img 
                  src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg" 
                  alt="Aditya University Logo" 
                  className="h-10 object-contain"
                />
                <div className="h-7 w-[1px] bg-slate-200" />
                <span className="text-xs font-bold text-slate-700 font-mono tracking-tight uppercase">CAMPUS CONNECT</span>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-[#0f4c81] tracking-tight leading-tight">
                  Aditya College of Engineering & Technology
                </h2>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest font-mono">
                  Autonomous Institution | Student Portal Gateway
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed max-w-sm">
                Authenticate using your Aditya student credentials to automatically synchronize registration details, semester attendance charts, and midterm examination scores directly with the Coach database.
              </p>
            </div>

            {/* Right side: Login Panel card */}
            <div className="w-full md:w-[360px] bg-white border border-[#b8d4ed] rounded-xl shadow-md overflow-hidden p-6 z-10 space-y-5">
              <div className="text-center space-y-1">
                <h4 className="text-base font-extrabold text-[#0f4c81] tracking-wide font-sans">LOGIN</h4>
                <div className="h-0.5 w-8 bg-[#0f4c81] mx-auto rounded-full" />
              </div>

              {/* Radio Group tabs */}
              <div className="flex justify-center space-x-4 text-[11px] font-sans text-slate-500 pb-2 border-b border-slate-100">
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input type="radio" disabled name="portalTab" />
                  <span>Parent</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-[#0f4c81]">
                  <input type="radio" defaultChecked name="portalTab" className="accent-[#0f4c81]" />
                  <span>Student</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input type="radio" disabled name="portalTab" />
                  <span>Employee</span>
                </label>
              </div>

              <form onSubmit={handleStartSync} className="space-y-4">
                {/* Roll Number input */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    disabled 
                    value={studentProfile.studentId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2 text-xs font-mono text-slate-500 focus:outline-hidden"
                  />
                </div>

                {/* Password input */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={syncPassword}
                    onChange={(e) => setSyncPassword(e.target.value)}
                    placeholder="Portal Password"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-16 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#0f4c81] focus:ring-1 focus:ring-[#0f4c81]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#0f4c81] hover:underline font-mono"
                  >
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>

                {/* Cloudflare turnstile block */}
                <div className="border border-slate-200 bg-slate-50 rounded-lg p-2.5 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleTurnstileClick}
                      className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all ${
                        turnstilePassed 
                          ? "bg-emerald-100 border-emerald-500 text-emerald-600" 
                          : turnstileLoading 
                            ? "bg-slate-200 border-slate-300"
                            : "bg-white border-slate-300 hover:border-[#0f4c81]"
                      }`}
                    >
                      {turnstilePassed && <Check className="w-3.5 h-3.5" />}
                      {turnstileLoading && <Loader2 className="w-3 h-3 animate-spin text-[#0f4c81]" />}
                    </button>
                    <span className="text-[10px] text-slate-500 font-sans">
                      {turnstilePassed ? "Success! Identity Verified" : "Verify student identity checkbox"}
                    </span>
                  </div>
                  <img 
                    src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" 
                    alt="Cloudflare" 
                    className="h-3.5 opacity-40 grayscale"
                  />
                </div>

                {syncError && (
                  <div className="text-[10px] text-red-500 bg-red-50 border border-red-200 p-2 rounded-lg leading-relaxed font-sans">
                    {syncError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#0f4c81] hover:bg-[#0d4270] transition-colors text-white font-bold rounded-lg text-xs font-sans tracking-wide shadow-xs cursor-pointer text-center uppercase"
                >
                  LOGIN
                </button>
              </form>
            </div>
          </div>
        )}

        {/* -------------------- VIEW B: SYNC LOADING SCREEN -------------------- */}
        {isSyncing && (
          <div className="flex-1 flex items-center justify-center p-6 bg-[#f2f6f9]">
            <div className="bg-white border-2 border-[#82b4df] p-8 rounded-lg shadow-md text-center flex flex-col items-center justify-center max-w-[280px] w-full">
              {/* Rotating portal-style loader */}
              <svg className="w-12 h-12 animate-spin text-[#004f9f]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="3 3" />
                <circle className="opacity-75" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="8 20" />
              </svg>
              <p className="text-xs font-bold text-slate-700 mt-4 font-sans">Please wait while processing....</p>
              <div className="text-[9px] text-slate-400 font-mono mt-2 truncate w-full">{syncStepText}</div>
            </div>
          </div>
        )}

        {/* -------------------- VIEW C: AUTHENTICATED PORTAL MASTER VIEW -------------------- */}
        {isUserSynced && !isSyncing && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* 1. ADITYA BRANDING HEADER */}
            <div className="bg-white px-6 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-4">
                {/* Custom circular emblem */}
                <div className="w-14 h-14 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-10 h-10 text-[#0f4c81]" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
                    <path d="M50 25 L50 75 M25 50 L75 50" stroke="currentColor" strokeWidth="1" />
                    <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <text x="50" y="52" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">ADITYA</text>
                  </svg>
                </div>
                
                <div>
                  <h1 className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight leading-none uppercase">
                    Aditya College of Engineering & Technology
                  </h1>
                  <p className="text-[10px] font-bold text-[#0f4c81] tracking-wide mt-0.5">An AUTONOMOUS Institution</p>
                  <p className="text-[8px] text-slate-400 mt-0.5 leading-none">
                    Approved by AICTE, Permanently Affiliated to JNTUK, Accredited by NBA & NAAC | ADB Road, Surampalem
                  </p>
                </div>
              </div>

              {/* Top-Right Student Image */}
              <div className="hidden sm:block">
                <div className="w-11 h-13 border border-slate-300 rounded bg-slate-50 overflow-hidden shadow-xs">
                  {displayProfileImage ? (
                    <img 
                      src={displayProfileImage} 
                      alt="Student ID Portrait" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. WELCOME RIBBON BAR */}
            <div className="bg-[#9ccdfd] px-6 py-1.5 flex items-center justify-between text-[11px] font-sans text-slate-800 border-b border-[#7dbcf7] shrink-0">
              <span className="font-semibold">Hi...{displayName}</span>
              <div className="flex items-center space-x-4">
                <button className="text-[#0f4c81] hover:underline font-semibold cursor-pointer">Change Password</button>
                <div className="h-3 w-[1px] bg-slate-500/30" />
                <button 
                  onClick={handlePortalLogout}
                  className="text-red-700 hover:underline font-semibold cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* 3. PORTAL CORE CONTENT FRAME */}
            <div className="flex-1 flex overflow-hidden">
              
              {/* LEFT NAVIGATION SIDEBAR */}
              <div className="w-[180px] bg-[#3b85d9] border-r border-[#2f6cb5] flex flex-col shrink-0 overflow-y-auto">
                <div className="bg-[#2f6cb5] px-4 py-2 border-b border-[#24538a] text-[10px] font-extrabold text-white tracking-widest font-mono">
                  MENU
                </div>
                <nav className="flex-1 flex flex-col text-[10.5px] font-sans font-medium text-white">
                  {[
                    { id: "PROFILE", label: "PROFILE" },
                    { id: "ACADAMIC REGISTER", label: "ACADAMIC REGISTER" },
                    { id: "ATTENDANCE", label: "ATTENDANCE" },
                    { id: "MARKS", label: "MARKS" },
                    { id: "COACH DIAGNOSTIC", label: "COACH DIAGNOSTIC" },
                    { id: "DEV BLUEPRINT", label: "DEV BLUEPRINT" }
                  ].map((item) => {
                    const isActive = activePortalView === item.id;
                    const isSpecial = item.id === "COACH DIAGNOSTIC" || item.id === "DEV BLUEPRINT";
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActivePortalView(item.id as PortalView)}
                        className={`text-left px-4 py-2.5 border-b border-[#2f6cb5]/50 transition-colors cursor-pointer w-full uppercase ${
                          isActive 
                            ? "bg-[#255ba1] font-bold text-white border-l-4 border-l-[#fff]" 
                            : isSpecial 
                              ? "bg-slate-900/15 hover:bg-slate-900/25 text-amber-200"
                              : "hover:bg-[#2e74c9]"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                  
                  {/* Real portal buttons styled as disabled mocks for realism */}
                  {[
                    "BACKLOGS",
                    "BOOK SEARCH",
                    "EXAM FEE",
                    "FEE DETAILS",
                    "LIBRARY BOOKS",
                    "LMS",
                    "ONLINE PAYMENT",
                    "RECEIPTS",
                    "STUDY CERTIFICATE"
                  ].map((lbl) => (
                    <div 
                      key={lbl} 
                      className="px-4 py-2.5 border-b border-[#2f6cb5]/30 text-white/45 bg-[#3b85d9]/40 select-none cursor-not-allowed text-[10px]"
                    >
                      {lbl}
                    </div>
                  ))}
                </nav>
              </div>

              {/* RIGHT MAIN WORKSPACE GRID */}
              <div className="flex-1 bg-white p-6 overflow-y-auto">
                <div className="max-w-3xl mx-auto h-full">
                  
                  {/* WORKSPACE VIEW 1: PROFILE DETAILS */}
                  {activePortalView === "PROFILE" && (
                    <div className="space-y-4">
                      {/* Section Title */}
                      <div className="border-b-2 border-[#82b4df] pb-1">
                        <h2 className="text-[#0f4c81] font-bold text-sm font-sans uppercase">STUDENT PROFILE</h2>
                      </div>

                      {/* Collapsible Bio-data label */}
                      <div className="text-[11px] font-sans font-bold text-[#e06616] mt-2 flex items-center space-x-1">
                        <span>▼ BIO-DATA</span>
                      </div>

                      {/* Personal Details Table wrapper */}
                      <div className="border border-slate-300 rounded-xs overflow-hidden">
                        {/* Table Header Bar */}
                        <div className="bg-[#e6e6e6] text-[#333] text-[10.5px] font-bold px-3 py-1 font-sans border-b border-slate-300">
                          Personal Details
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse border border-slate-300 text-[10px] font-sans text-slate-700">
                            <tbody>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500 w-1/4">Admission.No</td>
                                <td className="p-1 border border-slate-300 w-1/3 text-slate-800 font-mono font-medium">{studentProfile.admissionNo || "90360050219"}</td>
                                <td className="p-1 border border-slate-300 text-center w-1/3" colSpan={2} rowSpan={4}>
                                  <div className="w-[85px] h-[105px] mx-auto border border-slate-300 bg-white overflow-hidden shadow-2xs">
                                    {displayProfileImage ? (
                                      <img src={displayProfileImage} alt="Portrait" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-50">
                                        <User className="w-8 h-8" />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">RollNo</td>
                                <td className="p-1 border border-slate-300 font-bold text-[#0f4c81] font-mono">{studentProfile.studentId}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Name</td>
                                <td className="p-1 border border-slate-300 font-bold uppercase text-slate-800">{displayName}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Course</td>
                                <td className="p-1 border border-slate-300 font-medium">{studentProfile.course || "B.Tech"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500 w-1/4">Branch</td>
                                <td className="p-1 border border-slate-300 w-1/3 font-medium">{studentProfile.department || "Information Technology"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500 w-1/6">Semester</td>
                                <td className="p-1 border border-slate-300 text-blue-700 font-bold w-1/4 font-mono">{displayClass}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Gender</td>
                                <td className="p-1 border border-slate-300">{studentProfile.gender || "Male"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">DOB</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.dob || "31/10/2006"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Nationality</td>
                                <td className="p-1 border border-slate-300">{studentProfile.nationality || "Indian"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Religion</td>
                                <td className="p-1 border border-slate-300">{studentProfile.religion || "Hindu"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">SSC Marks, %</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.sscMarks || "421.00, 70.17"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Inter Marks, %</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.interMarks || "711.00, 71.10"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">SSC Gradepoints</td>
                                <td className="p-1 border border-slate-300">-</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Inter Gradepoints</td>
                                <td className="p-1 border border-slate-300">-</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Entrance Type</td>
                                <td className="p-1 border border-slate-300 font-medium">{studentProfile.entranceType || "EAMCET"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">EAMCET/ECET Rank</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.entranceRank || "93077"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Seat Type</td>
                                <td className="p-1 border border-slate-300">{studentProfile.seatType || "CONVENOR"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Caste</td>
                                <td className="p-1 border border-slate-300">{studentProfile.caste || "BC-E"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Last Studied</td>
                                <td className="p-1 border border-slate-300 uppercase">{studentProfile.lastStudied || "NARAYANA JR. COLLEGE"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Joining Date</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.joiningDate || "20/07/2024"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Phone.No</td>
                                <td className="p-1 border border-slate-300">-</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Mobile.No</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.mobileNo || "7013297559"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Email</td>
                                <td className="p-1 border border-slate-300 font-mono text-blue-700">{studentProfile.email || "abdulaleemarshadm@gmail.com"}</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Adhar.No</td>
                                <td className="p-1 border border-slate-300 font-mono">{studentProfile.adharNo || "428068976468"}</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Bank A/C.No</td>
                                <td className="p-1 border border-slate-300">-</td>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Ration Card No</td>
                                <td className="p-1 border border-slate-300">-</td>
                              </tr>
                              <tr>
                                <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Transport Halt</td>
                                <td className="p-1 border border-slate-300" colSpan={3}>{studentProfile.transportHalt || "R C PURAM (Route: )"}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Disciplinary action sub-block */}
                      <div className="border border-slate-300 rounded-xs overflow-hidden">
                        <div className="bg-[#e6e6e6] text-[#333] text-[10.5px] font-bold px-3 py-1 font-sans border-b border-slate-300 uppercase">
                          Disciplinary Action
                        </div>
                        <div className="p-2.5 text-[10px] text-slate-600 font-mono">
                          No complaints !
                        </div>
                      </div>

                      {/* Guardian details sub-table */}
                      <div className="border border-slate-300 rounded-xs overflow-hidden">
                        <div className="bg-[#e6e6e6] text-[#333] text-[10.5px] font-bold px-3 py-1 font-sans border-b border-slate-300 uppercase">
                          Gurdian Details
                        </div>
                        <table className="w-full border-collapse border border-slate-300 text-[10px] font-sans text-slate-700">
                          <tbody>
                            <tr>
                              <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500 w-1/4">Name</td>
                              <td className="p-1 border border-slate-300 w-1/3">-</td>
                              <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500 w-1/6">Address</td>
                              <td className="p-1 border border-slate-300 w-1/4">-</td>
                            </tr>
                            <tr>
                              <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Phone</td>
                              <td className="p-1 border border-slate-300">-</td>
                              <td className="p-1 border border-slate-300 bg-slate-50 font-bold text-slate-500">Mobile</td>
                              <td className="p-1 border border-slate-300">-</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* WORKSPACE VIEW 2: ACADEMIC REGISTER (COURSES) */}
                  {activePortalView === "ACADAMIC REGISTER" && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 font-sans uppercase">Active Semester Course Registration</h3>
                        <p className="text-[10px] text-slate-500">List of registered subjects, syllabuses, and credit frameworks for this term.</p>
                      </div>

                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-mono text-[10px]">
                            <th className="p-2 border border-slate-200">Subject Code</th>
                            <th className="p-2 border border-slate-200">Subject Title</th>
                            <th className="p-2 border border-slate-200">L-T-P-C</th>
                            <th className="p-2 border border-slate-200">Course Type</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-700">
                          {[
                            { code: "20CS501", title: "Design & Analysis of Algorithms", credit: "3-0-0-3", type: "Theory" },
                            { code: "20CS502", title: "Software Engineering Principles", credit: "3-0-0-3", type: "Theory" },
                            { code: "20CS503", title: "Web Technologies & Platforms", credit: "3-0-0-3", type: "Theory" },
                            { code: "20CS504", title: "Database Management Systems", credit: "3-0-0-3", type: "Theory" },
                            { code: "20CS505", title: "Advanced Java Programming", credit: "2-0-0-2", type: "Theory" },
                            { code: "20CS501L", title: "Algorithms & Analysis Laboratory", credit: "0-0-3-1.5", type: "Practical" },
                            { code: "20CS504L", title: "Database Engineering Laboratory", credit: "0-0-3-1.5", type: "Practical" }
                          ].map((subj) => (
                            <tr key={subj.code} className="hover:bg-slate-50 border-b border-slate-100">
                              <td className="p-2 border border-slate-200 font-mono text-[10.5px] text-[#0f4c81] font-bold">{subj.code}</td>
                              <td className="p-2 border border-slate-200 font-medium">{subj.title}</td>
                              <td className="p-2 border border-slate-200 font-mono text-slate-500">{subj.credit}</td>
                              <td className="p-2 border border-slate-200">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  subj.type === "Theory" ? "bg-blue-550/10 text-[#0f4c81]" : "bg-teal-50 text-teal-800"
                                }`}>
                                  {subj.type}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* WORKSPACE VIEW 3: ATTENDANCE */}
                  {activePortalView === "ATTENDANCE" && (
                    <div className="space-y-5">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 font-sans uppercase">Attendance Aggregations</h3>
                        <p className="text-[10px] text-slate-500">Live attendance logs calculated by the Dean of Academics registries.</p>
                      </div>

                      {/* Summary cards */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="border border-slate-200 p-4 rounded-xl text-center bg-slate-50">
                          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Overall Attendance</span>
                          <div className="text-2xl font-bold text-[#0f4c81] mt-1 font-mono">{studentProfile.attendance || 88.5}%</div>
                        </div>
                        <div className="border border-slate-200 p-4 rounded-xl text-center bg-slate-50">
                          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Verification Status</span>
                          <div className="text-sm font-bold text-emerald-600 mt-2 flex items-center justify-center">
                            <Check className="w-4 h-4 mr-1" /> MINIMUM REQUIREMENT MET
                          </div>
                        </div>
                      </div>

                      {/* Breakdown table */}
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-mono text-[10px]">
                            <th className="p-2 border border-slate-200">Subject</th>
                            <th className="p-2 border border-slate-200 text-center">Conducted</th>
                            <th className="p-2 border border-slate-200 text-center">Attended</th>
                            <th className="p-2 border border-slate-200 text-center">Percentage</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-700">
                          {[
                            { title: "Design & Analysis of Algorithms", cond: 45, att: 41, pct: 91 },
                            { title: "Software Engineering Principles", cond: 40, att: 34, pct: 85 },
                            { title: "Web Technologies & Platforms", cond: 42, att: 38, pct: 90 },
                            { title: "Database Management Systems", cond: 45, att: 39, pct: 86 },
                            { title: "Advanced Java Programming", cond: 30, att: 27, pct: 90 },
                            { title: "Algorithms Laboratory", cond: 15, att: 13, pct: 86 },
                            { title: "Database Laboratory", cond: 15, att: 14, pct: 93 }
                          ].map((subj, index) => (
                            <tr key={index} className="hover:bg-slate-50 border-b border-slate-100">
                              <td className="p-2 border border-slate-200 font-medium">{subj.title}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono">{subj.cond}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono">{subj.att}</td>
                              <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-800">
                                <span className={subj.pct < 75 ? "text-red-600" : "text-slate-800"}>
                                  {subj.pct}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* WORKSPACE VIEW 4: MARKS & GPAs */}
                  {activePortalView === "MARKS" && (
                    <div className="space-y-5">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 font-sans uppercase">Continuous Assessment Marks (CAM)</h3>
                        <p className="text-[10px] text-slate-500">Verified midterm exam scores and previous semester grade averages.</p>
                      </div>

                      {studentProfile.collegeAssessments && (
                        <div className="space-y-4">
                          {studentProfile.collegeAssessments.map((assess, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                              <div className="flex justify-between text-xs font-sans">
                                <span className="font-bold text-slate-700">{assess.examName}</span>
                                <span className="font-bold font-mono text-[#0f4c81]">{assess.marks}</span>
                              </div>
                              <div className="w-full bg-slate-100 border border-slate-200 rounded-full h-2.5 overflow-hidden">
                                <div 
                                  className="h-full bg-linear-to-r from-[#82b4df] to-[#0f4c81] rounded-full transition-all"
                                  style={{ width: `${assess.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* WORKSPACE VIEW 5: COACH DIAGNOSTIC (INTEGRATED INTERVIEW COACH DETAILS) */}
                  {activePortalView === "COACH DIAGNOSTIC" && (
                    <div className="space-y-5">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 font-sans uppercase">Interview Coach Integration Analytics</h3>
                        <p className="text-[10px] text-slate-500">Cross-reference matrices generated by merging your college database details with technical mocks.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-slate-200 p-4 rounded-xl bg-slate-50 flex flex-col justify-between">
                          <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Verification Alignment</span>
                          <div className="text-2xl font-bold font-mono text-[#0f4c81] mt-2">70% Match</div>
                          <p className="text-[11px] text-slate-500 mt-2">
                            Audited alignment score: verified college branch matches skills analyzed on your GitHub.
                          </p>
                        </div>

                        <div className="border border-slate-200 p-4 rounded-xl bg-slate-50 flex flex-col justify-between">
                          <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Placement Ready Grade</span>
                          <div className="text-2xl font-bold font-mono text-[#0f4c81] mt-2">
                            {scorecard ? `${scorecard.overallScore}/100` : "No Mock Completed"}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2">
                            Overall Readiness level diagnosed from your mock verbal and coding interview pipeline.
                          </p>
                        </div>
                      </div>

                      {scorecard && (
                        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                          <h4 className="text-xs font-bold text-slate-700 uppercase">Assessment Details</h4>
                          <div className="space-y-2.5 text-xs text-slate-600">
                            <div className="flex justify-between border-b border-slate-100 py-1">
                              <span>Candidate Level:</span>
                              <span className="font-bold text-[#0f4c81]">{scorecard.candidateLevel}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 py-1">
                              <span>Communication Rating:</span>
                              <span className="font-bold font-mono">{scorecard.categoryScores?.communicationClarity || 0}%</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 py-1">
                              <span>Technical Competency:</span>
                              <span className="font-bold font-mono">{scorecard.categoryScores?.technicalDepth || 0}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* WORKSPACE VIEW 6: DEV BLUEPRINT (TECHNICAL DB CONFIG) */}
                  {activePortalView === "DEV BLUEPRINT" && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 font-sans uppercase">Enterprise Integration Architecture</h3>
                        <p className="text-[10px] text-slate-500">Blueprint explaining how developers connect the live database in production.</p>
                      </div>

                      <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
                        <p>
                          To link this local mock view with the live Aditya student system data, choose one of the following production setups:
                        </p>
                        
                        <div className="space-y-3">
                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <strong className="text-[#0f4c81] block text-xs mb-1">Method 1: Secure REST Web Service (API)</strong>
                            Request the college IT team to configure a read-only endpoint served on their MS SQL Server.
                            <pre className="bg-slate-900 text-amber-200 p-2 rounded mt-1.5 text-[9px] font-mono overflow-x-auto truncate">
                              GET https://info.aec.edu.in/api/student/profile/24P31A1234
                            </pre>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <strong className="text-[#0f4c81] block text-xs mb-1">Method 2: Headless Web Scraper (Puppeteer/Playwright)</strong>
                            Deploy a server scraper that acts as a student gateway, logs in, handles cookie sessions, and parses the HTML details.
                            <pre className="bg-slate-900 text-slate-300 p-2.5 rounded mt-1.5 text-[8.5px] font-mono overflow-x-auto max-h-[120px] scrollbar-thin">
{`const puppeteer = require('puppeteer');
async function fetchDetails(roll, password) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://info.aec.edu.in/aus/default.aspx');
  await page.type('#txtUser', roll);
  await page.type('#txtPassword', password);
  await page.click('#btnLogin');
  await page.waitForNavigation();
  // Read elements from Academics/Marks table
  const gpa = await page.$eval('#lblGPA', el => el.innerText);
  return { gpa };
}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>

          </div>
        )}

      </motion.div>
    </div>
  );
}
