import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  User, 
  Award, 
  Clock, 
  Check, 
  Sparkles, 
  Database,
  Mail,
  GraduationCap,
  Save,
  Activity,
  Github,
  Calendar,
  Percent,
  RefreshCw
} from "lucide-react";
import { StudentProfile, Scorecard } from "../types";
import abdulProfileImg from "../../assets/abdul_profile.png";

interface ProfilePageProps {
  studentProfile: StudentProfile;
  scorecard: Scorecard | null;
  scorecardHistory: Scorecard[];
  onSyncPortalDetails: (password: string) => Promise<boolean>;
  onProfileUpdate: (updatedProfile: StudentProfile) => void;
  onNavigate: (view: string) => void;
}

const normalizeBranch = (dept: string) => {
  if (!dept) return "Information Technology";
  const lower = dept.toLowerCase();
  if (lower.includes("information technology") || lower === "it") return "Information Technology";
  if (lower.includes("computer science") || lower.includes("cse")) return "Computer Science Engineering";
  if (lower.includes("artificial intelligence") || lower.includes("ai") || lower.includes("data science")) return "Artificial Intelligence & Data Science";
  if (lower.includes("electronics") || lower.includes("ece") || lower.includes("communication")) return "Electronics & Communication Engineering";
  return dept;
};

export default function ProfilePage({ 
  studentProfile, 
  scorecard,
  scorecardHistory,
  onSyncPortalDetails,
  onProfileUpdate
}: ProfilePageProps) {
  
  // Local state for profile form fields
  const [name, setName] = useState(studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User"));
  const [department, setDepartment] = useState(
    normalizeBranch(studentProfile.department || (studentProfile.studentId === "24P31A1234" ? "Information Technology" : "Computer Science Engineering"))
  );
  const [classSection, setClassSection] = useState(studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "II B.Tech IT - Section A" : "Aditya College of Engineering & Technology"));
  const [academicYear, setAcademicYear] = useState(studentProfile.academicYear || (studentProfile.studentId === "24P31A1234" ? "2024-2028" : "2023-2027"));
  const [githubUsername, setGithubUsername] = useState(studentProfile.githubUsername || "");
  const [profileImage, setProfileImage] = useState(studentProfile.profileImage || "");
  const [attendance, setAttendance] = useState<number>(studentProfile.attendance || 84);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  
  // Sync modal states
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Active historical scorecard selector
  const [activeReportId, setActiveReportId] = useState<string | null>(
    scorecardHistory && scorecardHistory.length > 0 ? scorecardHistory[0].id : null
  );

  // Synchronize form states when studentProfile updates from college API sync
  React.useEffect(() => {
    setName(studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User"));
    setDepartment(
      normalizeBranch(studentProfile.department || (studentProfile.studentId === "24P31A1234" ? "Information Technology" : "Computer Science Engineering"))
    );
    setClassSection(studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "II B.Tech IT - Section A" : "Aditya College of Engineering & Technology"));
    setAcademicYear(studentProfile.academicYear || (studentProfile.studentId === "24P31A1234" ? "2024-2028" : "2023-2027"));
    setGithubUsername(studentProfile.githubUsername || "");
    setProfileImage(studentProfile.profileImage || "");
    setAttendance(studentProfile.attendance || 84);
  }, [studentProfile]);

  // Synchronize active report selection if history updates
  React.useEffect(() => {
    if (scorecardHistory && scorecardHistory.length > 0 && !activeReportId) {
      setActiveReportId(scorecardHistory[0].id);
    }
  }, [scorecardHistory]);

  const handleManualSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!portalPassword) {
      setSyncError("Please enter your password.");
      return;
    }
    setSyncing(true);
    setSyncSuccess(false);
    setSyncError(null);
    try {
      const success = await onSyncPortalDetails(portalPassword);
      if (success) {
        setSyncSuccess(true);
        setIsSyncModalOpen(false);
        setPortalPassword("");
        setTimeout(() => setSyncSuccess(false), 4000);
      } else {
        setSyncError("Sync failed. Check Roll Number or Password.");
      }
    } catch (err: any) {
      console.error(err);
      setSyncError(err.message || "Failed to sync. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  // Fallbacks for profile badge & display image
  const resolvedProfileImg = profileImage || (studentProfile.studentId === "24P31A1234" ? abdulProfileImg : undefined);

  // Use active scorecard, or fall back to realistic dashboard values
  const activeScorecard = scorecardHistory.find(h => h.id === activeReportId) || scorecard || null;
  const score = activeScorecard?.overallScore ?? 0;
  const level = activeScorecard?.candidateLevel ?? "No Data";
  const date = activeScorecard?.date ?? "N/A";
  
  const communicationScore = activeScorecard?.categoryScores?.communicationClarity ?? 0;
  const technicalScore = activeScorecard?.categoryScores?.technicalDepth ?? 0;
  const problemSolvingScore = activeScorecard?.categoryScores?.problemSolving ?? 0;
  
  const verdict = activeScorecard?.finalVerdict ?? 
    "No mock assessment history found. Complete a live mock interview to generate diagnostics.";



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile: StudentProfile = {
      ...studentProfile,
      name,
      department,
      classSection,
      academicYear,
      githubUsername,
      profileImage,
      attendance,
      isSynced: true
    };

    onProfileUpdate(updatedProfile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div id="profile-page" className="max-w-7xl mx-auto px-6 py-10 space-y-8 text-left">
      
      {/* Header */}
      <div className="border-b border-white/5 pb-6">
        <h1 className="font-display font-bold text-3xl text-white tracking-tight flex items-center">
          <User className="w-8 h-8 text-brand-primary mr-3" />
          Academic & Coach Profile
        </h1>
        <p className="text-gray-400 mt-1">
          Review and update your university details, sync your GitHub, and audit your Coach preparation readiness.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Form Editor (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit} className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6">
            <h3 className="text-lg font-display font-semibold text-white flex items-center border-b border-white/5 pb-3">
              <GraduationCap className="w-5 h-5 text-brand-primary mr-2" />
              University Profile Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Roll Number (Readonly) */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Roll Number (Permanent ID)</label>
                <div className="w-full bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl font-mono text-xs text-gray-600 select-none">
                  {studentProfile.studentId}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Student Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary font-sans"
                  required
                />
              </div>





              {/* Academic Year */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Academic Duration (Years)</label>
                <input 
                  type="text" 
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2024-2028"
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary font-sans"
                  required
                />
              </div>

              {/* GitHub Username */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">GitHub Username Anchor</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-xs text-gray-400 font-mono">@</span>
                  <input 
                    type="text" 
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="username"
                    className="w-full bg-brand-bg border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary font-mono"
                  />
                </div>
              </div>



              {/* Attendance */}
              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-mono text-gray-500 uppercase">Class Attendance Ratio</label>
                  <span className="text-xs font-mono font-bold text-brand-primary">{attendance}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={attendance}
                  onChange={(e) => setAttendance(parseInt(e.target.value))}
                  className="w-full accent-brand-primary cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                />
              </div>

            </div>

            {/* Save Buttons & Alerts */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/5">
              <p className="text-[11px] text-gray-500 leading-relaxed text-left sm:max-w-xs">
                Saving updates will synchronize details with both the browser cache and the Aditya Supabase cluster.
              </p>
              
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsSyncModalOpen(true);
                  }}
                  disabled={syncing}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold px-4 py-3 rounded-xl text-xs hover:scale-[1.01] transition-all duration-200 cursor-pointer disabled:opacity-50"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary mr-1" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Sync Connect</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-linear-to-r from-brand-accent to-brand-primary text-white font-bold px-6 py-3 rounded-xl text-xs hover:scale-[1.01] transition-all duration-200 cursor-pointer shadow-md neon-glow-btn"
                >
                  <Save className="w-4 h-4 text-white" />
                  <span>Save Profile</span>
                </button>
              </div>
            </div>

            {saveSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center space-x-2"
              >
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Success! Profile updated and synchronized with Supabase portal variables.</span>
              </motion.div>
            )}

            {syncSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-blue-50 border border-blue-200 text-brand-primary text-xs rounded-xl flex items-center space-x-2"
              >
                <Check className="w-4 h-4 text-brand-primary shrink-0" />
                <span>Successfully synced student details with Campus Connect University Database!</span>
              </motion.div>
            )}
          </form>

          {/* Previous Reports History Card */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
            <h3 className="text-lg font-display font-semibold text-white flex items-center border-b border-white/5 pb-3">
              <Award className="w-5 h-5 text-brand-primary mr-2" />
              Previous Mock Assessment Reports
            </h3>

            {scorecardHistory && scorecardHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-sans">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-500 font-mono uppercase text-[10px]">
                      <th className="py-3 text-left font-normal">Date Completed</th>
                      <th className="py-3 text-center font-normal">Readiness Level</th>
                      <th className="py-3 text-center font-normal">Score</th>
                      <th className="py-3 text-right font-normal">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-700">
                    {scorecardHistory.map((report) => (
                      <tr 
                        key={report.id} 
                        className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${
                          activeReportId === report.id ? "bg-slate-100/50" : ""
                        }`}
                        onClick={() => setActiveReportId(report.id)}
                      >
                        <td className="py-3.5 text-left font-medium text-white">{report.date}</td>
                        <td className="py-3.5 text-center font-mono">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            report.overallScore >= 85 
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                              : report.overallScore >= 73 
                                ? "bg-blue-50 text-brand-primary border border-blue-100" 
                                : "bg-amber-50 text-amber-600 border border-amber-100"
                          }`}>
                            {report.candidateLevel}
                          </span>
                        </td>
                        <td className="py-3.5 text-center font-mono font-bold text-slate-800">{report.overallScore}/100</td>
                        <td className="py-3.5 text-right font-mono">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReportId(report.id);
                            }}
                            className={`text-[10px] font-bold uppercase transition-colors hover:underline ${
                              activeReportId === report.id ? "text-brand-primary font-extrabold" : "text-gray-400"
                            }`}
                          >
                            {activeReportId === report.id ? "Viewing" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-2">No previous assessment history found. Complete a live interview to generate reports.</p>
            )}
          </div>
        </div>

        {/* Right Column: Avatar Info Card & Coach Diagnostics (col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Visual Avatar Summary Card */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl flex flex-col items-center text-center space-y-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary to-brand-accent rounded-full blur-md opacity-30" />
              <div className="relative w-24 h-24 rounded-full border-2 border-brand-primary overflow-hidden bg-slate-800 flex items-center justify-center shadow-lg">
                {resolvedProfileImg ? (
                  <img 
                    src={resolvedProfileImg} 
                    alt={name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-display font-extrabold text-white tracking-tight leading-tight">
                {name}
              </h2>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-[10px] font-mono text-brand-primary">
                ID: {studentProfile.studentId}
              </div>
              <p className="text-xs text-gray-500 font-mono mt-2">
                {classSection}
              </p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                {department}
              </p>
            </div>
            
            <div className="w-full pt-4 border-t border-white/5 flex justify-around text-xs font-mono text-gray-500">
              <div>
                <span className="block text-[10px] text-gray-400 uppercase">attendance</span>
                <span className="text-sm font-bold text-white font-sans">{attendance}%</span>
              </div>
              <div className="border-r border-white/5" />
              <div>
                <span className="block text-[10px] text-gray-400 uppercase">academic yr</span>
                <span className="text-sm font-bold text-white font-sans">{academicYear}</span>
              </div>
              <div className="border-r border-white/5" />
              <div>
                <span className="block text-[10px] text-gray-400 uppercase">github link</span>
                <span className="text-sm font-bold text-brand-primary flex items-center justify-center space-x-0.5">
                  {githubUsername ? (
                    <a href={`https://github.com/${githubUsername}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center">
                      <Github className="w-3.5 h-3.5 mr-0.5 text-brand-primary inline" />
                      @{githubUsername}
                    </a>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Coach Diagnostics Section */}
          <div className="bg-brand-card/25 border border-white/5 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-white/5">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider font-bold flex items-center">
                <Sparkles className="w-4 h-4 mr-1.5 text-brand-primary animate-pulse" />
                Coach Diagnostics
              </span>
              <span className="text-[10px] text-gray-500 font-mono flex items-center">
                <Clock className="w-3 h-3 mr-1" /> {date}
              </span>
            </div>

            {/* Circular score ring row */}
            <div className="flex items-center space-x-6">
              <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    className="stroke-slate-100 stroke-[5] fill-none"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    className="stroke-brand-primary stroke-[5] fill-none transition-all duration-500"
                    strokeDasharray={213.6}
                    strokeDashoffset={213.6 - (213.6 * score) / 100}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-bold text-white font-mono leading-none">{score}</span>
                  <span className="text-[8px] text-gray-400 uppercase font-mono mt-0.5">/100</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-500">Current Grade Readiness</div>
                <div className="text-sm font-bold text-brand-primary font-mono uppercase tracking-wide">{level}</div>
                <div className="text-[10px] text-gray-400">Subject parameters evaluated from mock speech records.</div>
              </div>
            </div>

            {/* Skill bars breakdown */}
            <div className="space-y-3.5 pt-2">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Communication & Clarity</span>
                  <span className="text-white font-bold">{communicationScore}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${communicationScore}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Technical Competency</span>
                  <span className="text-white font-bold">{technicalScore}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${technicalScore}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Problem Solving</span>
                  <span className="text-white font-bold">{problemSolvingScore}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${problemSolvingScore}%` }} />
                </div>
              </div>
            </div>

            {/* AI Verdict Box */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed font-sans mt-2">
              {verdict}
            </div>

            {/* Portal Sync Status */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-brand-primary" />
                <div className="text-left">
                  <div className="text-[10px] font-bold text-white uppercase font-sans">AEC Database Sync</div>
                  <div className="text-[9px] text-gray-400 font-mono mt-0.5">Synced with Campus Connect (ACET)</div>
                </div>
              </div>
              
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[9px] font-mono font-bold text-emerald-600">
                <Check className="w-2.5 h-2.5 mr-1 text-emerald-600" /> CONNECTED
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Aditya Student Portal Sync Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-brand-card/95 border border-white/10 rounded-2xl p-6 w-full max-w-sm relative text-left shadow-2xl">
            <h3 className="text-lg font-display font-semibold text-white mb-2">Sync with Aditya Student Portal</h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter your password for the Aditya automation portal (<span className="text-brand-primary font-mono text-[10px]">info.aec.edu.in</span>) to synchronize your name, photo, attendance, and branch.
            </p>
            
            <form onSubmit={handleManualSync} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-gray-500 uppercase mb-1">Student Roll Number</label>
                <div className="w-full bg-brand-bg/50 border border-white/5 px-4 py-2.5 rounded-xl text-xs text-gray-400 font-mono">
                  {studentProfile.studentId}
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-mono text-gray-500 uppercase mb-1">Portal Password</label>
                <input 
                  type="password"
                  value={portalPassword}
                  onChange={(e) => {
                    setPortalPassword(e.target.value);
                    setSyncError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-hidden focus:border-brand-primary"
                  required
                  autoFocus
                />
              </div>

              {syncError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[11px] leading-snug">
                  {syncError}
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSyncModalOpen(false);
                    setPortalPassword("");
                    setSyncError(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-white/10 hover:bg-white/5 text-gray-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncing || !portalPassword}
                  className="flex-1 px-4 py-2.5 bg-brand-primary hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1 text-white" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <span>Synchronize</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
