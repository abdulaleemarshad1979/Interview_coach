import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import DashboardPage from "./components/DashboardPage";
import AnalyzePage from "./components/AnalyzePage";
import InterviewPage from "./components/InterviewPage";
import ReportPage from "./components/ReportPage";

import CustomCursor from "./components/effects/CustomCursor";
import GroupDiscussionPage from "./components/GroupDiscussionPage";
import FacultyDashboardPage from "./components/FacultyDashboardPage";
import { StudentProfile, FacultyProfile, FullAnalysisResult, InterviewQuestion, Scorecard } from "./types";
import { supabase } from "./lib/supabaseClient";
import ProfilePage from "./components/ProfilePage";


export default function App() {
  const [currentView, setCurrentView] = useState<string>("landing");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [facultyProfile, setFacultyProfile] = useState<FacultyProfile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scorecardHistory, setScorecardHistory] = useState<Scorecard[]>([]);

  // Sync basic student details from college portal API using Roll Number
  const syncCollegeProfile = async (rollNo: string, currentProfile: StudentProfile | null, force: boolean = false) => {
    try {
      if (!force && currentProfile?.isSynced && currentProfile?.name) {
        console.log(`[Sync bypass] Profile is already synced for Roll No: ${rollNo}`);
        return;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const portalPwd = localStorage.getItem("portal_pwd");
      let res;

      if (portalPwd) {
        console.log(`[Background Sync] Syncing profile details from college portal API for Roll No: ${rollNo}`);
        res = await fetch("/api/college/sync-portal", {
          method: "POST",
          headers,
          body: JSON.stringify({ rollNo, password: portalPwd })
        });
      } else {
        console.log(`[Fallback Sync] Syncing profile from college API (no password cached) for Roll No: ${rollNo}`);
        res = await fetch(`/api/college/student/${rollNo}`, {
          headers
        });
      }

      if (res.ok) {
        const collegeData = await res.json();
        if (collegeData && collegeData.studentId === rollNo) {
          const mergedProfile: StudentProfile = {
            ...currentProfile,
            ...collegeData,
            classSection: currentProfile?.classSection || collegeData.classSection,
            githubUsername: currentProfile?.githubUsername || collegeData.githubUsername,
            resumeFileName: currentProfile?.resumeFileName || collegeData.resumeFileName,
            profileImage: currentProfile?.profileImage || collegeData.profileImage,
          };
          
          setStudentProfile(mergedProfile);
          localStorage.setItem(`studentProfile_${rollNo}`, JSON.stringify(mergedProfile));
          localStorage.setItem("studentProfile", JSON.stringify(mergedProfile));

          // Also try saving/updating Supabase user metadata if signed in
          await supabase.auth.updateUser({
            data: {
              student_name: mergedProfile.name,
              class_section: mergedProfile.classSection,
              department: mergedProfile.department,
              academic_year: mergedProfile.academicYear,
              attendance: mergedProfile.attendance,
              profile_image: mergedProfile.profileImage,
              college_assessments: mergedProfile.collegeAssessments,
              is_synced: mergedProfile.isSynced
            }
          });

          // Also upsert directly to public.profiles table
          const sessionUser = session.data.session?.user;
          if (sessionUser) {
            await supabase.from("profiles").upsert({
              id: sessionUser.id,
              roll_number: mergedProfile.studentId,
              name: mergedProfile.name,
              student_name: mergedProfile.name,
              class_section: mergedProfile.classSection,
              section: mergedProfile.classSection,
              department: mergedProfile.department,
              branch: mergedProfile.department,
              attendance: mergedProfile.attendance,
              college_assessments: mergedProfile.collegeAssessments,
              is_synced: mergedProfile.isSynced,
              github_username: mergedProfile.githubUsername,
              resume_file_name: mergedProfile.resumeFileName,
              updated_at: new Date().toISOString(),
              profile_image: mergedProfile.profileImage,
              avatar_url: mergedProfile.profileImage
            });
          }
        }
      } else if (res.status === 401) {
        // Clear expired/invalid cached portal credentials
        localStorage.removeItem("portal_pwd");
      }
    } catch (e) {
      console.error("Failed to sync profile from college database", e);
    }
  };

  const checkAndClearStudentCache = (userId: string) => {
    const cachedUserId = localStorage.getItem("current_user_id");
    if (cachedUserId !== userId) {
      console.log("New user ID detected or cache reset. Clearing student cache...");
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith("studentProfile") ||
          key.startsWith("analysisResult") ||
          key.startsWith("interviewQuestions") ||
          key.startsWith("scorecard") ||
          key.startsWith("assignedInterview") ||
          key.startsWith("assignedGD") ||
          key.startsWith("portal_pwd")
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
    localStorage.setItem("current_user_id", userId);
  };

  // Listen to Supabase Auth Changes on boot
  useEffect(() => {
    // Check current Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const isFacultyUser = session.user.user_metadata?.is_faculty || false;

        if (isFacultyUser) {
          const facProfile: FacultyProfile = {
            facultyId: session.user.user_metadata?.faculty_name || "PROCTOR",
            name: session.user.user_metadata?.faculty_name || "Proctor",
            email: session.user.email || "",
            department: session.user.user_metadata?.department || "CSE",
            classSection: session.user.user_metadata?.class_section || "Section A",
            rollPrefix: session.user.user_metadata?.roll_prefix || "24P31A12",
            rollStart: session.user.user_metadata?.roll_start || 1,
            rollEnd: session.user.user_metadata?.roll_end || 30,
            isFaculty: true,
          };
          setFacultyProfile(facProfile);
          setStudentProfile(null);
          setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
        } else {
          const userRollNo = session.user.user_metadata?.roll_number || session.user.email?.split("@")[0].toUpperCase() || "STUDENT";
          checkAndClearStudentCache(session.user.id);
          const profile: StudentProfile = {
            studentId: userRollNo,
            githubUsername: session.user.user_metadata?.github_username,
            resumeFileName: session.user.user_metadata?.resume_file_name,
            name: session.user.user_metadata?.student_name,
            classSection: session.user.user_metadata?.class_section,
            department: session.user.user_metadata?.department || session.user.user_metadata?.branch || "Information Technology",
            academicYear: session.user.user_metadata?.academic_year,
            attendance: session.user.user_metadata?.attendance,
            profileImage: session.user.user_metadata?.profile_image,
            collegeAssessments: session.user.user_metadata?.college_assessments,
            isSynced: session.user.user_metadata?.is_synced,
          };

          const storedInterview = localStorage.getItem(`assignedInterview_${userRollNo}`);
          const storedGD = localStorage.getItem(`assignedGD_${userRollNo}`);
          if (storedInterview) {
            try {
              const parsed = JSON.parse(storedInterview);
              profile.assignedInterviewTopic = parsed.topic;
              profile.assignedInterviewDifficulty = parsed.difficulty;
            } catch {}
          }
          if (storedGD) {
            try {
              const parsed = JSON.parse(storedGD);
              profile.assignedGDTopic = parsed.topic;
              profile.assignedGDRoomCode = parsed.roomCode;
            } catch {}
          }

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
          setFacultyProfile(null);
          setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
          syncCollegeProfile(userRollNo, profile);
        }
      }
    });

    // Listen to changes in authentication state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        const isFacultyUser = session.user.user_metadata?.is_faculty || false;

        if (isFacultyUser) {
          const facProfile: FacultyProfile = {
            facultyId: session.user.user_metadata?.faculty_name || "PROCTOR",
            name: session.user.user_metadata?.faculty_name || "Proctor",
            email: session.user.email || "",
            department: session.user.user_metadata?.department || "CSE",
            classSection: session.user.user_metadata?.class_section || "Section A",
            rollPrefix: session.user.user_metadata?.roll_prefix || "24P31A12",
            rollStart: session.user.user_metadata?.roll_start || 1,
            rollEnd: session.user.user_metadata?.roll_end || 30,
            isFaculty: true,
          };
          setFacultyProfile(facProfile);
          setStudentProfile(null);
          setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
        } else {
          const userRollNo = session.user.user_metadata?.roll_number || session.user.email?.split("@")[0].toUpperCase() || "STUDENT";
          checkAndClearStudentCache(session.user.id);
          const profile: StudentProfile = {
            studentId: userRollNo,
            githubUsername: session.user.user_metadata?.github_username,
            resumeFileName: session.user.user_metadata?.resume_file_name,
            name: session.user.user_metadata?.student_name,
            classSection: session.user.user_metadata?.class_section,
            department: session.user.user_metadata?.department || session.user.user_metadata?.branch || "Information Technology",
            academicYear: session.user.user_metadata?.academic_year,
            attendance: session.user.user_metadata?.attendance,
            profileImage: session.user.user_metadata?.profile_image,
            collegeAssessments: session.user.user_metadata?.college_assessments,
            isSynced: session.user.user_metadata?.is_synced,
          };

          const storedInterview = localStorage.getItem(`assignedInterview_${userRollNo}`);
          const storedGD = localStorage.getItem(`assignedGD_${userRollNo}`);
          if (storedInterview) {
            try {
              const parsed = JSON.parse(storedInterview);
              profile.assignedInterviewTopic = parsed.topic;
              profile.assignedInterviewDifficulty = parsed.difficulty;
            } catch {}
          }
          if (storedGD) {
            try {
              const parsed = JSON.parse(storedGD);
              profile.assignedGDTopic = parsed.topic;
              profile.assignedGDRoomCode = parsed.roomCode;
            } catch {}
          }

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
          setFacultyProfile(null);
          setCurrentView((prev) => (prev === "landing" || prev === "login" ? "dashboard" : prev));
          syncCollegeProfile(userRollNo, profile);
        }
      } else {
        setStudentProfile(null);
        setFacultyProfile(null);
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
        const storedHistory = localStorage.getItem(`scorecardHistory_${studentId}`);

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
          const parsed = JSON.parse(storedScorecard);
          setScorecard(parsed);
          localStorage.setItem(`scorecard_${studentId}`, storedScorecard);
        } else {
          setScorecard(null);
        }

        if (storedHistory) {
          setScorecardHistory(JSON.parse(storedHistory));
        } else if (storedScorecard) {
          const parsed = JSON.parse(storedScorecard);
          setScorecardHistory([parsed]);
          localStorage.setItem(`scorecardHistory_${studentId}`, JSON.stringify([parsed]));
        } else {
          setScorecardHistory([]);
        }
      } catch (e) {
        console.error("Failed to parse local storage cache for user", studentId, e);
      }
    } else {
      setAnalysisResult(null);
      setInterviewQuestions([]);
      setScorecard(null);
      setScorecardHistory([]);
    }
  }, [studentProfile]);

  // Login Success Event
  const handleLoginSuccess = (displayName: string, email?: string) => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const isFacultyUser = user.user_metadata?.is_faculty || false;
        if (isFacultyUser) {
          const facProfile: FacultyProfile = {
            facultyId: user.user_metadata?.faculty_name || displayName,
            name: user.user_metadata?.faculty_name || displayName,
            email: user.email || email || "",
            department: user.user_metadata?.department || "CSE",
            classSection: user.user_metadata?.class_section || "Section A",
            rollPrefix: user.user_metadata?.roll_prefix || "24P31A12",
            rollStart: user.user_metadata?.roll_start || 1,
            rollEnd: user.user_metadata?.roll_end || 30,
            isFaculty: true,
          };
          setFacultyProfile(facProfile);
          setStudentProfile(null);
          localStorage.setItem("facultyProfile", JSON.stringify(facProfile));
        } else {
          const userRollNo = user.user_metadata?.roll_number || displayName;
          const profile: StudentProfile = {
            studentId: userRollNo,
            githubUsername: user.user_metadata?.github_username,
            resumeFileName: user.user_metadata?.resume_file_name,
            name: user.user_metadata?.student_name || displayName,
            classSection: user.user_metadata?.class_section || "Section A",
            department: user.user_metadata?.department || user.user_metadata?.branch || "Information Technology",
            academicYear: user.user_metadata?.academic_year || "2nd Year",
            attendance: user.user_metadata?.attendance || 82,
            profileImage: user.user_metadata?.profile_image,
            collegeAssessments: user.user_metadata?.college_assessments,
            isSynced: user.user_metadata?.is_synced,
          };

          const storedInterview = localStorage.getItem(`assignedInterview_${userRollNo}`);
          const storedGD = localStorage.getItem(`assignedGD_${userRollNo}`);
          if (storedInterview) {
            try {
              const parsed = JSON.parse(storedInterview);
              profile.assignedInterviewTopic = parsed.topic;
              profile.assignedInterviewDifficulty = parsed.difficulty;
            } catch {}
          }
          if (storedGD) {
            try {
              const parsed = JSON.parse(storedGD);
              profile.assignedGDTopic = parsed.topic;
              profile.assignedGDRoomCode = parsed.roomCode;
            } catch {}
          }

          setStudentProfile(profile);
          setFacultyProfile(null);
          localStorage.setItem("studentProfile", JSON.stringify(profile));
          localStorage.setItem(`studentProfile_${userRollNo}`, JSON.stringify(profile));
          syncCollegeProfile(userRollNo, profile);
        }
        setCurrentView("dashboard");
      }
    });
  };


  // Logout Event
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setStudentProfile(null);
    setFacultyProfile(null);
    setAnalysisResult(null);
    setInterviewQuestions([]);
    setScorecard(null);
    setScorecardHistory([]);

    // Clear ALL student cache keys from localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith("studentProfile") ||
        key.startsWith("analysisResult") ||
        key.startsWith("interviewQuestions") ||
        key.startsWith("scorecard") ||
        key.startsWith("assignedInterview") ||
        key.startsWith("assignedGD") ||
        key.startsWith("portal_pwd")
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem("current_user_id");

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

      // Also upsert directly to public.profiles table
      const session = await supabase.auth.getSession();
      const sessionUser = session.data.session?.user;
      if (sessionUser) {
        await supabase.from("profiles").upsert({
          id: sessionUser.id,
          github_username: githubUser,
          resume_file_name: fileName,
          updated_at: new Date().toISOString()
        });
      }
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
      
      setScorecardHistory((prev) => {
        const updated = [scorecardReport, ...prev.filter((h) => h.id !== scorecardReport.id)];
        localStorage.setItem(`scorecardHistory_${studentProfile.studentId}`, JSON.stringify(updated));
        return updated;
      });
    }
  };

  // View-switching router logic
  const renderActiveView = () => {
    switch (currentView) {
      case "landing":
        return (
          <LandingPage
            onNavigate={setCurrentView}
            isLoggedIn={!!studentProfile || !!facultyProfile}
          />
        );
      case "login":
        return (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
          />
        );
      case "dashboard":
        if (facultyProfile) {
          return (
            <FacultyDashboardPage
              facultyProfile={facultyProfile}
              onNavigate={setCurrentView}
            />
          );
        }
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
        if (facultyProfile) {
          return (
            <GroupDiscussionPage
              studentProfile={{ studentId: facultyProfile.facultyId, name: facultyProfile.name } as any}
              onNavigate={setCurrentView}
            />
          );
        }
        return studentProfile ? (
          <GroupDiscussionPage
            studentProfile={studentProfile}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );

      case "profile":
        return studentProfile ? (
          <ProfilePage
            studentProfile={studentProfile}
            scorecard={scorecard}
            scorecardHistory={scorecardHistory}
            onSyncPortalDetails={async (password: string) => {
              localStorage.setItem("portal_pwd", password);
              try {
                await syncCollegeProfile(studentProfile.studentId, studentProfile, true);
                const activeProfileStr = localStorage.getItem(`studentProfile_${studentProfile.studentId}`);
                if (activeProfileStr) {
                  const activeProfile = JSON.parse(activeProfileStr);
                  if (activeProfile.isSynced) {
                    return true;
                  }
                }
                return false;
              } catch (err) {
                return false;
              }
            }}
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

              // Also upsert directly to public.profiles table
              supabase.auth.getSession().then(({ data: { session } }) => {
                if (session?.user) {
                  supabase.from("profiles").upsert({
                    id: session.user.id,
                    roll_number: updatedProfile.studentId,
                    name: updatedProfile.name,
                    student_name: updatedProfile.name,
                    class_section: updatedProfile.classSection,
                    section: updatedProfile.classSection,
                    department: updatedProfile.department,
                    branch: updatedProfile.department,
                    attendance: updatedProfile.attendance,
                    college_assessments: updatedProfile.collegeAssessments,
                    is_synced: updatedProfile.isSynced,
                    github_username: updatedProfile.githubUsername,
                    resume_file_name: updatedProfile.resumeFileName,
                    updated_at: new Date().toISOString()
                  }).then(({ error }) => {
                    if (error) console.error("Error upserting profile table:", error);
                  });
                }
              });
            }}
            onNavigate={setCurrentView}
          />
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        );
      default:
        return (
          <LandingPage
            onNavigate={setCurrentView}
            isLoggedIn={!!studentProfile || !!facultyProfile}
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
        facultyProfile={facultyProfile}
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

// Modified by Frontend Engineer agent for Task run-3e9897-IC-103 at 2026-07-07 11:13:39
