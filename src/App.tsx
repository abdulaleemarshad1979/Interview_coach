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
import CustomCursor from "./components/effects/CustomCursor";
import GroupDiscussionPage from "./components/GroupDiscussionPage";
import { StudentProfile, FullAnalysisResult, InterviewQuestion, Scorecard } from "./types";
import { supabase } from "./lib/supabaseClient";
import ProfileModal from "./components/ProfileModal";


export default function App() {
  const [currentView, setCurrentView] = useState<string>("landing");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);


  // Listen to Supabase Auth Changes on boot
  useEffect(() => {
    // Check current Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const userRollNo = session.user.user_metadata?.roll_number || session.user.email?.split("@")[0].toUpperCase() || "STUDENT";
        const profile: StudentProfile = {
          studentId: userRollNo,
          githubUsername: session.user.user_metadata?.github_username,
          resumeFileName: session.user.user_metadata?.resume_file_name,
          name: session.user.user_metadata?.student_name,
          classSection: session.user.user_metadata?.class_section,
          department: session.user.user_metadata?.department,
          academicYear: session.user.user_metadata?.academic_year,
          attendance: session.user.user_metadata?.attendance,
          profileImage: session.user.user_metadata?.profile_image,
          collegeAssessments: session.user.user_metadata?.college_assessments,
          isSynced: session.user.user_metadata?.is_synced,
        };

        const storedProfileStr = localStorage.getItem(`studentProfile_${userRollNo}`) || localStorage.getItem("studentProfile");
        if (storedProfileStr) {
          try {
            const storedProfile = JSON.parse(storedProfileStr);
            if (storedProfile.studentId === userRollNo) {
              Object.assign(profile, storedProfile);
            }
          } catch (e) {}
        }

        setStudentProfile(profile);
        setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
      }
    });

    // Listen to changes in authentication state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        const userRollNo = session.user.user_metadata?.roll_number || session.user.email?.split("@")[0].toUpperCase() || "STUDENT";
        const profile: StudentProfile = {
          studentId: userRollNo,
          githubUsername: session.user.user_metadata?.github_username,
          resumeFileName: session.user.user_metadata?.resume_file_name,
          name: session.user.user_metadata?.student_name,
          classSection: session.user.user_metadata?.class_section,
          department: session.user.user_metadata?.department,
          academicYear: session.user.user_metadata?.academic_year,
          attendance: session.user.user_metadata?.attendance,
          profileImage: session.user.user_metadata?.profile_image,
          collegeAssessments: session.user.user_metadata?.college_assessments,
          isSynced: session.user.user_metadata?.is_synced,
        };

        const storedProfileStr = localStorage.getItem(`studentProfile_${userRollNo}`) || localStorage.getItem("studentProfile");
        if (storedProfileStr) {
          try {
            const storedProfile = JSON.parse(storedProfileStr);
            if (storedProfile.studentId === userRollNo) {
              Object.assign(profile, storedProfile);
            }
          } catch (e) {}
        }

        setStudentProfile(profile);
        setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
      } else {
        setStudentProfile(null);
        setCurrentView((prev) => (prev === "landing" ? "landing" : "landing"));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);


  // Sync user-specific data from local storage when student profile changes
  useEffect(() => {
    if (studentProfile) {
      const studentId = studentProfile.studentId;
      try {
        const storedAnalysis = localStorage.getItem(`analysisResult_${studentId}`) || localStorage.getItem("analysisResult");
        const storedQuestions = localStorage.getItem(`interviewQuestions_${studentId}`) || localStorage.getItem("interviewQuestions");
        const storedScorecard = localStorage.getItem(`scorecard_${studentId}`) || localStorage.getItem("scorecard");

        if (storedAnalysis) {
          setAnalysisResult(JSON.parse(storedAnalysis));
          localStorage.setItem(`analysisResult_${studentId}`, storedAnalysis);
        } else {
          setAnalysisResult(null);
        }

        if (storedQuestions) {
          setInterviewQuestions(JSON.parse(storedQuestions));
          localStorage.setItem(`interviewQuestions_${studentId}`, storedQuestions);
        } else {
          setInterviewQuestions([]);
        }

        if (storedScorecard) {
          setScorecard(JSON.parse(storedScorecard));
          localStorage.setItem(`scorecard_${studentId}`, storedScorecard);
        } else {
          setScorecard(null);
        }
      } catch (e) {
        console.error("Failed to parse local storage cache for user", studentId, e);
      }
    } else {
      setAnalysisResult(null);
      setInterviewQuestions([]);
      setScorecard(null);
    }
  }, [studentProfile]);

  // Login Success Event
  const handleLoginSuccess = (studentId: string, email?: string) => {
    let profile: StudentProfile = { studentId };
    const storedProfileStr = localStorage.getItem(`studentProfile_${studentId}`) || localStorage.getItem("studentProfile");
    if (storedProfileStr) {
      try {
        const storedProfile = JSON.parse(storedProfileStr);
        if (storedProfile.studentId === studentId) {
          profile = storedProfile;
        }
      } catch (e) {}
    }
    setStudentProfile(profile);
    localStorage.setItem("studentProfile", JSON.stringify(profile));
    localStorage.setItem(`studentProfile_${studentId}`, JSON.stringify(profile));
    setCurrentView("dashboard");
  };


  // Logout Event
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setStudentProfile(null);
    setAnalysisResult(null);
    setInterviewQuestions([]);
    setScorecard(null);
    setIsProfileModalOpen(false);

    // Clear generic cache only
    localStorage.removeItem("studentProfile");
    localStorage.removeItem("analysisResult");
    localStorage.removeItem("interviewQuestions");
    localStorage.removeItem("scorecard");

    setCurrentView("landing");
  };



  // Analysis success callback
  const handleAnalysisSuccess = async (result: FullAnalysisResult, githubUser: string, fileName: string) => {
    setAnalysisResult(result);
    localStorage.setItem("analysisResult", JSON.stringify(result));
    if (studentProfile) {
      localStorage.setItem(`analysisResult_${studentProfile.studentId}`, JSON.stringify(result));
    }

    if (studentProfile) {
      const updatedProfile: StudentProfile = {
        ...studentProfile,
        githubUsername: githubUser,
        resumeFileName: fileName
      };
      setStudentProfile(updatedProfile);
      localStorage.setItem("studentProfile", JSON.stringify(updatedProfile));
    }

    try {
      await supabase.auth.updateUser({
        data: {
          github_username: githubUser,
          resume_file_name: fileName
        }
      });
    } catch (e) {
      console.error("Failed to update user metadata in Supabase", e);
    }
  };

  // Questions generation callback
  const handleQuestionsGenerated = (questions: InterviewQuestion[]) => {
    setInterviewQuestions(questions);
    localStorage.setItem("interviewQuestions", JSON.stringify(questions));
    if (studentProfile) {
      localStorage.setItem(`interviewQuestions_${studentProfile.studentId}`, JSON.stringify(questions));
    }
  };

  // Scorecard completed callback
  const handleInterviewComplete = (scorecardReport: Scorecard) => {
    setScorecard(scorecardReport);
    localStorage.setItem("scorecard", JSON.stringify(scorecardReport));
    if (studentProfile) {
      localStorage.setItem(`scorecard_${studentProfile.studentId}`, JSON.stringify(scorecardReport));
    }
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
      case "group-discussion":
        return studentProfile ? (
          <GroupDiscussionPage
            studentProfile={studentProfile}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
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
      <CustomCursor />
      {/* Universal header navigation */}
      <Navbar
        studentProfile={studentProfile}
        currentView={currentView}
        onNavigate={setCurrentView}
        onLogout={handleLogout}
        onOpenProfile={() => setIsProfileModalOpen(true)}
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

      {/* College Sync Profile Modal overlays */}
      {studentProfile && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          studentProfile={studentProfile}
          onProfileUpdate={(updatedProfile) => {
            setStudentProfile(updatedProfile);
            localStorage.setItem("studentProfile", JSON.stringify(updatedProfile));
            localStorage.setItem(`studentProfile_${updatedProfile.studentId}`, JSON.stringify(updatedProfile));
            
            // Try updating Supabase User metadata if authenticated
            supabase.auth.updateUser({
              data: {
                student_name: updatedProfile.name,
                class_section: updatedProfile.classSection,
                department: updatedProfile.department,
                academic_year: updatedProfile.academicYear,
                attendance: updatedProfile.attendance,
                profile_image: updatedProfile.profileImage,
                college_assessments: updatedProfile.collegeAssessments,
                is_synced: updatedProfile.isSynced
              }
            }).catch(e => console.error("Error saving updated profile to supabase metadata", e));
          }}
          scorecard={scorecard}
        />
      )}
    </div>

  );
}

// Modified by Frontend Engineer agent for Task run-3e9897-IC-103 at 2026-07-07 11:13:39
