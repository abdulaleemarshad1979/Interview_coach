import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch } from "../lib/api";
import {
  GraduationCap,
  Users,
  Award,
  Activity,
  User,
  Plus,
  BookOpen,
  Calendar,
  Search,
  CheckCircle,
  Clock,
  Video,
  ChevronRight,
  TrendingUp,
  FileCheck2,
  AlertCircle,
  Filter,
  CheckCircle2,
  X,
  Play,
  Briefcase,
  Building2,
  FileText,
  Sparkles,
  Layers,
  Send
} from "lucide-react";
import { FacultyProfile, StudentProfile, Scorecard, CompanyPlacementDrive } from "../types";
import Button from "./ui/Button";

interface FacultyDashboardPageProps {
  facultyProfile: FacultyProfile;
  onNavigate: (view: string) => void;
}

interface SimulatedStudent extends StudentProfile {
  assignedInterview?: {
    topic: string;
    difficulty: string;
    companyName?: string;
    roleTitle?: string;
    assignedAt: string;
    completed: boolean;
    score?: number;
  };
  assignedGD?: {
    roomCode: string;
    topic: string;
    assignedAt: string;
    completed: boolean;
  };
}

const PRESET_COMPANY_DRIVES: CompanyPlacementDrive[] = [
  {
    id: "drive_tcs_digital",
    companyName: "TCS Digital",
    roleTitle: "Full Stack SDE / Systems Engineer",
    driveType: "Campus Placement",
    description: "Tata Consultancy Services Digital track campus placement drive assessing clean architecture, database indexing, communication clarity, and teamwork conflict resolution.",
    materialText: "TCS Digital technical and HR round syllabus: Focus on clean code, database query optimization, modular frontend architecture, STAR structured behavioral communication, and agile team collaboration.",
    requiredSkills: ["JavaScript / TypeScript", "React / Node.js", "SQL & Database Indexing", "STAR Problem Solving", "Teamwork & Conflict Resolution"],
    sampleQuestions: [
      "Can you walk us through the architecture of your primary web application and explain how you handled state management and data consistency?",
      "In a high-load web application, how do you prevent race conditions or database bottlenecks during concurrent writes?",
      "Describe a situation in a team project where you had a disagreement regarding technical stack or task distribution. How did you resolve it?"
    ]
  },
  {
    id: "drive_amazon_aws",
    companyName: "Amazon (AWS)",
    roleTitle: "SDE / Cloud Solutions Architect",
    driveType: "Campus Placement",
    description: "Amazon campus placement drive assessing Amazon Leadership Principles (Customer Obsession, Ownership, Bias for Action), distributed systems, and resilience.",
    materialText: "Amazon campus recruitment guidelines: Evaluates deep ownership, bias for action under tight deadlines, high-availability cloud architecture, and STAR structured answers with quantifiable results.",
    requiredSkills: ["Distributed Systems", "Cloud & Microservices", "Amazon Leadership Principles", "STAR Methodology", "Failure Handling"],
    sampleQuestions: [
      "Tell me about a time when you took ownership of a challenging bug or architecture problem without waiting for someone to assign it to you.",
      "How would you design a distributed cache or rate limiter to protect downstream services during traffic spikes?",
      "Describe a time when you made a decision with incomplete information. What was the outcome and what did you learn?"
    ]
  },
  {
    id: "drive_google_swe",
    companyName: "Google",
    roleTitle: "Software Engineer (SWE)",
    driveType: "Campus Placement",
    description: "Google campus drive assessing algorithmic depth, computational tradeoffs, Googleyness (growth mindset, empathy), and high-clarity technical communication.",
    materialText: "Google engineering hiring standards: High focus on algorithmic complexity tradeoffs, clean code structure, receptive listening to feedback, and collaborative problem breakdown.",
    requiredSkills: ["Data Structures & Algorithms", "System Tradeoffs", "Googleyness & Empathy", "Algorithmic Complexity", "Clear Communication"],
    sampleQuestions: [
      "How do you evaluate tradeoffs between memory consumption and execution time in complex data processing pipelines?",
      "Can you explain how a hash map or balanced tree operates internally to someone unfamiliar with computer science?",
      "Tell me about a time you received critical feedback on your code or design. How did you process it and grow?"
    ]
  },
  {
    id: "drive_deloitte_tech",
    companyName: "Deloitte",
    roleTitle: "Technology Analyst & Solutions Consultant",
    driveType: "Campus Placement",
    description: "Deloitte campus placement round assessing client-facing communication, executive business presentation, requirement structuring, and situational leadership.",
    materialText: "Deloitte consulting assessment criteria: Evaluates translating technical complexity into clear business value, presentation poise, active listening, and structured case solving.",
    requiredSkills: ["Client Communication", "Business Requirement Translation", "Presentation Skills", "Analytical Problem Solving", "Situational Leadership"],
    sampleQuestions: [
      "How do you explain a complex technical outage or database migration delay to non-technical business stakeholders?",
      "Walk me through how you would prioritize features when a client has conflicting business deadlines.",
      "Describe a situation where you led a team or presentation during an academic or client project."
    ]
  },
  {
    id: "drive_qualcomm_embedded",
    companyName: "Qualcomm",
    roleTitle: "Embedded Systems & Firmware Engineer",
    driveType: "Campus Placement",
    description: "Qualcomm campus hiring assessment evaluating memory management, real-time operating systems, hardware-software integration, and structured troubleshooting.",
    materialText: "Qualcomm technical assessment guidelines: Evaluates low-level systems programming, memory constraints, debugging rigor, and precise communication of technical bottlenecks.",
    requiredSkills: ["C / C++", "Embedded Systems", "Memory Management", "Real-Time Constraints", "Technical Articulation"],
    sampleQuestions: [
      "How do you debug a race condition or memory leak in a memory-constrained embedded device?",
      "Explain the difference between polling and interrupt-driven I/O architectures to an incoming junior engineer.",
      "Tell me about a challenging bug in your hardware or software project that required multiple iterations to solve."
    ]
  }
];

export default function FacultyDashboardPage({ facultyProfile, onNavigate }: FacultyDashboardPageProps) {
  const [students, setStudents] = useState<SimulatedStudent[]>([]);
  const [isRealData, setIsRealData] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending" | "none">("all");
  const [selectedStudent, setSelectedStudent] = useState<SimulatedStudent | null>(null);
  
  // Modals state
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showCompanyDriveModal, setShowCompanyDriveModal] = useState(false);
  const [showGDModal, setShowGDModal] = useState(false);
  
  // Company Placement Drive Inputs
  const [selectedPresetId, setSelectedPresetId] = useState("drive_tcs_digital");
  const [companyName, setCompanyName] = useState("TCS Digital");
  const [roleTitle, setRoleTitle] = useState("Full Stack SDE / Systems Engineer");
  const [driveType, setDriveType] = useState<any>("Campus Placement");
  const [materialText, setMaterialText] = useState(
    "TCS Digital technical and HR round syllabus: Focus on clean code, database query optimization, modular frontend architecture, STAR structured behavioral communication, and agile team collaboration."
  );
  const [requiredSkillsStr, setRequiredSkillsStr] = useState("JavaScript, React, Node.js, SQL, STAR Communication, Conflict Resolution");
  const [assignDriveTarget, setAssignDriveTarget] = useState<"class" | "single">("class");

  // Assignment Inputs
  const [interviewTopic, setInterviewTopic] = useState("System Architecture");
  const [interviewDifficulty, setInterviewDifficulty] = useState("Intermediate");
  const [gdTopic, setGdTopic] = useState("Will AI and ChatGPT replace software engineers?");
  const [selectedGDStudentIds, setSelectedGDStudentIds] = useState<string[]>([]);
  const [assignTargetStudent, setAssignTargetStudent] = useState<SimulatedStudent | null>(null);

  // Live activity logs feed
  const [activities, setActivities] = useState<Array<{ id: string; time: string; roll: string; text: string; type: 'sync' | 'interview' | 'gd' | 'company' }>>([]);

  // Fetch supervised students
  useEffect(() => {
    const fetchStudents = async () => {
      setLoadingStudents(true);
      try {
        let data = null;
        try {
          const res = await apiFetch("/api/profiles");
          if (res.ok) {
            data = await res.json();
          }
        } catch (err) {
          console.warn("Could not query profiles from MongoDB", err);
        }

        const matched = (data || []).filter((row: any) => {
          const roll = (row.roll_number || "").toLowerCase().trim();
          if (!roll) return false;

          const localAssignStr = localStorage.getItem(`assigned_proctor_${row.roll_number}`);
          let assignedProctorId = row.assigned_proctor_id;

          if (localAssignStr) {
            try {
              const parsed = JSON.parse(localAssignStr);
              assignedProctorId = parsed.proctorId;
            } catch {}
          }

          return assignedProctorId === facultyProfile.facultyId || !assignedProctorId;
        }).map((row: any) => {
          const roll = row.roll_number || "Unknown";
          const name = row.name || row.student_name || `Student ${roll.slice(-2)}`;
          const attendance = row.attendance || 80;
          const branch = row.branch || "CSE";
          const classSectionVal = row.section || row.class_section || facultyProfile.classSection;
          const assessments = row.college_assessments || [];

          // Local assignments
          const localStoredInterview = localStorage.getItem(`assignedInterview_${roll}`);
          const localStoredCompanyDrive = localStorage.getItem(`assigned_company_drive_${roll}`);
          const localStoredGD = localStorage.getItem(`assignedGD_${roll}`);
          
          let assignedInterview = undefined;
          if (localStoredCompanyDrive) {
            try {
              const parsedDrive = JSON.parse(localStoredCompanyDrive);
              assignedInterview = {
                topic: `${parsedDrive.companyName} (${parsedDrive.roleTitle})`,
                difficulty: "Intermediate",
                companyName: parsedDrive.companyName,
                roleTitle: parsedDrive.roleTitle,
                assignedAt: parsedDrive.createdAt || "Today",
                completed: false
              };
            } catch {}
          } else if (localStoredInterview) {
            try {
              assignedInterview = JSON.parse(localStoredInterview);
            } catch {}
          }

          let assignedGD = undefined;
          if (localStoredGD) {
            try {
              assignedGD = JSON.parse(localStoredGD);
            } catch {}
          }

          const storedScorecard = localStorage.getItem(`scorecard_${roll}`);
          if (storedScorecard) {
            try {
              const parsed = JSON.parse(storedScorecard);
              if (assignedInterview) {
                assignedInterview.completed = true;
                assignedInterview.score = parsed.overallScore;
              }
            } catch {}
          }

          return {
            studentId: roll,
            name: name,
            classSection: classSectionVal,
            department: branch,
            attendance: attendance,
            isSynced: true,
            collegeAssessments: assessments.length > 0 ? assessments : [
              { examName: "Mid-Term 1 (Theory)", percentage: 82, marks: "32.8 / 40" },
              { examName: "Mid-Term 2 (Theory)", percentage: 88, marks: "35.2 / 40" },
              { examName: "Previous Semester GPA", percentage: 85, marks: "8.5 / 10.0 SGPA" }
            ],
            assignedInterview,
            assignedGD
          };
        });

        // Deduplicate
        const uniqueMatchedMap = new Map<string, any>();
        matched.forEach((student: any) => {
          uniqueMatchedMap.set(student.studentId, student);
        });
        const uniqueMatched = Array.from(uniqueMatchedMap.values());

        setStudents(uniqueMatched);
        setIsRealData(true);
        
        const initialActivities = uniqueMatched.slice(0, 3).map((s, idx) => ({
          id: `act_${idx}`,
          time: `${10 + idx}:${15 + idx * 7} AM`,
          roll: s.studentId,
          text: idx === 0 ? "synced credentials for Campus Placement" : idx === 1 ? "completed TCS Digital Mock Round" : "joined placement lobby",
          type: "sync" as const
        }));
        setActivities(initialActivities);

      } catch (err) {
        console.error("Error fetching students:", err);
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [facultyProfile]);

  // Select Preset Company Drive
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = PRESET_COMPANY_DRIVES.find(d => d.id === presetId);
    if (found) {
      setCompanyName(found.companyName);
      setRoleTitle(found.roleTitle);
      setDriveType(found.driveType);
      setMaterialText(found.materialText || "");
      setRequiredSkillsStr(found.requiredSkills.join(", "));
    }
  };

  // Handle Company Drive Assignment (Class-Wide or Single Student)
  const handleAssignCompanyDrive = () => {
    const drivePayload: CompanyPlacementDrive = {
      id: "drive_" + Math.random().toString(36).substring(2, 9),
      companyName,
      roleTitle,
      driveType,
      description: `Campus Placement Drive for ${companyName} (${roleTitle})`,
      materialText,
      requiredSkills: requiredSkillsStr.split(",").map(s => s.trim()).filter(Boolean),
      createdByFacultyName: facultyProfile.name,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      assignedSection: facultyProfile.classSection
    };

    if (assignDriveTarget === "class") {
      // Broadcast to all supervised students
      students.forEach(student => {
        localStorage.setItem(`assigned_company_drive_${student.studentId}`, JSON.stringify(drivePayload));
        localStorage.setItem(`assignedInterview_${student.studentId}`, JSON.stringify({
          topic: `${companyName} - ${roleTitle}`,
          difficulty: "Intermediate",
          companyName,
          roleTitle,
          assignedAt: drivePayload.createdAt,
          completed: false
        }));
      });

      const updated = students.map(s => ({
        ...s,
        assignedInterview: {
          topic: `${companyName} - ${roleTitle}`,
          difficulty: "Intermediate",
          companyName,
          roleTitle,
          assignedAt: drivePayload.createdAt || "Today",
          completed: false
        }
      }));
      setStudents(updated);

      const newLog = {
        id: "act_" + Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        roll: `${facultyProfile.classSection} (${students.length} students)`,
        text: `broadcast Company Placement Drive: '${companyName} (${roleTitle})'`,
        type: "company" as const
      };
      setActivities(prev => [newLog, ...prev]);

    } else if (assignTargetStudent) {
      // Assign to single student
      localStorage.setItem(`assigned_company_drive_${assignTargetStudent.studentId}`, JSON.stringify(drivePayload));
      localStorage.setItem(`assignedInterview_${assignTargetStudent.studentId}`, JSON.stringify({
        topic: `${companyName} - ${roleTitle}`,
        difficulty: "Intermediate",
        companyName,
        roleTitle,
        assignedAt: drivePayload.createdAt,
        completed: false
      }));

      const updated = students.map(s => {
        if (s.studentId === assignTargetStudent.studentId) {
          return {
            ...s,
            assignedInterview: {
              topic: `${companyName} - ${roleTitle}`,
              difficulty: "Intermediate",
              companyName,
              roleTitle,
              assignedAt: drivePayload.createdAt || "Today",
              completed: false
            }
          };
        }
        return s;
      });
      setStudents(updated);

      const newLog = {
        id: "act_" + Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        roll: assignTargetStudent.studentId,
        text: `assigned Company Placement Drive: '${companyName} (${roleTitle})'`,
        type: "company" as const
      };
      setActivities(prev => [newLog, ...prev]);
    }

    setShowCompanyDriveModal(false);
    setAssignTargetStudent(null);
  };

  // Handle single student topic interview assignment
  const handleAssignInterview = () => {
    if (!assignTargetStudent) return;
    
    const assignment = {
      topic: interviewTopic,
      difficulty: interviewDifficulty,
      assignedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completed: false
    };

    localStorage.setItem(`assignedInterview_${assignTargetStudent.studentId}`, JSON.stringify(assignment));
    
    const updatedStudents = students.map(s => {
      if (s.studentId === assignTargetStudent.studentId) {
        return {
          ...s,
          assignedInterview: assignment
        };
      }
      return s;
    });

    setStudents(updatedStudents);

    const newLog = {
      id: "act_" + Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      roll: assignTargetStudent.studentId,
      text: `assigned Interview Mock on '${interviewTopic}'`,
      type: "interview" as const
    };
    setActivities(prev => [newLog, ...prev]);

    setShowInterviewModal(false);
    setAssignTargetStudent(null);
  };

  // Handle multi-student GD assignment
  const handleAssignGD = () => {
    if (selectedGDStudentIds.length === 0) return;
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const gdAssignment = {
      roomCode,
      topic: gdTopic,
      assignedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completed: false
    };

    selectedGDStudentIds.forEach(roll => {
      localStorage.setItem(`assignedGD_${roll}`, JSON.stringify(gdAssignment));
    });

    const updatedStudents = students.map(s => {
      if (selectedGDStudentIds.includes(s.studentId)) {
        return {
          ...s,
          assignedGD: gdAssignment
        };
      }
      return s;
    });
    setStudents(updatedStudents);

    const newLog = {
      id: "act_" + Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      roll: `GD Room ${roomCode}`,
      text: `created room with ${selectedGDStudentIds.length} students on topic: '${gdTopic}'`,
      type: "gd" as const
    };
    setActivities(prev => [newLog, ...prev]);

    setShowGDModal(false);
    setSelectedGDStudentIds([]);
  };

  const toggleSelectStudentForGD = (roll: string) => {
    setSelectedGDStudentIds(prev => {
      if (prev.includes(roll)) {
        return prev.filter(r => r !== roll);
      } else {
        if (prev.length >= 15) {
          alert("A Group Discussion room is optimized for up to 15 students.");
          return prev;
        }
        return [...prev, roll];
      }
    });
  };

  const getAttendanceClass = (att: number) => {
    if (att >= 85) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (att >= 75) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-red-500 bg-red-500/10 border-red-500/20";
  };

  const getScorecardStatus = (s: SimulatedStudent) => {
    const stored = localStorage.getItem(`scorecard_${s.studentId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return { completed: true, score: parsed.overallScore, level: parsed.candidateLevel, company: parsed.companyDriveName };
      } catch {}
    }
    return { completed: false, score: null, level: null, company: null };
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.studentId.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.name || "").toLowerCase().includes(searchQuery.toLowerCase());
    
    const sc = getScorecardStatus(s);
    
    if (filterStatus === "completed") {
      return matchesSearch && sc.completed;
    }
    if (filterStatus === "pending") {
      return matchesSearch && (s.assignedInterview || s.assignedGD) && !sc.completed;
    }
    if (filterStatus === "none") {
      return matchesSearch && !s.assignedInterview && !s.assignedGD;
    }
    return matchesSearch;
  });

  return (
    <div id="faculty-dashboard-page" className="max-w-7xl mx-auto px-6 py-8 space-y-8 text-left">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200/60 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-display font-bold text-3xl text-slate-900 tracking-tight">
                Placement & Proctor Dashboard
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-sans">
                Logged in as <span className="font-semibold text-brand-primary">{facultyProfile.name}</span> &bull; {facultyProfile.department} Placement Coordinator
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Company Placement Drive & GD */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setAssignDriveTarget("class");
              setShowCompanyDriveModal(true);
            }}
            className="px-5 py-3 bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold rounded-xl text-xs flex items-center space-x-2 neon-glow-btn cursor-pointer shadow-md"
          >
            <Building2 className="w-4 h-4 text-brand-bg" />
            <span>🏢 Connect Company Placement Drive</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGDModal(true)}
            className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center space-x-2 cursor-pointer shadow-xs"
          >
            <Users className="w-4 h-4 text-brand-primary" />
            <span>Bulk Group Discussion</span>
          </button>
        </div>
      </div>

      {/* KPI Stats counters row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">Supervised Students</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">{students.length} Active</div>
            <span className="text-[10px] text-emerald-500 font-mono uppercase">Section: {facultyProfile.classSection}</span>
          </div>
        </div>

        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">Placement Drives</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">
              {students.filter(s => s.assignedInterview?.companyName).length} Enrolled
            </div>
            <span className="text-[10px] text-brand-primary font-mono font-semibold">TCS, Amazon, Google, etc.</span>
          </div>
        </div>

        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">Interviews Completed</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">
              {students.filter(s => getScorecardStatus(s).completed).length} / {students.length}
            </div>
            <span className="text-[10px] text-emerald-600 font-mono font-semibold">Dossiers Generated</span>
          </div>
        </div>

        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">SoftSkills Evaluation</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">
              {students.length > 0 ? (students.reduce((acc, curr) => acc + (curr.attendance || 80), 0) / students.length).toFixed(0) : "80"}%
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Class Communication Index</span>
          </div>
        </div>
      </div>

      {/* Main content layout: Left column = roster, Right column = live company placement feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column - Supervised student roster table */}
        <div className="lg:col-span-8 bg-brand-card border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-display font-bold text-slate-800">Supervised Student Roster</h3>
              <p className="text-xs text-slate-400 font-mono uppercase mt-0.5">Assign placement kits and track communication marks</p>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search roll or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e: any) => setFilterStatus(e.target.value)}
                className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed Dossiers</option>
                <option value="pending">Pending Drives</option>
                <option value="none">Unassigned</option>
              </select>
            </div>
          </div>

          {/* Student Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3.5 font-bold">Roll / Student</th>
                  <th className="p-3.5 font-bold">Class Section</th>
                  <th className="p-3.5 font-bold">Assigned Company Drive</th>
                  <th className="p-3.5 font-bold text-center">Scorecard</th>
                  <th className="p-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No students found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const status = getScorecardStatus(student);
                    return (
                      <tr key={student.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3.5">
                          <div className="font-mono font-bold text-slate-900">{student.studentId}</div>
                          <div className="text-slate-500 text-[11px] truncate max-w-[140px]">{student.name}</div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-600">
                          {student.classSection || facultyProfile.classSection}
                        </td>
                        <td className="p-3.5">
                          {student.assignedInterview?.companyName ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-700">
                              <Building2 className="w-3 h-3 text-amber-600" />
                              <span>{student.assignedInterview.companyName} ({student.assignedInterview.roleTitle?.split("/")[0] || "SDE"})</span>
                            </span>
                          ) : student.assignedInterview ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700">
                              <span>{student.assignedInterview.topic}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono italic">General Prep</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          {status.completed ? (
                            <span className="px-2.5 py-1 rounded-full font-mono font-bold text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              {status.score}% ({status.level})
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">Pending</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignTargetStudent(student);
                              setAssignDriveTarget("single");
                              setShowCompanyDriveModal(true);
                            }}
                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-500/20 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer inline-flex items-center space-x-1"
                            title="Assign Company Placement Drive"
                          >
                            <Building2 className="w-3 h-3" />
                            <span>Drive</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAssignTargetStudent(student);
                              setShowInterviewModal(true);
                            }}
                            className="px-2.5 py-1 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer"
                          >
                            Custom
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Company Placement Drive Presets & Live Activity */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Company Drives Card */}
          <div className="bg-brand-card border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-brand-primary" />
                <h4 className="text-sm font-display font-bold text-slate-800">Available Placement Kits</h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">5 Presets</span>
            </div>

            <div className="space-y-2.5">
              {PRESET_COMPANY_DRIVES.slice(0, 4).map((drive) => (
                <div
                  key={drive.id}
                  onClick={() => {
                    handleSelectPreset(drive.id);
                    setAssignDriveTarget("class");
                    setShowCompanyDriveModal(true);
                  }}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer space-y-1 text-left group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs group-hover:text-brand-primary transition-colors">
                      {drive.companyName}
                    </span>
                    <span className="text-[9px] font-mono uppercase bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                      {drive.driveType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{drive.roleTitle}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setAssignDriveTarget("class");
                setShowCompanyDriveModal(true);
              }}
              className="w-full py-2.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 font-bold rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create / Upload Custom Drive</span>
            </button>
          </div>

          {/* Activity Log Feed */}
          <div className="bg-brand-card border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-display font-bold text-slate-800">Placement Activity Feed</h4>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase">Live</span>
            </div>

            <div className="space-y-3">
              {activities.map((act) => (
                <div key={act.id} className="text-xs space-y-0.5 text-left border-l-2 border-brand-primary pl-2.5 py-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-800 text-[11px]">{act.roll}</span>
                    <span className="text-[10px] font-mono text-slate-400">{act.time}</span>
                  </div>
                  <p className="text-slate-500 text-[11px]">{act.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- COMPANY PLACEMENT DRIVE MODAL --- */}
      <AnimatePresence>
        {showCompanyDriveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCompanyDriveModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-2xl relative z-10 shadow-2xl overflow-hidden text-left max-h-[92vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-5 h-5 text-brand-primary" />
                  <div>
                    <h3 className="font-display font-bold text-lg text-slate-900">
                      Connect Company Placement Drive
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {assignDriveTarget === "class"
                        ? `Broadcast to all students in ${facultyProfile.classSection}`
                        : `Assign to student: ${assignTargetStudent?.name} (${assignTargetStudent?.studentId})`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCompanyDriveModal(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                {/* Preset Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Select Company Preset or Custom Drive</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRESET_COMPANY_DRIVES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectPreset(d.id)}
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedPresetId === d.id
                            ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <div className="text-xs truncate">{d.companyName}</div>
                        <div className="text-[10px] text-slate-400 truncate">{d.roleTitle.split("/")[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Company Name & Role */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Company Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. TCS Digital, Amazon, Google"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Target Role / Track</label>
                    <input
                      type="text"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="e.g. Full Stack SDE, Cloud Solutions"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                </div>

                {/* Company Materials / Job Description */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Company Material / Job Description / Round Syllabus
                  </label>
                  <textarea
                    rows={3}
                    value={materialText}
                    onChange={(e) => setMaterialText(e.target.value)}
                    placeholder="Paste the hiring material, syllabus, or round guidelines provided by the company..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary leading-relaxed"
                  />
                </div>

                {/* Required Skills */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Focus Skills (Comma separated)</label>
                  <input
                    type="text"
                    value={requiredSkillsStr}
                    onChange={(e) => setRequiredSkillsStr(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
                <div className="text-[11px] font-mono text-slate-400">
                  Target: <strong className="text-slate-800">{assignDriveTarget === "class" ? `Entire Section (${students.length} students)` : assignTargetStudent?.studentId}</strong>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setShowCompanyDriveModal(false)}
                    className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAssignCompanyDrive}
                    className="px-5 py-2 bg-linear-to-r from-brand-accent to-brand-primary hover:opacity-90 text-brand-bg text-xs font-bold rounded-lg cursor-pointer flex items-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-brand-bg" />
                    <span>{assignDriveTarget === "class" ? "Broadcast to Section" : "Assign to Student"}</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Custom Topic Interview Modal --- */}
      <AnimatePresence>
        {showInterviewModal && assignTargetStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowInterviewModal(false);
                setAssignTargetStudent(null);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md relative z-10 shadow-xl overflow-hidden text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <h3 className="font-display font-bold text-lg text-slate-800">Assign Custom Interview</h3>
                <button 
                  onClick={() => {
                    setShowInterviewModal(false);
                    setAssignTargetStudent(null);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Target Student</span>
                    <span className="font-semibold block text-slate-800 text-sm">{assignTargetStudent.name}</span>
                  </div>
                  <span className="font-mono font-bold text-xs text-brand-primary">{assignTargetStudent.studentId}</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Interview Topic</label>
                  <select
                    value={interviewTopic}
                    onChange={(e) => setInterviewTopic(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="System Architecture">System Architecture</option>
                    <option value="Data Structures & Algorithms">Data Structures & Algorithms</option>
                    <option value="Full Stack React/Node Developer">Full Stack React/Node Developer</option>
                    <option value="Python & AI/Machine Learning">Python & AI/Machine Learning</option>
                    <option value="Database Engineering (SQL/NoSQL)">Database Engineering (SQL/NoSQL)</option>
                    <option value="General Technical HR & Speech Round">General Technical HR & Speech Round</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    onClick={() => {
                      setShowInterviewModal(false);
                      setAssignTargetStudent(null);
                    }}
                    className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAssignInterview}
                    className="px-5 py-2 bg-brand-primary hover:bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer badge-white-text"
                  >
                    Assign Task
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Group Discussion Bulk Assignment Modal --- */}
      <AnimatePresence>
        {showGDModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowGDModal(false);
                setSelectedGDStudentIds([]);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-2xl relative z-10 shadow-xl overflow-hidden text-left flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-800">Bulk Assign Group Discussion</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Select up to 15 students to join a room</p>
                </div>
                <button 
                  onClick={() => {
                    setShowGDModal(false);
                    setSelectedGDStudentIds([]);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Discussion Topic</label>
                  <select
                    value={gdTopic}
                    onChange={(e) => setGdTopic(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="Will AI and ChatGPT replace software engineers?">Will AI and ChatGPT replace software engineers?</option>
                    <option value="Should engineering education prioritize coding skills over core theoretical foundations?">Should engineering education prioritize coding skills over core foundations?</option>
                    <option value="Remote work vs. Office work: Impact on team productivity and culture.">Remote work vs. Office work: Impact on team productivity</option>
                    <option value="Social media: A tool for true global connection or a source of social isolation?">Social media: A tool for connection or isolation?</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Select Students ({selectedGDStudentIds.length} selected - Max 15)</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedGDStudentIds.length === 15) {
                          setSelectedGDStudentIds([]);
                        } else {
                          setSelectedGDStudentIds(students.slice(0, 15).map(s => s.studentId));
                        }
                      }}
                      className="text-[10px] text-brand-primary hover:underline font-mono uppercase"
                    >
                      {selectedGDStudentIds.length === 15 ? "Clear Selection" : "Select First 15"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-100 p-3 rounded-xl max-h-[250px] overflow-y-auto bg-slate-50">
                    {students.map((student) => {
                      const isSelected = selectedGDStudentIds.includes(student.studentId);
                      return (
                        <button
                          key={student.studentId}
                          type="button"
                          onClick={() => toggleSelectStudentForGD(student.studentId)}
                          className={`p-2.5 rounded-lg border text-left flex items-center justify-between cursor-pointer transition-all ${
                            isSelected 
                              ? "bg-brand-primary/10 border-brand-primary/40 text-brand-primary" 
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <div className="truncate mr-1.5">
                            <span className="font-mono font-bold text-[10px] block leading-none mb-1">{student.studentId}</span>
                            <span className="font-sans text-[11px] block truncate leading-none text-slate-500">{student.name}</span>
                          </div>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-brand-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setShowGDModal(false);
                    setSelectedGDStudentIds([]);
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAssignGD}
                  disabled={selectedGDStudentIds.length === 0}
                  className="px-5 py-2 bg-brand-primary hover:bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer badge-white-text disabled:opacity-50"
                >
                  Create Room & Assign
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
