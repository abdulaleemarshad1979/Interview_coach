import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  GitBranch, 
  FileText, 
  UploadCloud, 
  CheckCircle, 
  X, 
  Loader2, 
  Sparkles, 
  Lock, 
  ArrowRight,
  TrendingUp,
  FileCode,
  AlertCircle
} from "lucide-react";
import { FullAnalysisResult, StudentProfile } from "../types";

interface AnalyzePageProps {
  studentProfile: StudentProfile;
  analysisResult: FullAnalysisResult | null;
  onAnalysisSuccess: (result: FullAnalysisResult, githubUser: string, fileName: string) => void;
  onQuestionsGenerated: (questions: any[]) => void;
  onNavigate: (view: string) => void;
}

// Stage messages for the loader animation
const ANALYSIS_STAGES = [
  "Contacting GitHub REST API...",
  "Fetching public repository structures and primary stacks...",
  "Parsing code quality, stargazers, and folder definitions...",
  "Sending resume PDF bytes directly to Gemini Flash for OCR-free layout reading...",
  "Running cross-reference algorithm comparing portfolio claims to GitHub code...",
  "Formulating scorecards and aligning diagnostic suggestions..."
];

export default function AnalyzePage({ studentProfile, analysisResult, onAnalysisSuccess, onQuestionsGenerated, onNavigate }: AnalyzePageProps) {
  const [githubUsername, setGithubUsername] = useState(studentProfile.githubUsername || "");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [questionGenerating, setQuestionGenerating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageTimerRef = useRef<any>(null);

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf") {
      setError("Only standard PDF documents are supported for high-fidelity native document parsing.");
      setFile(null);
      return;
    }
    // Limit to 10MB
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Document exceeds size limit (10MB). Please compress your PDF.");
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Convert File to base64 string
  const fileToBase64 = (fileObj: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileObj);
      reader.onload = () => {
        const base64Str = reader.result as string;
        // Strip out metadata header, e.g., "data:application/pdf;base64,"
        const pureBase64 = base64Str.split(",")[1];
        resolve(pureBase64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Trigger stage transitions during analysis loader
  const startStageTransitions = () => {
    setStageIndex(0);
    stageTimerRef.current = setInterval(() => {
      setStageIndex((prev) => {
        if (prev < ANALYSIS_STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 4500);
  };

  const stopStageTransitions = () => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
    }
  };

  // Execute full analysis
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUsername.trim()) {
      setError("GitHub username is required.");
      return;
    }
    if (!file) {
      setError("Please drag or select your resume PDF to cross-reference.");
      return;
    }

    setLoading(true);
    setError(null);
    startStageTransitions();

    try {
      const base64PDF = await fileToBase64(file);
      
      const payload = {
        githubUsername: githubUsername.trim(),
        resumeBase64: base64PDF,
        resumeFileName: file.name,
        resumeMimeType: file.type
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        onAnalysisSuccess(data, githubUsername.trim(), file.name);
      } else {
        setError(data.error || "Analysis failed. Please check your inputs or try again.");
      }
    } catch (err: any) {
      setError("Connection to the AI Service timed out. Make sure your server is online.");
    } finally {
      setLoading(false);
      stopStageTransitions();
    }
  };

  // Trigger interview question generation
  const handleGenerateQuestions = async () => {
    if (!analysisResult) return;
    setQuestionGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/interview/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisResult })
      });

      const questions = await response.json();

      if (response.ok) {
        onQuestionsGenerated(questions);
        onNavigate("interview");
      } else {
        setError(questions.error || "Failed to generate tailored interview questions.");
      }
    } catch (err) {
      setError("Failed to reach interview builder engine. Retry.");
    } finally {
      setQuestionGenerating(false);
    }
  };

  return (
    <div id="analyze-page" className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <div className="border-b border-white/5 pb-6">
        <h1 className="font-display font-bold text-3xl text-white tracking-tight">
          Portfolio Analysis Node
        </h1>
        <p className="text-gray-400 mt-1">
          Bridge your claim definitions (Resume) with your practical evidence (GitHub repos).
        </p>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          /* Loading overlay with progressive stages */
          <motion.div 
            key="analysis-loading"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-brand-card/30 border border-white/5 rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-8 glass-panel min-h-[400px] flex flex-col justify-center items-center"
          >
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-brand-primary/10 border-t-brand-primary animate-spin" />
              <Sparkles className="absolute w-6 h-6 text-brand-primary animate-pulse" />
            </div>

            <div className="space-y-3">
              <h3 className="text-white font-display font-bold text-xl">Analyzing Portfolio Evidence</h3>
              <p className="text-xs text-brand-primary font-mono uppercase tracking-widest animate-pulse">
                Step {stageIndex + 1} of {ANALYSIS_STAGES.length}
              </p>
            </div>

            {/* Stage Progress line */}
            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden max-w-md">
              <div 
                className="bg-brand-primary h-full transition-all duration-1000 ease-out"
                style={{ width: `${((stageIndex + 1) / ANALYSIS_STAGES.length) * 100}%` }}
              />
            </div>

            {/* Multi-stage descriptions */}
            <div className="h-10 max-w-lg mx-auto flex items-center justify-center">
              <p className="text-sm text-gray-400 leading-relaxed font-sans italic">
                "{ANALYSIS_STAGES[stageIndex]}"
              </p>
            </div>
          </motion.div>
        ) : !analysisResult ? (
          /* Initial Configuration Form */
          <motion.form 
            key="analysis-setup"
            onSubmit={handleAnalyze}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {/* Form Inputs: GitHub Username + File Drop */}
            <div className="lg:col-span-7 space-y-6 bg-brand-card/25 border border-white/5 p-6 rounded-2xl">
              <h3 className="text-lg font-display font-semibold text-white mb-4">Input Profile Anchors</h3>

              {/* GitHub Username Input */}
              <div className="space-y-2">
                <label htmlFor="github-user-input" className="block text-xs font-mono uppercase tracking-wider text-gray-400">
                  GitHub Username
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-gray-500 font-mono text-sm">@</span>
                  <input
                    id="github-user-input"
                    type="text"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="your-username"
                    className="w-full bg-brand-bg border border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-hidden focus:border-brand-primary font-mono text-sm"
                  />
                </div>
                <p className="text-[10px] text-gray-500 font-mono">
                  We'll pull public repositories, folder scopes, languages, and readmes.
                </p>
              </div>

              {/* PDF File Uploader */}
              <div className="space-y-2">
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-400">
                  Upload Resume (PDF ONLY)
                </label>
                
                {file ? (
                  /* Uploaded state indicator */
                  <div className="flex items-center justify-between p-4 bg-brand-bg border border-brand-primary/20 rounded-xl">
                    <div className="flex items-center space-x-3 truncate">
                      <div className="p-2.5 bg-brand-primary/10 rounded-lg">
                        <FileText className="w-5 h-5 text-brand-primary" />
                      </div>
                      <div className="truncate text-left">
                        <div className="text-sm font-medium text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={removeFile}
                      className="p-1.5 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Drag and Drop Zone */
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      dragActive 
                        ? "border-brand-primary bg-brand-primary/5" 
                        : "border-white/10 hover:border-brand-primary/30 bg-brand-bg/50"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="application/pdf"
                      className="hidden"
                    />
                    <UploadCloud className="w-10 h-10 text-gray-500 mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-300">Drag & drop your PDF resume here, or <span className="text-brand-primary hover:underline">browse</span></p>
                    <p className="text-xs text-gray-500 font-mono mt-1.5 uppercase">Supports PDFs up to 10MB</p>
                  </div>
                )}
              </div>

              {/* Feedback Alert box */}
              {error && (
                <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-xl flex items-start space-x-3 text-red-400 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Execute Action */}
              <button
                type="submit"
                className="w-full py-4 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl flex items-center justify-center space-x-2 neon-glow-btn cursor-pointer"
                id="btn-execute-analysis"
              >
                <Sparkles className="w-4 h-4 fill-brand-bg text-brand-bg" />
                <span>Perform Alignment Scan</span>
              </button>
            </div>

            {/* Sidebar guidance */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-4 text-left">
                <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 pb-2 border-b border-white/5">
                  How Gemini Audits Your Portfolio
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Gemini Flash uses integrated vision-and-document schemas to interpret layouts, texts, dates, and technology classifications. 
                </p>
                <ul className="text-xs text-gray-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <CheckCircle className="w-3.5 h-3.5 text-brand-primary shrink-0 mt-0.5" />
                    <span><strong>No OCR loss</strong>: Multi-column tables and dates are parsed natively.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CheckCircle className="w-3.5 h-3.5 text-brand-primary shrink-0 mt-0.5" />
                    <span><strong>Fact Auditing</strong>: Claims on your resume are mapped directly against active public codes found in your GitHub repositories.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <CheckCircle className="w-3.5 h-3.5 text-brand-primary shrink-0 mt-0.5" />
                    <span><strong>Actionable reports</strong>: Suggestions highlight missing libraries, modular debt, or portfolio documentation gaps.</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 bg-brand-card/10 border border-white/5 rounded-2xl text-left flex items-start space-x-3">
                <Lock className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <strong>Privacy First</strong>: All scanned parameters and transcripts are kept in localized transient session stores and used only for your active evaluation. No code or files are ingested into global model weights.
                </p>
              </div>
            </div>
          </motion.form>
        ) : (
          /* Profile Analysis Results display */
          <motion.div 
            key="analysis-completed"
            className="space-y-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Combined Metrics Showcase */}
            <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center text-left">
              <div className="md:col-span-4 flex flex-col items-center border-b md:border-b-0 md:border-r border-white/5 pb-6 md:pb-0 md:pr-6">
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="56"
                      cy="56"
                      r="48"
                      className="stroke-white/5 stroke-[8] fill-none"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r="48"
                      className="stroke-brand-primary stroke-[8] fill-none"
                      strokeDasharray={301.6}
                      strokeDashoffset={301.6 - (301.6 * analysisResult.crossReference.alignmentScore) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute font-display font-bold text-2xl text-white">
                    {analysisResult.crossReference.alignmentScore}%
                  </span>
                </div>
                <h4 className="font-display font-semibold text-white mt-4 text-center">Portfolio Evidence Score</h4>
                <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider text-center mt-1">Cross-Reference Accuracy</p>
              </div>

              <div className="md:col-span-8 space-y-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-white">{analysisResult.parsedResume.name || "Student profile"}</h3>
                  <p className="text-xs text-brand-primary font-mono mt-0.5 uppercase">Integration Audit Completed Successfully</p>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Your portfolio alignment has been diagnosed. Gemini mapped your claimed frameworks, academic achievements, and projects against codebases scanned on GitHub under the alias <span className="text-brand-primary font-mono">@{studentProfile.githubUsername}</span>.
                </p>

                {/* Big Action CTA */}
                <div className="pt-2">
                  <button
                    onClick={handleGenerateQuestions}
                    disabled={questionGenerating}
                    className="px-6 py-4 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl flex items-center space-x-2 neon-glow-btn cursor-pointer disabled:opacity-50"
                  >
                    {questionGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Structuring Technical Questions...</span>
                      </>
                    ) : (
                      <>
                        <span>Generate Interview Questions</span>
                        <ArrowRight className="w-4 h-4 text-brand-bg" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Resume vs GitHub Claims comparison bento-grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
              {/* Claims verification column */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-6">
                  <div className="flex items-center space-x-2 pb-4 border-b border-white/5">
                    <TrendingUp className="w-5 h-5 text-brand-primary" />
                    <h4 className="text-base font-display font-semibold text-white">Portfolio Cross-Reference Audit</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Proven claims list */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">✓ VERIFIED CLAIMS</span>
                      <ul className="space-y-2.5">
                        {analysisResult.crossReference.provenClaims.map((claim, idx) => (
                          <li key={idx} className="flex items-start text-xs text-gray-300 leading-normal">
                            <span className="text-emerald-500 font-bold mr-2 shrink-0">•</span>
                            <span>{claim}</span>
                          </li>
                        ))}
                        {analysisResult.crossReference.provenClaims.length === 0 && (
                          <li className="text-xs text-gray-500 italic">No direct verifying evidence found.</li>
                        )}
                      </ul>
                    </div>

                    {/* Unproven claims list */}
                    <div className="space-y-4">
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">⚠ UNPROVEN CLAIMS</span>
                      <ul className="space-y-2.5">
                        {analysisResult.crossReference.unprovenClaims.map((claim, idx) => (
                          <li key={idx} className="flex items-start text-xs text-gray-300 leading-normal">
                            <span className="text-amber-500 font-bold mr-2 shrink-0">•</span>
                            <span>{claim}</span>
                          </li>
                        ))}
                        {analysisResult.crossReference.unprovenClaims.length === 0 && (
                          <li className="text-xs text-gray-500 italic">Excellent! All major portfolio claims align.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Suggestions report */}
                <div className="bg-brand-card/25 border border-white/5 p-6 rounded-2xl space-y-4">
                  <h4 className="text-sm font-display font-semibold text-white">Actionable Portfolio Recommendations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysisResult.crossReference.suggestions.map((sug, idx) => (
                      <div key={idx} className="p-4 bg-brand-bg/50 border border-white/5 rounded-xl text-xs text-gray-300 leading-relaxed flex items-start">
                        <span className="text-brand-primary font-bold mr-2">#{idx+1}</span>
                        <span>{sug}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Connected Repositories / Stack Summary */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 pb-2 border-b border-white/5">
                    GitHub Active Stack
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.githubAnalysis.primaryStack.map((st, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-white/5 text-[10px] text-gray-300 font-mono rounded">
                        {st}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-brand-card/25 border border-white/5 p-5 rounded-2xl space-y-4">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 pb-2 border-b border-white/5">
                    Connected Public Repos
                  </h4>
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
                    {analysisResult.githubAnalysis.repos.map((repo, idx) => (
                      <div key={idx} className="p-3 bg-brand-bg/50 border border-white/5 rounded-xl text-left space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white truncate max-w-[150px]">{repo.name}</span>
                          <span className="text-[9px] font-mono text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded uppercase">{repo.primaryLanguage}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{repo.description}</p>
                      </div>
                    ))}
                    {analysisResult.githubAnalysis.repos.length === 0 && (
                      <div className="text-xs text-gray-500 italic py-4 text-center">No repositories scanned.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
