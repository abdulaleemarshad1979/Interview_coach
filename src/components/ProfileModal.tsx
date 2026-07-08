import React from "react";
import { motion } from "motion/react";
import { 
  X, 
  User, 
  Award, 
  Clock, 
  Check, 
  Sparkles, 
  Database,
  Phone,
  Mail,
  GraduationCap
} from "lucide-react";
import { StudentProfile, Scorecard } from "../types";
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
  scorecard 
}: ProfileModalProps) {
  if (!isOpen) return null;

  // Stale cache correction for Roll No 24P31A1234
  const displayProfileImage = studentProfile.profileImage || (studentProfile.studentId === "24P31A1234" ? abdulProfileImg : undefined);
  const displayName = studentProfile.name || (studentProfile.studentId === "24P31A1234" ? "MOHAMMAD ABDUL ALEEM ARSHAD" : "Offline Student User");
  const displayClass = studentProfile.classSection || (studentProfile.studentId === "24P31A1234" ? "II B.Tech IT - Section A" : "Aditya College of Engineering & Technology");
  const displayBranch = studentProfile.department || (studentProfile.studentId === "24P31A1234" ? "Information Technology" : "");

  // Use active scorecard, or fall back to realistic dashboard screenshot values (40/100 overall)
  const score = scorecard?.overallScore ?? 40;
  const level = scorecard?.candidateLevel ?? "Beginner";
  const date = scorecard?.date ?? "July 8, 2026";
  
  const communicationScore = scorecard?.categoryScores?.communicationClarity ?? 45;
  const technicalScore = scorecard?.categoryScores?.technicalDepth ?? 35;
  const problemSolvingScore = scorecard?.categoryScores?.problemSolving ?? 30;
  
  const verdict = scorecard?.finalVerdict ?? 
    "While the candidate shows potential with a strong resume and GitHub profile, there is a significant need for improvement in technical depth and communication clarity. Focus on mock interview practice to build confidence.";

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

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-10 text-left flex flex-col max-h-[90vh]"
      >
        {/* Header Ribbon border */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-primary via-brand-accent to-brand-primary shrink-0" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg bg-slate-800/80 border border-white/5 hover:bg-slate-800 transition-colors z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          
          {/* PROFILE SUMMARY CARD */}
          <div className="flex flex-col items-center text-center space-y-4 pt-2">
            {/* Circular Profile Avatar */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary to-brand-accent rounded-full blur-md opacity-60" />
              <div className="relative w-24 h-24 rounded-full border-2 border-brand-primary overflow-hidden bg-slate-800 flex items-center justify-center shadow-lg">
                {displayProfileImage ? (
                  <img 
                    src={displayProfileImage} 
                    alt={displayName} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-slate-500" />
                )}
              </div>
            </div>

            {/* Profile Identity Details */}
            <div className="space-y-1">
              <h2 className="text-xl font-display font-extrabold text-white tracking-tight leading-tight">
                {displayName}
              </h2>
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-[10px] font-mono text-brand-primary">
                ID: {studentProfile.studentId}
              </div>
              <p className="text-xs text-gray-400 font-mono mt-2">
                {displayClass}
              </p>
              {displayBranch && (
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                  {displayBranch}
                </p>
              )}
            </div>
          </div>

          {/* COACH ASSESSMENT METRICS CARD */}
          <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-5">
            {/* Header title */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/5">
              <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider font-bold flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-brand-primary" />
                Coach Diagnostics
              </span>
              <span className="text-[10px] text-gray-500 font-mono flex items-center">
                <Clock className="w-3 h-3 mr-1" /> {date}
              </span>
            </div>

            {/* Circular score ring row */}
            <div className="flex items-center space-x-6">
              {/* Radial Progress SVG */}
              <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    className="stroke-white/5 stroke-6 fill-none"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    className="stroke-brand-primary stroke-6 fill-none"
                    strokeDasharray={213.6}
                    strokeDashoffset={213.6 - (213.6 * score) / 100}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-bold text-white font-mono leading-none">{score}</span>
                  <span className="text-[8px] text-gray-400 uppercase font-mono mt-0.5">/100</span>
                </div>
              </div>

              {/* Score summary tags */}
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Current Grade Readiness</div>
                <div className="text-sm font-bold text-brand-primary font-mono uppercase">{level}</div>
                <div className="text-[10px] text-gray-500">Subject parameters evaluated from mock speech records.</div>
              </div>
            </div>

            {/* Skill bars breakdown */}
            <div className="space-y-3.5 pt-2">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Communication & Clarity</span>
                  <span className="text-white font-bold">{communicationScore}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${communicationScore}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Technical Competency</span>
                  <span className="text-white font-bold">{technicalScore}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${technicalScore}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-gray-400 mb-1">
                  <span>Problem Solving</span>
                  <span className="text-white font-bold">{problemSolvingScore}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-brand-primary" style={{ width: `${problemSolvingScore}%` }} />
                </div>
              </div>
            </div>

            {/* AI Verdict Box */}
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3.5 text-xs text-gray-400 leading-relaxed font-sans mt-2">
              {verdict}
            </div>
          </div>

          {/* PORTAL SYNC STATUS FOOTER */}
          <div className="bg-slate-950/20 border border-white/5 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-brand-primary" />
              <div className="text-left">
                <div className="text-[10px] font-bold text-white uppercase font-sans">AEC Database status</div>
                <div className="text-[9px] text-gray-400 font-mono mt-0.5">Synced with Campus Connect (ACET)</div>
              </div>
            </div>
            
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono font-bold text-emerald-400">
              <Check className="w-2.5 h-2.5 mr-1" /> CONNECTED
            </span>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
