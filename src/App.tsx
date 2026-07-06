import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import DashboardPage from "./components/DashboardPage";
import AnalyzePage from "./components/AnalyzePage";
import InterviewPage from "./components/InterviewPage";
import ReportPage from "./components/ReportPage";
import SettingsPage from "./components/SettingsPage";
import { StudentProfile, FullAnalysisResult, InterviewQuestion, Scorecard } from "./types";

export default function App() {
  const [currentView, setCurrentView] = useState<string>("landing");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);

  // Load state from local storage on bootstrap
  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem("studentProfile");
      const storedAnalysis = localStorage.getItem("analysisResult");
      const storedQuestions = localStorage.getItem("interviewQuestions");
      const storedScorecard = localStorage.getItem("scorecard");

      if (storedProfile) {
        setStudentProfile(JSON.parse(storedProfile));
        setCurrentView("dashboard"); // Auto-navigate to dashboard if logged in
      }
      if (storedAnalysis) {
        setAnalysisResult(JSON.parse(storedAnalysis));
      }
      if (storedQuestions) {
        setInterviewQuestions(JSON.parse(storedQuestions));
      }
      if (storedScorecard) {
        setScorecard(JSON.parse(storedScorecard));
      }
    } catch (e) {
      console.error("Failed to parse local storage cache", e);
    }
  }, []);

  // Login Success Event
  const handleLoginSuccess = (studentId: string) => {
    const profile: StudentProfile = { studentId };
    setStudentProfile(profile);
    localStorage.setItem("studentProfile", JSON.stringify(profile));
    setCurrentView("dashboard");
  };

  // Logout Event
  const handleLogout = () => {
    setStudentProfile(null);
    setAnalysisResult(null);
    setInterviewQuestions([]);
    setScorecard(null);
    
    // Clear cache
    localStorage.removeItem("studentProfile");
    localStorage.removeItem("analysisResult");
    localStorage.removeItem("interviewQuestions");
    localStorage.removeItem("scorecard");
    
    setCurrentView("landing");
  };

  // Analysis success callback
  const handleAnalysisSuccess = (result: FullAnalysisResult, githubUser: string, fileName: string) => {
    setAnalysisResult(result);
    localStorage.setItem("analysisResult", JSON.stringify(result));

    if (studentProfile) {
      const updatedProfile: StudentProfile = {
        ...studentProfile,
        githubUsername: githubUser,
        resumeFileName: fileName
      };
      setStudentProfile(updatedProfile);
      localStorage.setItem("studentProfile", JSON.stringify(updatedProfile));
    }
  };

  // Questions generation callback
  const handleQuestionsGenerated = (questions: InterviewQuestion[]) => {
    setInterviewQuestions(questions);
    localStorage.setItem("interviewQuestions", JSON.stringify(questions));
  };

  // Scorecard completed callback
  const handleInterviewComplete = (scorecardReport: Scorecard) => {
    setScorecard(scorecardReport);
    localStorage.setItem("scorecard", JSON.stringify(scorecardReport));
  };

  // View-switching router logic
  const renderActiveView = () => {
    switch (currentView) {
      case "landing":
        return (
          <LandingPage 
            onNavigate={setCurrentView} 
            isLoggedIn={!!studentProfile} 
          />
        );
      case "login":
        return (
          <LoginPage 
            onLoginSuccess={handleLoginSuccess} 
          />
        );
      case "dashboard":
        return studentProfile ? (
          <DashboardPage
            studentProfile={studentProfile}
            scorecard={scorecard}
            analysisResult={analysisResult}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );
      case "analyze":
        return studentProfile ? (
          <AnalyzePage
            studentProfile={studentProfile}
            analysisResult={analysisResult}
            onAnalysisSuccess={handleAnalysisSuccess}
            onQuestionsGenerated={handleQuestionsGenerated}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );
      case "interview":
        return studentProfile ? (
          <InterviewPage
            studentProfile={studentProfile}
            analysisResult={analysisResult}
            interviewQuestions={interviewQuestions}
            onInterviewComplete={handleInterviewComplete}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );
      case "report":
        return (
          <ReportPage
            scorecard={scorecard}
            onNavigate={setCurrentView}
          />
        );
      case "settings":
        return studentProfile ? (
          <SettingsPage
            studentProfile={studentProfile}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );
      default:
        return (
          <LandingPage 
            onNavigate={setCurrentView} 
            isLoggedIn={!!studentProfile} 
          />
        );
    }
  };

  // Modern subtle page transition settings
  const pageTransitionVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div id="main-app-container" className="min-h-screen bg-brand-bg text-gray-100 flex flex-col font-sans selection:bg-brand-primary selection:text-brand-bg relative antialiased">
      {/* Universal header navigation */}
      <Navbar 
        studentProfile={studentProfile}
        currentView={currentView}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
      />

      {/* Primary animated main stage content */}
      <main className="flex-1 w-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full h-full"
          >
            {renderActiveView()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
