import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Fingerprint, Check, Star, AlertCircle, GraduationCap, CheckCircle2, Lock, User } from "lucide-react";
import InputField from "./ui/InputField";
import Button from "./ui/Button";
import { supabase } from "../lib/supabaseClient";

interface LoginPageProps {
  onLoginSuccess: (studentId: string, email?: string) => void;
}

const isValidCollegeEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  const domain = email.split("@")[1].toLowerCase();

  const isEdu = domain.endsWith(".edu") ||
    domain.endsWith(".edu.in") ||
    domain.endsWith(".ac.in") ||
    domain.endsWith(".ac.uk") ||
    domain.endsWith(".edu.co") ||
    domain.endsWith(".edu.mx") ||
    domain.endsWith(".edu.br") ||
    domain.endsWith(".edu.sg") ||
    domain.endsWith(".edu.ph") ||
    domain.endsWith(".ac.nz") ||
    domain.endsWith(".ac.za") ||
    domain.endsWith(".edu.au");

  const publicDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "zoho.com", "mail.com", "gmx.com", "yandex.com"];
  if (publicDomains.includes(domain)) {
    return false;
  }

  return isEdu || domain.includes("college") || domain.includes("university") || domain.includes("univ") || domain.includes("school");
};

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isFacultyPortal, setIsFacultyPortal] = useState(false);
  const [rollNo, setRollNo] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentBranch, setStudentBranch] = useState("");
  const [studentSection, setStudentSection] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Faculty states
  const [facultyName, setFacultyName] = useState("");
  const [department, setDepartment] = useState("");
  const [classSection, setClassSection] = useState("");
  const [rollPrefix, setRollPrefix] = useState("24P31A12");
  const [rollStart, setRollStart] = useState("1");
  const [rollEnd, setRollEnd] = useState("30");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailTyping = email.length > 0;
  const emailValid = emailTyping && isValidCollegeEmail(email);
  const isPublicEmail = emailTyping && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !emailValid;
  const emailError = isPublicEmail ? "Must use an official college email address." : undefined;

  const confirmPasswordTyping = confirmPassword.length > 0;
  const confirmPasswordError = isSignUp && confirmPasswordTyping && confirmPassword !== password
    ? "Passwords do not match."
    : undefined;

  const syncOnLogin = async (userRollNo: string, pass: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const syncRes = await fetch("/api/college/sync-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ rollNo: userRollNo, password: pass })
      });
      if (syncRes.ok) {
        const syncedProfile = await syncRes.json();
        localStorage.setItem(`studentProfile_${userRollNo}`, JSON.stringify(syncedProfile));
        localStorage.setItem("studentProfile", JSON.stringify(syncedProfile));
        
        await supabase.auth.updateUser({
          data: {
            student_name: syncedProfile.name,
            class_section: syncedProfile.classSection,
            department: syncedProfile.department,
            academic_year: syncedProfile.academicYear,
            attendance: syncedProfile.attendance,
            profile_image: syncedProfile.profileImage,
            is_synced: true
          }
        });
      }
    } catch (e) {
      console.error("Auto sync on login failed", e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFacultyPortal) {
      // Student Gateway Unified Auth
      const cleanRollNo = rollNo.trim().toUpperCase();
      if (!cleanRollNo) {
        setError("Please enter your Roll Number.");
        return;
      }
      if (cleanRollNo.length < 4) {
        setError("Roll Number must be at least 4 characters long.");
        return;
      }
      if (!password) {
        setError("Please enter your ECAP Password.");
        return;
      }

      setLoading(true);
      setError(null);
      setSuccessMessage("Verifying credentials with Aditya Student Portal...");

      try {
        // 1. Verify credentials and sync details from college website scraper
        const syncRes = await fetch("/api/college/auth-sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rollNo: cleanRollNo, password })
        });

        if (!syncRes.ok) {
          const errMsg = await syncRes.json().catch(() => ({ error: "Verification failed." }));
          setError(errMsg.error || "Authentication failed. Invalid Roll Number or Portal Password.");
          setLoading(false);
          return;
        }

        const syncedProfile = await syncRes.json();
        setSuccessMessage("Credentials verified! Connecting to gateway...");

        // 2. Map student credentials to Supabase
        const mappedEmail = `${cleanRollNo.toLowerCase()}@aec.edu.in`;

        // Try signing in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: mappedEmail,
          password: password,
        });

        if (!signInError && signInData.user) {
          // User exists, signed in successfully!
          setSuccessMessage("Successfully logged in! Fetching portal details...");
          
          // Save synced details to localStorage
          localStorage.setItem(`studentProfile_${cleanRollNo}`, JSON.stringify(syncedProfile));
          localStorage.setItem("studentProfile", JSON.stringify(syncedProfile));
          localStorage.setItem("portal_pwd", password);

          // Update user metadata in Supabase
          await supabase.auth.updateUser({
            data: {
              student_name: syncedProfile.name,
              class_section: syncedProfile.classSection,
              department: syncedProfile.department,
              branch: syncedProfile.department,
              academic_year: syncedProfile.academicYear,
              attendance: syncedProfile.attendance,
              profile_image: syncedProfile.profileImage,
              is_synced: true
            }
          });

          onLoginSuccess(cleanRollNo, mappedEmail);
          return;
        }

        // If signIn failed (e.g. user does not exist), try signing up!
        setSuccessMessage("Creating new student account on the gateway...");
        const metaData = {
          is_faculty: false,
          roll_number: cleanRollNo,
          student_name: syncedProfile.name,
          branch: syncedProfile.department,
          department: syncedProfile.department,
          class_section: syncedProfile.classSection,
          academic_year: syncedProfile.academicYear,
          attendance: syncedProfile.attendance,
          profile_image: syncedProfile.profileImage,
          is_synced: true
        };

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: mappedEmail,
          password: password,
          options: {
            data: metaData,
          },
        });

        if (signUpError) {
          if (signUpError.message.includes("already registered") || signUpError.message.includes("already exists")) {
            setError("This Roll Number is already registered, but the password entered does not match our records.");
          } else {
            setError(signUpError.message);
          }
          setLoading(false);
          return;
        }

        if (signUpData.user) {
          if (signUpData.session) {
            setSuccessMessage("Account created successfully! Syncing details...");
            localStorage.setItem(`studentProfile_${cleanRollNo}`, JSON.stringify(syncedProfile));
            localStorage.setItem("studentProfile", JSON.stringify(syncedProfile));
            localStorage.setItem("portal_pwd", password);
            setTimeout(() => {
              onLoginSuccess(cleanRollNo, mappedEmail);
            }, 1000);
          } else {
            setSuccessMessage("Account registered on gateway! Please verify your student profile at next sign in.");
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.error("Student Gateway Auth error:", err);
        setError("Unable to connect to the authentication server. Please check your connection.");
        setLoading(false);
      }
      return;
    }

    // Faculty (Proctor) auth flow
    if (isSignUp) {
      if (!facultyName.trim()) {
        setError("Please enter your Name.");
        return;
      }
      if (!department.trim()) {
        setError("Please enter your Department.");
        return;
      }
      if (!classSection.trim()) {
        setError("Please enter your Class Section.");
        return;
      }
      if (!rollPrefix.trim()) {
        setError("Please enter Roll Prefix.");
        return;
      }
      if (!rollStart.trim() || isNaN(Number(rollStart))) {
        setError("Please enter a valid start roll number range.");
        return;
      }
      if (!rollEnd.trim() || isNaN(Number(rollEnd))) {
        setError("Please enter a valid end roll number range.");
        return;
      }
    }

    if (!email.trim() || !isValidCollegeEmail(email)) {
      setError("Please enter a valid college email address.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }

    if (isSignUp) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (isSignUp) {
        const metaData = {
          is_faculty: true,
          faculty_name: facultyName.trim(),
          department: department.trim(),
          class_section: classSection.trim(),
          roll_prefix: rollPrefix.trim(),
          roll_start: parseInt(rollStart, 10),
          roll_end: parseInt(rollEnd, 10),
        };

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: metaData,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        if (data.user) {
          if (data.session) {
            setSuccessMessage("Account created successfully!");
            setTimeout(() => {
              onLoginSuccess(facultyName.trim(), email);
            }, 1000);
          } else {
            setSuccessMessage("Account created! Please check your email to verify your registration, then sign in.");
            setLoading(false);
          }
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }

        if (data.user) {
          const isFacultyUser = data.user.user_metadata?.is_faculty || false;
          if (isFacultyUser) {
            const displayName = data.user.user_metadata?.faculty_name || "Faculty Member";
            onLoginSuccess(displayName, data.user.email);
          } else {
            const userRollNo = data.user.user_metadata?.roll_number || email.split("@")[0].toUpperCase();
            setSuccessMessage("Logging in and syncing student details from portal...");
            await syncOnLogin(userRollNo, password);
            onLoginSuccess(userRollNo, data.user.email);
          }
        }
      }
    } catch (err: any) {
      setError("Unable to connect to the authentication server. Please check your connection.");
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-white flex text-slate-800 font-sans selection:bg-brand-primary/30 overflow-y-auto lg:overflow-hidden relative">
      {/* Left Panel (Desktop only) */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="hidden lg:flex lg:w-[45%] bg-slate-50 border-r border-slate-200/60 p-16 flex-col justify-between relative text-left"
      >
        {/* Logo */}
        <div className="absolute top-12 left-12 flex items-center gap-3 select-none">
          <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-slate-200/50 shadow-xs">
            <img
              src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg"
              alt="Aditya University Logo"
              className="h-10 object-contain"
            />
            <div className="h-6 w-[1.5px] bg-slate-200" />
            <img
              src="https://www.adityauniversity.in/public/frontend/assets/images/naac-logo.svg"
              alt="NAAC Logo"
              className="h-9 object-contain"
            />
          </div>
        </div>

        {/* Center Brand Content */}
        <div className="my-auto flex flex-col gap-8 max-w-sm mt-32">
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold text-brand-primary tracking-[2px] uppercase font-mono">
              AI-Powered Mock Gateway
            </span>
            <h1 className="text-5xl font-bold font-sans text-slate-900 tracking-tight leading-none">
              Your interview.
              <br />
              <span className="text-brand-accent">Perfected.</span>
            </h1>
          </div>

          <p className="text-[15px] leading-relaxed text-[#64748B] max-w-[340px] font-sans">
            Upload your resume, verify your code projects via GitHub, and practice technical speech rounds in real-time.
          </p>

          <ul className="flex flex-col gap-3">
            {[
              "Real-time audio speech simulator",
              "Instant resume claim diagnostics",
              "Automated scorecard & model answers"
            ].map((item, idx) => (
              <li key={idx} className="flex items-center gap-2.5 text-sm text-[#475569] font-sans">
                <span className="w-5 h-5 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-brand-primary" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom Review */}
        <div className="flex flex-col gap-2 mt-auto">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-3.5 h-3.5 fill-[#F59E0B] text-[#F59E0B]" />
            ))}
          </div>
          <p className="text-[14px] italic text-[#475569] leading-relaxed font-sans">
            "The low-latency audio feedback felt exactly like mock interviewing with an elite lead tech recruiter."
          </p>
          <span className="text-xs font-semibold text-[#475569] uppercase tracking-wider font-mono">
            — Arjun Prasad, B.Tech CSE, Aditya University
          </span>
        </div>
      </motion.div>

      {/* Right Panel (Form) */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16 relative">
        {/* Glowing backdrop spheres */}
        <div className="absolute top-1/4 right-1/4 w-80 h-80 rounded-full bg-accent-blue/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-accent-cyan/5 blur-[120px] pointer-events-none" />

        {/* Login/Signup Container Card */}
        <div className="w-full max-w-[420px] relative z-10 text-left">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.08
                }
              }
            }}
            className="lg:bg-transparent bg-slate-50 border border-slate-200/60 lg:border-none p-8 lg:p-0 rounded-[20px] backdrop-blur-xl lg:backdrop-blur-none"
          >
            {/* Mobile Header Only */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
              }}
              className="lg:hidden flex items-center gap-3 mb-6 select-none"
            >
              <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-slate-200/50 shadow-xs">
                <img
                  src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg"
                  alt="Aditya University Logo"
                  className="h-8 object-contain"
                />
              </div>
              <span className="font-bold text-lg tracking-tight font-sans text-slate-800 uppercase">
                Interview<span className="text-brand-primary font-medium">Coach</span>
              </span>
            </motion.div>

            {/* Main Header */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
              }}
              className="flex flex-col mb-4"
            >
              <h2 className="text-3xl font-bold font-sans tracking-tight text-slate-900">
                {isFacultyPortal 
                  ? (isSignUp ? "Create Proctor Account" : "Proctor Portal") 
                  : "Student Gateway"}
              </h2>
              <p className="text-[15px] text-[#64748B] mt-1.5 font-sans">
                {isFacultyPortal 
                  ? (isSignUp ? "Register as a faculty proctor" : "Access the proctor dashboard and supervise students") 
                  : "Sign in with your Aditya Student Portal (ECAP) credentials."}
              </p>
            </motion.div>

            {/* Portal Selection Toggle */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 15 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
              }}
              className="mb-4"
            >
              <div className="bg-slate-100 border border-slate-200 rounded-[10px] p-1 flex relative overflow-hidden">
                {([false, true] as const).map((facultyVal) => (
                  <button
                    key={facultyVal ? "faculty" : "student"}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setIsFacultyPortal(facultyVal);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-center text-xs font-semibold font-sans rounded-[8px] transition-colors relative z-10 select-none cursor-pointer disabled:opacity-50 ${isFacultyPortal === facultyVal ? 'text-slate-800' : 'text-[#64748B]'
                      }`}
                  >
                    {facultyVal ? 'Proctor Portal' : 'Student Gateway'}
                    {isFacultyPortal === facultyVal && (
                      <motion.div
                        layoutId="activePortalIndicator"
                        className="absolute inset-0 bg-white shadow-xs border border-slate-200 rounded-[8px] -z-10"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Sliding Switch Tabs (Only for Proctor/Faculty Portal) */}
            {isFacultyPortal && (
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 15 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                }}
                className="mb-6"
              >
                <div className="bg-slate-100 border border-slate-200 rounded-[10px] p-1 flex relative overflow-hidden">
                  {([false, true] as const).map((signupVal) => (
                    <button
                      key={signupVal ? "signup" : "login"}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setIsSignUp(signupVal);
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      className={`flex-1 py-2 text-center text-sm font-medium font-sans rounded-[8px] transition-colors relative z-10 select-none cursor-pointer disabled:opacity-50 ${isSignUp === signupVal ? 'text-slate-800' : 'text-[#64748B]'
                        }`}
                      data-interactive="true"
                    >
                      {signupVal ? 'Create Account' : 'Sign In'}
                      {isSignUp === signupVal && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute inset-0 bg-white shadow-xs border border-slate-200 rounded-[8px] -z-10"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Proctor signup extra fields */}
              {isFacultyPortal ? (
                <>
                  {/* Proctor signup extra fields */}
                  {isSignUp && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4 overflow-hidden"
                    >
                      <InputField
                        label="Full Name"
                        type="text"
                        placeholder="e.g. Dr. Ramesh Kumar"
                        value={facultyName}
                        onChange={(val) => {
                          setFacultyName(val);
                          setError(null);
                        }}
                        disabled={loading}
                        icon={User}
                        required
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <InputField
                          label="Department"
                          type="text"
                          placeholder="e.g. CSE"
                          value={department}
                          onChange={(val) => {
                            setDepartment(val);
                            setError(null);
                          }}
                          disabled={loading}
                          icon={GraduationCap}
                          required
                        />
                        <InputField
                          label="Class Section"
                          type="text"
                          placeholder="e.g. Section A"
                          value={classSection}
                          onChange={(val) => {
                            setClassSection(val);
                            setError(null);
                          }}
                          disabled={loading}
                          icon={GraduationCap}
                          required
                        />
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 flex flex-col gap-2.5">
                        <span className="text-xs font-semibold text-slate-700 block">Supervised Student Roll Range</span>
                        <div className="grid grid-cols-3 gap-2">
                          <InputField
                            label="Prefix"
                            type="text"
                            placeholder="e.g. 24P31A12"
                            value={rollPrefix}
                            onChange={(val) => {
                              setRollPrefix(val);
                              setError(null);
                            }}
                            disabled={loading}
                            required
                          />
                          <InputField
                            label="Start No"
                            type="text"
                            placeholder="1"
                            value={rollStart}
                            onChange={(val) => {
                              setRollStart(val);
                              setError(null);
                            }}
                            disabled={loading}
                            required
                          />
                          <InputField
                            label="End No"
                            type="text"
                            placeholder="30"
                            value={rollEnd}
                            onChange={(val) => {
                              setRollEnd(val);
                              setError(null);
                            }}
                            disabled={loading}
                            required
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* College Email Input */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 15 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                    }}
                  >
                    <InputField
                      label="College Email Address"
                      type="email"
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(val) => {
                        setEmail(val);
                        setError(null);
                      }}
                      disabled={loading}
                      error={emailError}
                      icon={Mail}
                      required
                    />

                    {isSignUp && emailValid && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center space-x-1 mt-2 text-[11px] text-emerald-400 font-sans pl-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>College email verified.</span>
                      </motion.div>
                    )}
                  </motion.div>

                  {/* Password Input */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 15 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                    }}
                  >
                    <InputField
                      label="Password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(val) => {
                        setPassword(val);
                        setError(null);
                      }}
                      disabled={loading}
                      icon={Lock}
                      required
                    />
                  </motion.div>

                  {/* Dynamic Confirm Password Field */}
                  <AnimatePresence initial={false}>
                    {isSignUp && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <InputField
                          label="Confirm Password"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(val) => {
                            setConfirmPassword(val);
                            setError(null);
                          }}
                          disabled={loading}
                          error={confirmPasswordError}
                          icon={Lock}
                          required
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  {/* Student Roll Number Input */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 15 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                    }}
                  >
                    <InputField
                      label="Student Roll Number"
                      type="text"
                      placeholder="e.g. 24P31A1234"
                      value={rollNo}
                      onChange={(val) => {
                        setRollNo(val);
                        setError(null);
                      }}
                      disabled={loading}
                      icon={User}
                      required
                    />
                  </motion.div>

                  {/* Student Portal Password (ECAP) Input */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 15 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                    }}
                  >
                    <InputField
                      label="ECAP Password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(val) => {
                        setPassword(val);
                        setError(null);
                      }}
                      disabled={loading}
                      icon={Lock}
                      required
                    />
                  </motion.div>
                </>
              )}

              {/* Error messages */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="bg-red-500/8 border border-red-500/20 rounded-[8px] p-3 flex items-center gap-2.5 text-red-400 text-sm font-sans"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success messages */}
              <AnimatePresence mode="wait">
                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="bg-emerald-500/8 border border-emerald-500/20 rounded-[8px] p-3 flex items-center gap-2.5 text-emerald-400 text-sm font-sans"
                  >
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400 animate-pulse" />
                    <span>{successMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit trigger button */}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 15 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
                }}
                className="mt-2"
              >
                <Button
                  type="submit"
                  loading={loading}
                  disabled={loading || (isFacultyPortal && isSignUp && (!emailValid || confirmPassword !== password)) || (!isFacultyPortal && (!rollNo.trim() || !password))}
                  className="w-full h-12 rounded-[10px] text-sm font-bold bg-brand-primary hover:bg-blue-600 border border-transparent text-white shadow-md badge-white-text"
                  data-interactive="true"
                >
                  {isFacultyPortal ? (isSignUp ? "Register Account" : "Enter Portal") : "Enter Portal"}
                </Button>
              </motion.div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
