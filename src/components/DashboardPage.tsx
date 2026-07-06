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
  Calendar
} from "lucide-react";
import { StudentProfile, Scorecard, FullAnalysisResult } from "../types";

interface DashboardPageProps {
  studentProfile: StudentProfile;
  scorecard: Scorecard | null;
  analysisResult: FullAnalysisResult | null;
  onNavigate: (view: string) => void;
}

export default function DashboardPage({ studentProfile, scorecard, analysisResult, onNavigate }: DashboardPageProps) {
  return (
    <div id="dashboard-page" className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Preparation Command
          </h1>
          <p className="text-gray-400 mt-1">
            Student Account: <span className="text-brand-primary font-mono">{studentProfile.studentId}</span>
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
          {scorecard ? (
            <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-display font-bold text-white">Latest Performance Assessment</h3>
                  <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">Recorded Report Timeline</p>
                </div>
                <button
                  onClick={() => onNavigate("report")}
                  className="flex items-center space-x-1.5 text-xs text-brand-primary hover:underline font-mono uppercase"
                >
                  <span>Read Full Report</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Summary score ring and feedback snippet */}
              <div className="p-5 bg-brand-bg border border-white/5 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                <div className="sm:col-span-4 flex flex-col items-center">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    {/* SVG Progress Ring */}
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
                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-medium text-sm rounded-xl transition-all inline-flex items-center space-x-2 border border-white/5"
              >
                <span>Setup Your Profile</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Guidelines roadmap card */}
          <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6">
            <div>
              <h3 className="text-lg font-display font-bold text-white">The Mock Interview Roadmap</h3>
              <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">Step-by-Step Training Program</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-3 p-4 bg-brand-bg/50 rounded-xl border border-white/5">
                <span className="font-mono text-brand-primary text-xs font-bold bg-brand-primary/5 border border-brand-primary/10 px-2.5 py-1 rounded">01</span>
                <h5 className="font-display font-semibold text-white text-sm">Portfolio Scan</h5>
                <p className="text-xs text-gray-400 leading-relaxed">We sync with GitHub and extract skills from your resume to compile your baseline developer context.</p>
              </div>
              <div className="space-y-3 p-4 bg-brand-bg/50 rounded-xl border border-white/5">
                <span className="font-mono text-brand-primary text-xs font-bold bg-brand-primary/5 border border-brand-primary/10 px-2.5 py-1 rounded">02</span>
                <h5 className="font-display font-semibold text-white text-sm">Adaptive Q&A</h5>
                <p className="text-xs text-gray-400 leading-relaxed">Gemini generates 6 custom questions grading you from warm-up basics up to core architectural tradeoffs.</p>
              </div>
              <div className="space-y-3 p-4 bg-brand-bg/50 rounded-xl border border-white/5">
                <span className="font-mono text-brand-primary text-xs font-bold bg-brand-primary/5 border border-brand-primary/10 px-2.5 py-1 rounded">03</span>
                <h5 className="font-display font-semibold text-white text-sm">Score Assessment</h5>
                <p className="text-xs text-gray-400 leading-relaxed">Receive instant grades on vocabulary, pacing, filler-word counters, and technical depth metrics.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Active Profile Meta info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-5">
            <h4 className="text-xs font-mono text-gray-400 uppercase tracking-wider pb-3 border-b border-white/5">
              Active Integration Profile
            </h4>

            {analysisResult ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">Audited Student Name</span>
                  <div className="text-sm font-semibold text-white mt-0.5">{analysisResult.parsedResume.name || "Student User"}</div>
                </div>

                <div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">GitHub Anchor</span>
                  <div className="text-sm font-mono text-brand-primary mt-0.5">@{studentProfile.githubUsername}</div>
                </div>

                <div>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">Verified Skill Profile</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {analysisResult.parsedResume.skills.slice(0, 6).map((sk, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-white/5 text-[10px] text-gray-300 rounded font-mono truncate max-w-[150px]">
                        {sk}
                      </span>
                    ))}
                    {analysisResult.parsedResume.skills.length > 6 && (
                      <span className="px-2 py-0.5 bg-white/5 text-[10px] text-gray-500 rounded font-mono">
                        +{analysisResult.parsedResume.skills.length - 6} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => onNavigate("analyze")}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium text-xs rounded-xl border border-white/5 transition-all text-center uppercase font-mono tracking-wider"
                  >
                    Recalibrate Profile
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  No active portfolio connected.
                </p>
                <button
                  onClick={() => onNavigate("analyze")}
                  className="px-4 py-2 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-semibold text-xs rounded-xl border border-brand-primary/20 transition-all uppercase font-mono"
                >
                  Configure Profile
                </button>
              </div>
            )}
          </div>

          {/* Career Resource Center Card */}
          <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-3">
            <h5 className="font-display font-semibold text-white text-sm flex items-center">
              <FileCheck2 className="w-4 h-4 text-brand-primary mr-2" />
              Evaluation Disclaimer
            </h5>
            <p className="text-xs text-gray-400 leading-relaxed">
              Coach provides presentation and technical alignment feedback. We do not evaluate personal characteristics, emotional status, or private psychological traits. Scoring is purely performance-centric.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
