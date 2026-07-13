import React from "react";
import { motion } from "motion/react";
import { 
  Award, 
  CheckCircle, 
  XCircle, 
  BookOpen, 
  Printer, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  FileCode,
  GraduationCap,
  Download
} from "lucide-react";
import { Scorecard, FullAnalysisResult } from "../types";

interface ReportPageProps {
  scorecard: Scorecard | null;
  onNavigate: (view: string) => void;
}

export default function ReportPage({ scorecard, onNavigate }: ReportPageProps) {
  const handlePrint = () => {
    window.print();
  };

  if (!scorecard) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center space-y-6 bg-brand-card/25 border border-white/5 rounded-2xl">
        <Award className="w-12 h-12 text-brand-primary mx-auto animate-pulse" />
        <h3 className="text-xl font-display font-bold text-white">No scorecards found</h3>
        <p className="text-gray-400 text-sm">Please finish all 6 rounds of your adaptive mock interview to compile your performance report.</p>
        <button
          onClick={() => onNavigate("dashboard")}
          className="px-6 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-xs uppercase cursor-pointer"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  // Define Category items dynamically
  const isSoftSkills = scorecard.interviewType === "soft-skills" || 
    (!("resumeStrength" in scorecard.categoryScores) && "teamworkCollaboration" in scorecard.categoryScores);

  const categories = isSoftSkills ? [
    { label: "Communication Clarity", score: scorecard.categoryScores.communicationClarity || 0, desc: "Structure, clarity, and explanation details" },
    { label: "Confidence & Composure", score: scorecard.categoryScores.presentationConfidence || 0, desc: "Certainty, calm, and authenticity" },
    { label: "Problem-Solving Approach", score: scorecard.categoryScores.problemSolving || 0, desc: "Thinking process, breaking questions down" },
    { label: "Teamwork & Collaboration", score: scorecard.categoryScores.teamworkCollaboration || 0, desc: "Conflict handling, sharing responsibility" },
    { label: "Adaptability & Resilience", score: scorecard.categoryScores.adaptabilityResilience || 0, desc: "Handling requirements shifts or constraints" },
    { label: "Ownership & EQ", score: scorecard.categoryScores.ownershipEQ || 0, desc: "Accountability, learning mindset, and empathy" },
    { label: "Overall Readiness", score: scorecard.categoryScores.overallReadiness || 0, desc: "Benchmark readiness for interpersonal rounds" }
  ] : [
    { label: "Resume Strength", score: scorecard.categoryScores.resumeStrength || 0, desc: "Alignment and project mapping clarity" },
    { label: "GitHub Strength", score: scorecard.categoryScores.githubStrength || 0, desc: "Commit habits, readme density and repositories" },
    { label: "Technical Depth", score: scorecard.categoryScores.technicalDepth || 0, desc: "Accuracy of definitions and system scopes" },
    { label: "Problem Solving", score: scorecard.categoryScores.problemSolving || 0, desc: "Algorithmic thinking and code scalability" },
    { label: "Communication", score: scorecard.categoryScores.communicationClarity || 0, desc: "Structural clarity and grammatical cohesion" },
    { label: "Vocabulary Richness", score: scorecard.categoryScores.vocabularyRichness || 0, desc: "Use of precise industry terminology" },
    { label: "Presentation", score: scorecard.categoryScores.presentationConfidence || 0, desc: "Fluency, pacing, and confident delivery" },
    { label: "Overall Readiness", score: scorecard.categoryScores.overallReadiness || 0, desc: "Benchmark alignment for landing elite tech jobs" }
  ];

  return (
    <div id="report-page" className="max-w-7xl mx-auto px-6 py-8 space-y-10 print:bg-white print:text-black">
      {/* Printable Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 print:border-black/10 print:pb-4">
        <div className="text-left">
          <span className="text-xs font-mono text-brand-primary uppercase tracking-widest print:text-blue-600">Performance Dossier</span>
          <h1 className="font-display font-bold text-3xl text-white tracking-tight mt-1 print:text-black">
            Interview Assessment Card
          </h1>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-400 mt-2 print:text-black">
            <span>Student ID: <strong className="text-brand-primary print:text-blue-600">{scorecard.studentId}</strong></span>
            <span>•</span>
            <span>GitHub Profile: <strong>@{scorecard.githubUsername}</strong></span>
            <span>•</span>
            <span>Date: <strong>{scorecard.date}</strong></span>
          </div>
        </div>

        {/* Print Actions */}
        <div className="flex space-x-3 print:hidden">
          <button
            onClick={handlePrint}
            className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </button>
          <button
            onClick={() => onNavigate("analyze")}
            className="px-5 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-sm neon-glow-btn flex items-center space-x-2 transition-all cursor-pointer"
          >
            <span>Retrain Interview</span>
            <ArrowRight className="w-4 h-4 text-brand-bg" />
          </button>
        </div>
      </div>

      {/* Main Stats bento ring & executive summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        {/* Core Ring */}
        <div className="lg:col-span-4 bg-brand-card/25 border border-white/5 p-6 rounded-2xl flex flex-col items-center justify-center text-center print:border-black/10 print:bg-gray-50">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="60"
                className="stroke-white/5 stroke-[10] fill-none print:stroke-gray-200"
              />
              <circle
                cx="72"
                cy="72"
                r="60"
                className="stroke-brand-primary stroke-[10] fill-none print:stroke-blue-600"
                strokeDasharray={376.8}
                strokeDashoffset={376.8 - (376.8 * scorecard.overallScore) / 100}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute font-display font-bold text-3xl text-white print:text-black">
              {scorecard.overallScore}%
            </span>
          </div>

          <div className="mt-6 space-y-1">
            <h3 className="font-display font-bold text-xl text-white print:text-black">{scorecard.candidateLevel}</h3>
            <p className="text-[10px] text-brand-primary font-mono uppercase tracking-wider print:text-blue-600">Current Readiness Level</p>
          </div>
        </div>

        {/* Summary text */}
        <div className="lg:col-span-8 bg-brand-card/25 border border-white/5 p-6 rounded-2xl flex flex-col justify-between print:border-black/10">
          <div className="space-y-4">
            <span className="text-[10px] font-mono text-gray-500 uppercase">executive summation</span>
            <h4 className="text-lg font-display font-semibold text-white leading-snug print:text-black">"Strategic Portfolio Alignment & Adaptive Speech Analysis"</h4>
            <p className="text-sm text-gray-300 leading-relaxed print:text-gray-800">
              {scorecard.finalVerdict}
            </p>
          </div>

          {/* Quick Stats list */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-t border-white/5 pt-6 print:border-black/10">
            <div>
              <span className="text-[10px] font-mono text-gray-500 block">TOTAL ROUNDS</span>
              <span className="text-white font-semibold text-sm mt-0.5 block print:text-black">6 of 6 Completed</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block">EVALUATOR</span>
              <span className="text-brand-primary font-mono text-sm mt-0.5 block font-bold print:text-blue-600">Gemini Live API</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block">ACCESSIBILITY</span>
              <span className="text-emerald-400 font-mono text-sm mt-0.5 block font-bold">Standard SSL Secure</span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block">DIFFICULTY</span>
              <span className="text-white font-semibold text-sm mt-0.5 block print:text-black">Adaptive Progression</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of category scoring sliders */}
      <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6 text-left print:border-black/10">
        <div>
          <h3 className="text-base font-display font-bold text-white print:text-black">Performance Diagnostic Metrics</h3>
          <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">Rubric and category breakdowns</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map((cat, idx) => (
            <div key={idx} className="p-4 bg-brand-bg/50 border border-white/5 rounded-xl space-y-2.5 print:border-black/10 print:bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white print:text-black">{cat.label}</span>
                  <p className="text-[10px] text-gray-500 leading-none mt-0.5">{cat.desc}</p>
                </div>
                <span className="text-xs font-mono font-bold text-brand-primary print:text-blue-600">{cat.score}%</span>
              </div>
              
              {/* Slider track */}
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden print:bg-gray-100">
                <div 
                  className="bg-brand-primary h-full rounded-full print:bg-blue-600"
                  style={{ width: `${cat.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths vs Areas of Correction bento-box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        <div className="lg:col-span-6 bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 print:border-black/10">
          <div className="flex items-center space-x-2 pb-3 border-b border-white/5 print:border-black/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <h4 className="text-sm font-display font-semibold text-white print:text-black">Core Presentation Strengths</h4>
          </div>
          <ul className="space-y-3 text-xs leading-normal">
            {scorecard.strengths.map((st, idx) => (
              <li key={idx} className="flex items-start text-gray-300 print:text-black">
                <span className="text-emerald-500 font-bold mr-2 shrink-0">•</span>
                <span>{st}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 print:border-black/10">
          <div className="flex items-center space-x-2 pb-3 border-b border-white/5 print:border-black/10">
            <XCircle className="w-4 h-4 text-amber-500" />
            <h4 className="text-sm font-display font-semibold text-white print:text-black">Constructive Training Opportunities</h4>
          </div>
          <ul className="space-y-3 text-xs leading-normal">
            {scorecard.weaknesses.map((wk, idx) => (
              <li key={idx} className="flex items-start text-gray-300 print:text-black">
                <span className="text-amber-500 font-bold mr-2 shrink-0">•</span>
                <span>{wk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Suggested focus topics */}
      <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 text-left print:border-black/10">
        <div className="flex items-center space-x-2 pb-3 border-b border-white/5 print:border-black/10">
          <BookOpen className="w-4 h-4 text-brand-primary print:text-blue-600" />
          <h4 className="text-sm font-display font-semibold text-white print:text-black">Recommended Practice roadmap</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scorecard.recommendedTopics.map((topic, idx) => (
            <div key={idx} className="p-4 bg-brand-bg/50 border border-white/5 rounded-xl text-xs text-gray-300 print:border-black/10 print:bg-white print:text-black">
              <span className="font-mono text-[10px] text-brand-primary uppercase block mb-1.5 print:text-blue-600">Roadmap Topic {idx+1}</span>
              <span className="font-medium">{topic}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-side Comparative rewritten expert responses */}
      <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6 text-left print:border-black/10">
        <div>
          <h3 className="text-base font-display font-bold text-white print:text-black">Response Re-Engineering Studio</h3>
          <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">Original answers vs Expert-level benchmark comparison</p>
        </div>

        <div className="space-y-6">
          {scorecard.sampleAnswers.map((item, idx) => (
            <div key={idx} className="p-5 bg-brand-bg/50 border border-white/5 rounded-xl space-y-4 print:border-black/10 print:bg-white">
              <div className="pb-3 border-b border-white/5 print:border-black/10">
                <span className="text-[10px] font-mono text-brand-primary uppercase print:text-blue-600">Sample {idx+1} Question</span>
                <p className="text-xs font-semibold text-white leading-normal mt-1 print:text-black">"{item.question}"</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* original */}
                <div className="p-3.5 bg-brand-card/10 border border-white/5 rounded-lg space-y-1.5">
                  <span className="text-[9px] font-mono text-gray-500 uppercase">Your original transcript</span>
                  <p className="text-[11px] text-gray-400 leading-relaxed italic">"{item.originalResponse}"</p>
                </div>

                {/* expert rewrite */}
                <div className="p-3.5 bg-brand-primary/5 border border-brand-primary/10 rounded-lg space-y-1.5 print:bg-blue-50 print:border-blue-200">
                  <div className="flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-brand-primary print:text-blue-600" />
                    <span className="text-[9px] font-mono text-brand-primary uppercase print:text-blue-600">Expert benchmark rewrite</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed print:text-black">"{item.improvedVersion}"</p>
                </div>
              </div>

              {/* commentary */}
              <div className="text-[11px] text-gray-400 bg-white/5 p-3 rounded-lg print:bg-gray-50 print:text-black">
                <span className="font-mono text-[9px] uppercase text-gray-500 block mb-0.5">Advisor Commentary</span>
                {item.explanation}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
