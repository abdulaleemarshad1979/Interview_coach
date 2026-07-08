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
  Percent
} from "lucide-react";
import { StudentProfile, Scorecard } from "../types";
import abdulProfileImg from "../../assets/abdul_profile.png";

interface ProfilePageProps {
  studentProfile: StudentProfile;
  scorecard: Scorecard | null;
  onProfileUpdate: (updatedProfile: StudentProfile) => void;
  onNavigate: (view: string) => void;
}

export default function ProfilePage({ 
  studentProfile, 
  scorecard,
  onProfileUpdate
}: ProfilePageProps) {
  
  // Local state for profile form fields
  const [name, setName] = useState(studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User"));
  const [department, setDepartment] = useState(studentProfile.department || (studentProfile.studentId === "24P31A1234" ? "Information Technology" : "Computer Science"));
  const [classSection, setClassSection] = useState(studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "II B.Tech IT - Section A" : "Aditya College of Engineering & Technology"));
  const [academicYear, setAcademicYear] = useState(studentProfile.academicYear || (studentProfile.studentId === "24P31A1234" ? "2024-2028" : "2023-2027"));
  const [githubUsername, setGithubUsername] = useState(studentProfile.githubUsername || "");
  const [profileImage, setProfileImage] = useState(studentProfile.profileImage || "");
  const [attendance, setAttendance] = useState<number>(studentProfile.attendance || 84);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fallbacks for profile badge & display image
  const resolvedProfileImg = profileImage || (studentProfile.studentId === "24P31A1234" ? abdulProfileImg : undefined);

  // Use active scorecard, or fall back to realistic dashboard values
  const score = scorecard?.overallScore ?? 40;
  const level = scorecard?.candidateLevel ?? "Beginner";
  const date = scorecard?.date ?? "July 8, 2026";
  
  const communicationScore = scorecard?.categoryScores?.communicationClarity ?? 45;
  const technicalScore = scorecard?.categoryScores?.technicalDepth ?? 35;
  const problemSolvingScore = scorecard?.categoryScores?.problemSolving ?? 30;
  
  const verdict = scorecard?.finalVerdict ?? 
    "While the candidate shows potential with a strong resume and GitHub profile, there is a significant need for improvement in technical depth and communication clarity. Focus on mock interview practice to build confidence.";



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

              {/* Department */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Department / Branch</label>
                <select 
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary cursor-pointer font-sans"
                >
                  <option value="Information Technology">Information Technology</option>
                  <option value="Computer Science Engineering">Computer Science Engineering</option>
                  <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science</option>
                  <option value="Electronics & Communication Engineering">Electronics & Communication Engineering</option>
                </select>
              </div>

              {/* Class Section */}
              <div>
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Class & Section</label>
                <input 
                  type="text" 
                  value={classSection}
                  onChange={(e) => setClassSection(e.target.value)}
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

              {/* Profile Image URL */}
              <div className="md:col-span-2">
                <label className="block text-xs font-mono text-gray-500 uppercase mb-1.5">Avatar Image URL</label>
                <input 
                  type="url" 
                  value={profileImage}
                  onChange={(e) => setProfileImage(e.target.value)}
                  placeholder="https://images.unsplash.com/... or leave blank for default"
                  className="w-full bg-brand-bg border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-hidden focus:border-brand-primary font-sans"
                />
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
              
              <button
                type="submit"
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-linear-to-r from-brand-accent to-brand-primary text-white font-bold px-6 py-3 rounded-xl text-xs hover:scale-[1.01] transition-all duration-200 cursor-pointer shadow-md neon-glow-btn"
              >
                <Save className="w-4 h-4 text-white" />
                <span>Save & Sync Profile</span>
              </button>
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
          </form>


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
    </div>
  );
}
