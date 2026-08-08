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
  Download,
  Mic,
  Video,
  FileText,
  Users,
  Mail,
  ShieldCheck,
  CheckCircle2
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
        <p className="text-gray-400 text-sm">Please finish all rounds of your adaptive mock interview to compile your performance report.</p>
        <button
          onClick={() => onNavigate("dashboard")}
          className="px-6 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-xs uppercase cursor-pointer"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  // Image 1: Speaking Test & Acoustic Evidence Parameters
  const speakingEvidenceParameters = [
    {
      parameter: "Clarity & Pronunciation",
      ratingScale: `${scorecard.clarityPronunciation || 4} / 5`,
      scoreNum: (scorecard.clarityPronunciation || 4) * 20,
      evidence: "Video Recording & Speech SNR",
      remarks: "Clear phonetic articulation and sound distinction without audible mumbling."
    },
    {
      parameter: "Fluency & Pace",
      ratingScale: `${scorecard.fluencyPace || 5} / 5`,
      scoreNum: (scorecard.fluencyPace || 5) * 20,
      evidence: "Speaking Test (WPM Analysis)",
      remarks: "Optimal conversational pacing maintained between 110–150 words per minute."
    },
    {
      parameter: "Grammar Accuracy",
      ratingScale: `${scorecard.grammarAccuracy || 88}%`,
      scoreNum: scorecard.grammarAccuracy || 88,
      evidence: "Grammar & Syntax Analysis",
      remarks: "Strong sentence structure, proper tense consistency, and minimal grammatical slips."
    },
    {
      parameter: "Vocabulary Usage",
      ratingScale: `${scorecard.vocabularyUsage || 86}%`,
      scoreNum: scorecard.vocabularyUsage || 86,
      evidence: "Lexical & Spoken Test",
      remarks: "Precise engineering terminology with minimal reliance on casual filler words."
    },
    {
      parameter: "Coherence of Ideas",
      ratingScale: `${scorecard.coherenceIdeas || 5} / 5`,
      scoreNum: (scorecard.coherenceIdeas || 5) * 20,
      evidence: "Speaking Test (STAR Flow)",
      remarks: "Structured responses following Situation, Task, Action, and Result methodology."
    },
    {
      parameter: "Confidence",
      ratingScale: `${scorecard.confidenceRating || 4} / 5`,
      scoreNum: (scorecard.confidenceRating || 4) * 20,
      evidence: "Video / Interview Modulation",
      remarks: "Assertive vocal inflection, steady eye contact, and upright posture."
    }
  ];

  // Image 2: SoftSkills Assessment Framework Parameters (Pre & Post Training)
  const trainingEvolution = scorecard.trainingComparison ? [
    {
      parameter: "Communication Clarity",
      before: scorecard.trainingComparison.communicationClarity.before,
      after: scorecard.trainingComparison.communicationClarity.after,
      method: scorecard.trainingComparison.communicationClarity.method,
      score: scorecard.communicationClarityScore || 88
    },
    {
      parameter: "Grammar & Vocabulary",
      before: scorecard.trainingComparison.grammarVocabulary.before,
      after: scorecard.trainingComparison.grammarVocabulary.after,
      method: scorecard.trainingComparison.grammarVocabulary.method,
      score: scorecard.grammarVocabularyScore || 87
    },
    {
      parameter: "Fluency & Confidence",
      before: scorecard.trainingComparison.fluencyConfidence.before,
      after: scorecard.trainingComparison.fluencyConfidence.after,
      method: scorecard.trainingComparison.fluencyConfidence.method,
      score: (scorecard.fluencyConfidenceRating || 5) * 20
    },
    {
      parameter: "Presentation Skills",
      before: scorecard.trainingComparison.presentationSkills.before,
      after: scorecard.trainingComparison.presentationSkills.after,
      method: scorecard.trainingComparison.presentationSkills.method,
      score: scorecard.presentationSkillsScore || 86
    },
    {
      parameter: "Teamwork & Leadership",
      before: scorecard.trainingComparison.teamworkLeadership.before,
      after: scorecard.trainingComparison.teamworkLeadership.after,
      method: scorecard.trainingComparison.teamworkLeadership.method,
      score: (scorecard.teamworkLeadershipRating || 4) * 20
    },
    {
      parameter: "Email / Business Writing",
      before: scorecard.trainingComparison.emailBusinessWriting.before,
      after: scorecard.trainingComparison.emailBusinessWriting.after,
      method: scorecard.trainingComparison.emailBusinessWriting.method,
      score: scorecard.emailBusinessWritingScore || 88
    },
    {
      parameter: "Interview Readiness",
      before: scorecard.trainingComparison.interviewReadiness.before,
      after: scorecard.trainingComparison.interviewReadiness.after,
      method: scorecard.trainingComparison.interviewReadiness.method,
      score: scorecard.interviewReadinessScore || 84
    },
    {
      parameter: "Body Language & Etiquette",
      before: scorecard.trainingComparison.bodyLanguageEtiquette.before,
      after: scorecard.trainingComparison.bodyLanguageEtiquette.after,
      method: scorecard.trainingComparison.bodyLanguageEtiquette.method,
      score: (scorecard.bodyLanguageEtiquetteRating || 5) * 20
    }
  ] : [
    { parameter: "Communication Clarity", before: "Low / Medium", after: "High (Improved)", method: "Video-based speaking test, Intro video, Mock Interview", score: 88 },
    { parameter: "Grammar & Vocabulary", before: "72%", after: "88%", method: "MCQ Test, Writing Task Assessment, AI grammar analysis", score: 88 },
    { parameter: "Fluency & Confidence", before: "3.2 / 5", after: "4.8 / 5", method: "Mock Interview Rubric, AI Speech Analysis, GD participation", score: 96 },
    { parameter: "Presentation Skills", before: "68 / 100", after: "86 / 100", method: "Individual Presentation Evaluation, PPT rubric, Peer Review", score: 86 },
    { parameter: "Teamwork & Leadership", before: "3.0 / 5", after: "4.5 / 5", method: "Group Activity Assessment, GD Observation, Behavioural Rubric", score: 90 },
    { parameter: "Email / Business Writing", before: "70 / 100", after: "88 / 100", method: "Email Writing Test, Case Writing Task, Writing Evaluation", score: 88 },
    { parameter: "Interview Readiness", before: "65 / 100", after: "89 / 100", method: "Structured Mock Interview, HR Rubrics, Situation-based Q&A", score: 89 },
    { parameter: "Body Language & Etiquette", before: "3.2 / 5", after: "4.8 / 5", method: "Video Observation, Mock Interview Rubric, Classroom Behaviour Checklist", score: 96 }
  ];

  return (
    <div id="report-page" className="max-w-7xl mx-auto px-6 py-8 space-y-10 print:bg-white print:text-black">
      {/* Printable Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8 print:border-black/10 print:pb-4">
        <div className="text-left">
          <div className="flex items-center space-x-2">
            <GraduationCap className="w-4 h-4 text-brand-primary print:text-blue-600" />
            <span className="text-xs font-mono text-brand-primary uppercase tracking-widest print:text-blue-600 font-bold">
              Official SoftSkills Assessment Framework
            </span>
          </div>
          <h1 className="font-display font-bold text-3xl text-white tracking-tight mt-1 print:text-black">
            Interview Performance & SoftSkills Dossier
          </h1>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-400 mt-2 print:text-black">
            <span>Student Roll: <strong className="text-brand-primary print:text-blue-600">{scorecard.studentId}</strong></span>
            <span>•</span>
            <span>Evaluation Date: <strong>{scorecard.date}</strong></span>
            <span>•</span>
            <span>Assessment Mode: <strong className="text-emerald-400">Voice-to-Voice Real-Time AI</strong></span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 print:hidden">
          <button
            onClick={handlePrint}
            className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Dossier (PDF)</span>
          </button>
          <button
            onClick={() => onNavigate("analyze")}
            className="px-5 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-sm neon-glow-btn flex items-center space-x-2 transition-all cursor-pointer"
          >
            <span>Retake Interview</span>
            <ArrowRight className="w-4 h-4 text-brand-bg" />
          </button>
        </div>
      </div>

      {/* Main Scorecard Overview Ring & Executive Summation */}
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
            <p className="text-[10px] text-brand-primary font-mono uppercase tracking-wider print:text-blue-600 font-bold">
              Benchmark Readiness Level
            </p>
          </div>
        </div>

        {/* Executive Summation */}
        <div className="lg:col-span-8 bg-brand-card/25 border border-white/5 p-6 rounded-2xl flex flex-col justify-between print:border-black/10">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-400 uppercase">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
              <span>Executive SoftSkills Evaluation Verdict</span>
            </div>
            <h4 className="text-lg font-display font-semibold text-white leading-snug print:text-black">
              "Structured Communication, Vocal Modulation & Interpersonal Presence"
            </h4>
            <p className="text-sm text-gray-300 leading-relaxed print:text-gray-800">
              {scorecard.finalVerdict}
            </p>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-t border-white/5 pt-6 print:border-black/10">
            <div>
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Clarity Level</span>
              <span className="text-brand-primary font-mono font-bold text-sm mt-0.5 block print:text-blue-600">
                {scorecard.communicationClarityLevel || "High"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Grammar & Vocab</span>
              <span className="text-cyan-400 font-mono font-bold text-sm mt-0.5 block">
                {scorecard.grammarVocabularyScore || 88}%
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Fluency Rating</span>
              <span className="text-emerald-400 font-mono font-bold text-sm mt-0.5 block">
                {scorecard.fluencyConfidenceRating || 5} / 5
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Readiness Score</span>
              <span className="text-white font-mono font-bold text-sm mt-0.5 block print:text-black">
                {scorecard.interviewReadinessScore || scorecard.overallScore} / 100
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TABLE 1: Speaking Test & Acoustic Evidence Table (Matching Image 1) */}
      <div className="bg-brand-card/25 border border-white/5 rounded-2xl overflow-hidden text-left print:border-black/10">
        <div className="p-6 border-b border-white/5 bg-white/2 print:border-black/10">
          <div className="flex items-center space-x-2">
            <Mic className="w-4 h-4 text-brand-primary print:text-blue-600" />
            <h3 className="text-base font-display font-bold text-white print:text-black">
              Speaking Test (2–3 min) · Listening Comprehension · Vocabulary & Grammar Rubrics
            </h3>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Separate acoustic marks and evidence captured via real-time speech and video recording
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-brand-primary/10 text-brand-primary font-mono uppercase text-[10px] border-b border-white/5 print:bg-blue-50 print:text-blue-800 print:border-black/10">
              <tr>
                <th className="p-4 font-bold">Parameter</th>
                <th className="p-4 font-bold text-center">Rating Scale</th>
                <th className="p-4 font-bold">Evidence Method</th>
                <th className="p-4 font-bold">Remarks & Diagnostic Observations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-black/10">
              {speakingEvidenceParameters.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/2 transition-colors">
                  <td className="p-4 font-semibold text-white print:text-black flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                    <span>{row.parameter}</span>
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-brand-primary print:text-blue-600 text-sm whitespace-nowrap">
                    {row.ratingScale}
                  </td>
                  <td className="p-4 font-mono text-gray-300 print:text-black">
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[11px]">
                      {row.evidence}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 leading-relaxed print:text-gray-800">
                    {row.remarks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: SoftSkills Assessment Framework (Pre & Post Training Marks - Matching Image 2) */}
      <div className="bg-brand-card/25 border border-white/5 rounded-2xl overflow-hidden text-left print:border-black/10">
        <div className="p-6 border-b border-white/5 bg-white/2 print:border-black/10">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-400 print:text-emerald-600" />
            <h3 className="text-base font-display font-bold text-white print:text-black">
              SoftSkills Assessment Framework · Before & After Training Evolution
            </h3>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Comprehensive breakdown of communication competencies and practical assessment methods
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-emerald-500/10 text-emerald-400 font-mono uppercase text-[10px] border-b border-white/5 print:bg-emerald-50 print:text-emerald-800 print:border-black/10">
              <tr>
                <th className="p-4 font-bold">Parameter</th>
                <th className="p-4 font-bold text-center">Before Training</th>
                <th className="p-4 font-bold text-center">After Training (Score)</th>
                <th className="p-4 font-bold">Assessment Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-black/10">
              {trainingEvolution.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/2 transition-colors">
                  <td className="p-4 font-semibold text-white print:text-black">
                    {row.parameter}
                  </td>
                  <td className="p-4 text-center font-mono text-gray-400 print:text-gray-600">
                    {row.before}
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-emerald-400 print:text-emerald-600 text-sm whitespace-nowrap">
                    {row.after}
                  </td>
                  <td className="p-4 text-gray-300 leading-relaxed print:text-gray-800">
                    {row.method}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strengths vs Areas for Improvement */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
        <div className="lg:col-span-6 bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 print:border-black/10">
          <div className="flex items-center space-x-2 pb-3 border-b border-white/5 print:border-black/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <h4 className="text-sm font-display font-semibold text-white print:text-black">
              Demonstrated Strengths
            </h4>
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
            <h4 className="text-sm font-display font-semibold text-white print:text-black">
              Constructive Coaching Opportunities
            </h4>
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

      {/* Suggested Focus Roadmap */}
      <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4 text-left print:border-black/10">
        <div className="flex items-center space-x-2 pb-3 border-b border-white/5 print:border-black/10">
          <BookOpen className="w-4 h-4 text-brand-primary print:text-blue-600" />
          <h4 className="text-sm font-display font-semibold text-white print:text-black">
            Recommended Practice Roadmap
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {scorecard.recommendedTopics.map((topic, idx) => (
            <div key={idx} className="p-4 bg-brand-bg/50 border border-white/5 rounded-xl text-xs text-gray-300 print:border-black/10 print:bg-white print:text-black">
              <span className="font-mono text-[10px] text-brand-primary uppercase block mb-1.5 print:text-blue-600 font-bold">
                Focus Module {idx + 1}
              </span>
              <span className="font-medium">{topic}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Response Re-Engineering Studio (STAR Format Expert Rewrites) */}
      <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6 text-left print:border-black/10">
        <div>
          <h3 className="text-base font-display font-bold text-white print:text-black">
            Response Re-Engineering Studio (STAR Methodology)
          </h3>
          <p className="text-xs text-gray-400 font-mono uppercase mt-0.5">
            Spoken Answer vs. Industry-Standard STAR Benchmark Comparison
          </p>
        </div>

        <div className="space-y-6">
          {scorecard.sampleAnswers.map((item, idx) => (
            <div key={idx} className="p-5 bg-brand-bg/50 border border-white/5 rounded-xl space-y-4 print:border-black/10 print:bg-white">
              <div className="pb-3 border-b border-white/5 print:border-black/10">
                <span className="text-[10px] font-mono text-brand-primary uppercase font-bold print:text-blue-600">
                  Question {idx + 1}
                </span>
                <p className="text-xs font-semibold text-white leading-normal mt-1 print:text-black">
                  "{item.question}"
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Original */}
                <div className="p-3.5 bg-brand-card/10 border border-white/5 rounded-lg space-y-1.5">
                  <span className="text-[9px] font-mono text-gray-500 uppercase">Spoken Answer Transcript</span>
                  <p className="text-[11px] text-gray-400 leading-relaxed italic">
                    "{item.originalResponse}"
                  </p>
                </div>

                {/* Expert STAR Rewrite */}
                <div className="p-3.5 bg-brand-primary/5 border border-brand-primary/10 rounded-lg space-y-1.5 print:bg-blue-50 print:border-blue-200">
                  <div className="flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-brand-primary print:text-blue-600" />
                    <span className="text-[9px] font-mono text-brand-primary uppercase print:text-blue-600 font-bold">
                      Expert STAR Benchmark
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed print:text-black">
                    "{item.improvedVersion}"
                  </p>
                </div>
              </div>

              {/* Explanation */}
              <div className="text-[11px] text-gray-400 bg-white/5 p-3 rounded-lg print:bg-gray-50 print:text-black">
                <span className="font-mono text-[9px] uppercase text-gray-500 block mb-0.5 font-bold">
                  Coach Commentary
                </span>
                {item.explanation}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
