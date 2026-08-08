import React from "react";
import { motion } from "motion/react";
import { 
  Play, 
  User, 
  GitBranch, 
  FileText, 
  Activity, 
  Award, 
  HelpCircle, 
  ArrowRight,
  TrendingUp,
  FileCheck2,
  Calendar,
  Building2,
  Briefcase,
  Sparkles
} from "lucide-react";
import { StudentProfile, Scorecard, FullAnalysisResult, CompanyPlacementDrive } from "../types";

interface DashboardPageProps {
  studentProfile: StudentProfile;
  scorecard: Scorecard | null;
  analysisResult: FullAnalysisResult | null;
  onNavigate: (view: string) => void;
}

export default function DashboardPage({ studentProfile, scorecard, analysisResult, onNavigate }: DashboardPageProps) {
  // Resolve assigned proctor
  const resolvedProctorName = (() => {
    const cached = localStorage.getItem(`assigned_proctor_${studentProfile.studentId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.proctorName;
      } catch {}
    }
    return studentProfile.assignedProctorName || studentProfile.assignedByProctorName;
  })();

  // Resolve assigned company drive
  const assignedDrive: CompanyPlacementDrive | null = (() => {
    if (studentProfile.assignedCompanyDrive) return studentProfile.assignedCompanyDrive;
    const stored = localStorage.getItem(`assigned_company_drive_${studentProfile.studentId}`);
    if (stored) {
      try { return JSON.parse(stored); } catch {}
    }
    const storedInterview = localStorage.getItem(`assignedInterview_${studentProfile.studentId}`);
    if (storedInterview) {
      try {
        const parsed = JSON.parse(storedInterview);
        if (parsed.companyName) {
          return {
            id: "drive_assigned",
            companyName: parsed.companyName,
            roleTitle: parsed.roleTitle || "Full Stack SDE",
            driveType: "Campus Placement",
            description: `Campus Placement Drive for ${parsed.companyName} assessing communication clarity and technical depth.`,
            requiredSkills: ["Communication Clarity", "STAR Problem Solving"]
          };
        }
      } catch {}
    }
    return null;
  })();

  return (
    <div id="dashboard-page" className="max-w-7xl mx-auto px-6 py-10 space-y-10 text-left">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight">
            Preparation Command
          </h1>
          <p className="text-slate-500 mt-1.5 flex items-center gap-3 flex-wrap text-sm">
            <span>Student Account: <span className="text-brand-primary font-mono font-bold">{studentProfile.studentId}</span></span>
            {resolvedProctorName && (
              <span className="flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/20 rounded-lg px-2.5 py-0.5 text-xs text-brand-primary font-sans font-medium">
                <User className="w-3 h-3 text-brand-primary" />
                Supervised by: <span className="font-semibold text-slate-800">{resolvedProctorName}</span>
              </span>
            )}
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={() => onNavigate("analyze")}
          className="flex items-center justify-center space-x-2 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold px-6 py-3.5 rounded-xl text-sm neon-glow-btn hover:scale-[1.01] transition-all cursor-pointer"
          id="btn-trigger-analysis"
        >
          <Play className="w-4 h-4 fill-brand-bg text-brand-bg" />
          <span>Launch Mock Pipeline</span>
        </button>
      </div>

      {/* Grid of Key Performance Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bg-brand-card/30 border border-white/5 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center">
            <Award className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-mono uppercase">Overall Grade</div>
            <div className="text-xl font-display font-bold text-white mt-1">
              {scorecard ? `${scorecard.overallScore}/100` : "No Data"}
            </div>
            {scorecard && <span className="text-[10px] text-brand-primary font-mono uppercase">{scorecard.candidateLevel}</span>}
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-brand-card/30 border border-white/5 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-accent/10 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-brand-accent" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-mono uppercase">Profile Alignment</div>
            <div className="text-xl font-display font-bold text-white mt-1">
              {analysisResult ? `${analysisResult.crossReference.alignmentScore}%` : "No Data"}
            </div>
            {analysisResult && <span className="text-[10px] text-gray-400 font-mono">Resume vs GitHub</span>}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-brand-card/30 border border-white/5 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-mono uppercase">Active Portfolio</div>
            <div className="text-sm font-display font-bold text-white mt-1 truncate max-w-[150px]">
              {studentProfile.resumeFileName ? studentProfile.resumeFileName : "No Resume Uploaded"}
            </div>
            <span className="text-[10px] text-gray-400 font-mono">Parsed PDF</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-brand-card/30 border border-white/5 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <GitBranch className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-mono uppercase">GitHub Repos</div>
            <div className="text-xl font-display font-bold text-white mt-1">
              {analysisResult ? `${analysisResult.githubAnalysis.repos.length} Connected` : "None"}
            </div>
            {analysisResult && (
              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[150px]">
                @{studentProfile.githubUsername}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Active State or Report Logs */}
        <div className="lg:col-span-8 space-y-8">
          {/* ASSIGNED COMPANY PLACEMENT DRIVE HIGHLIGHT CARD */}
          {assignedDrive && (
            <div className="bg-linear-to-r from-amber-500/10 to-brand-primary/10 border border-amber-500/20 p-6 rounded-2xl space-y-4 shadow-sm text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                      Assigned Campus Placement Drive
                    </span>
                  </div>
                  <h3 className="text-xl font-display font-bold text-white mt-1">
                    {assignedDrive.companyName} &bull; <span className="text-brand-primary">{assignedDrive.roleTitle}</span>
                  </h3>
                  <p className="text-xs text-gray-300 mt-1 leading-relaxed max-w-xl">
                    {assignedDrive.description || "Official placement drive assessing technical depth, communication clarity, and STAR problem solving."}
                  </p>
                </div>

                <button
                  onClick={() => onNavigate("interview")}
                  className="inline-flex items-center justify-center space-x-2 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold px-5 py-3 rounded-xl text-xs shadow-md transition-all cursor-pointer neon-glow-btn whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-brand-bg text-brand-bg" />
                  <span>Start {assignedDrive.companyName} Mock</span>
                </button>
              </div>
            </div>
          )}

          {scorecard ? (
            <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-display font-bold text-white">Latest Performance Assessment</h3>
                  <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">
                    {scorecard.companyDriveName ? `Company: ${scorecard.companyDriveName} (${scorecard.companyRoleTitle || "SDE"})` : "Recorded Report Timeline"}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate("report")}
                  className="flex items-center space-x-1.5 text-xs text-brand-primary hover:underline font-mono uppercase cursor-pointer"
                >
                  <span>Read Full Report</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Summary score ring and feedback snippet */}
              <div className="p-5 bg-brand-bg border border-white/5 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                <div className="sm:col-span-4 flex flex-col items-center">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        className="stroke-white/5 stroke-[8] fill-none"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        className="stroke-brand-primary stroke-[8] fill-none"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * scorecard.overallScore) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute font-display font-bold text-xl text-white">
                      {scorecard.overallScore}%
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-gray-400 uppercase mt-2">{scorecard.candidateLevel}</div>
                </div>

                <div className="sm:col-span-8 space-y-3">
                  <div>
                    <span className="text-[10px] font-mono text-gray-400 uppercase">Executive Summary</span>
                    <p className="text-sm text-gray-300 leading-relaxed mt-1">{scorecard.finalVerdict}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {scorecard.strengths.slice(0, 2).map((st, idx) => (
                      <span key={idx} className="px-2 py-1 bg-brand-primary/5 text-brand-primary border border-brand-primary/10 text-[10px] rounded font-mono truncate max-w-[200px]">
                        ✓ {st}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-brand-card/25 border border-white/5 p-8 rounded-2xl text-center space-y-6">
              <div className="w-12 h-12 bg-brand-primary/5 border border-brand-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Activity className="w-6 h-6 text-brand-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-display font-semibold text-white">No Mock Interviews Logged</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
                  Your preparation pipeline is empty. Submit your GitHub repository list and upload your resume PDF to let Gemini synthesize an adaptive mock technical interview.
                </p>
              </div>
              <button
                onClick={() => onNavigate("analyze")}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-medium text-sm rounded-xl transition-all inline-flex items-center space-x-2 border border-white/5 cursor-pointer"
              >
                <span>Setup Your Profile</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Group Discussion entry point card */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 shadow-sm bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-display font-bold text-slate-900">Peer Group Discussion (GD) Workspace</h3>
                <p className="text-xs text-slate-500 font-mono uppercase mt-0.5">Turn-Based Dialogue & AI soft skills grading</p>
              </div>
              <button
                onClick={() => onNavigate("group-discussion")}
                className="inline-flex items-center justify-center space-x-2 bg-brand-accent hover:bg-orange-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer font-sans badge-white-text"
              >
                <Play className="w-3.5 h-3.5 fill-white text-white" />
                <span>Launch GD Portal</span>
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Collaborate with a peer to debate or discuss academic and professional topics. Speak using your microphone. Submit for AI evaluation based on the official University Soft Skills Assessment rubric.
            </p>
          </div>
        </div>

        {/* Right Column: Key Guidance */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
            <h4 className="text-sm font-display font-bold text-white">SoftSkills Assessment Rubric</h4>
            <div className="space-y-3 text-xs text-gray-300">
              <div className="p-3 bg-brand-bg rounded-xl border border-white/5 space-y-1">
                <span className="font-mono text-brand-primary text-[10px] uppercase font-bold block">1. Speaking Test (2-3 min)</span>
                <p className="text-gray-400">Evaluates clarity, pronunciation, fluency, grammar accuracy, and vocabulary richness.</p>
              </div>
              <div className="p-3 bg-brand-bg rounded-xl border border-white/5 space-y-1">
                <span className="font-mono text-emerald-400 text-[10px] uppercase font-bold block">2. STAR Methodology</span>
                <p className="text-gray-400">Situation, Task, Action, and Result structured response re-engineering.</p>
              </div>
              <div className="p-3 bg-brand-bg rounded-xl border border-white/5 space-y-1">
                <span className="font-mono text-cyan-400 text-[10px] uppercase font-bold block">3. Company Placement Kits</span>
                <p className="text-gray-400">Dynamically connected by faculty to match target corporate hiring rounds.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
