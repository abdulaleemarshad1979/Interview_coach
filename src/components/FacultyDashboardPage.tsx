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
  Play
} from "lucide-react";
import { FacultyProfile, StudentProfile, Scorecard } from "../types";
import Button from "./ui/Button";

interface FacultyDashboardPageProps {
  facultyProfile: FacultyProfile;
  onNavigate: (view: string) => void;
}

interface SimulatedStudent extends StudentProfile {
  assignedInterview?: {
    topic: string;
    difficulty: string;
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

export default function FacultyDashboardPage({ facultyProfile, onNavigate }: FacultyDashboardPageProps) {
  const [students, setStudents] = useState<SimulatedStudent[]>([]);
  const [isRealData, setIsRealData] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending" | "none">("all");
  const [selectedStudent, setSelectedStudent] = useState<SimulatedStudent | null>(null);
  
  // Modals state
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showGDModal, setShowGDModal] = useState(false);
  
  // Assignment Inputs
  const [interviewTopic, setInterviewTopic] = useState("System Architecture");
  const [interviewDifficulty, setInterviewDifficulty] = useState("Intermediate");
  const [gdTopic, setGdTopic] = useState("Will AI and ChatGPT replace software engineers?");
  const [selectedGDStudentIds, setSelectedGDStudentIds] = useState<string[]>([]);
  const [assignTargetStudent, setAssignTargetStudent] = useState<SimulatedStudent | null>(null);

  // Live activity logs feed
  const [activities, setActivities] = useState<Array<{ id: string; time: string; roll: string; text: string; type: 'sync' | 'interview' | 'gd' }>>([]);

  // Generate the supervised students based on Supabase database
  useEffect(() => {
    const fetchStudents = async () => {
      setLoadingStudents(true);
      try {
        const prefix = (facultyProfile.rollPrefix || "24P31A12").toLowerCase().trim();
        const start = typeof facultyProfile.rollStart === "number" ? facultyProfile.rollStart : parseInt(String(facultyProfile.rollStart || "1"), 10);
        const end = typeof facultyProfile.rollEnd === "number" ? facultyProfile.rollEnd : parseInt(String(facultyProfile.rollEnd || "30"), 10);
        const targetSection = (facultyProfile.classSection || "").toLowerCase().trim();

        // 1. Fetch real students from MongoDB profiles collection via API
        let data = null;
        try {
          const res = await apiFetch("/api/profiles");
          if (res.ok) {
            data = await res.json();
          } else {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
        } catch (err) {
          console.warn("Could not query profiles from MongoDB", err);
          setStudents([]);
          setIsRealData(true);
          return;
        }

        const matched = (data || []).filter((row: any) => {
          const roll = (row.roll_number || "").toLowerCase().trim();
          if (!roll) return false;

          // Check if explicitly assigned via DB or LocalStorage
          const localAssignStr = localStorage.getItem(`assigned_proctor_${row.roll_number}`);
          let assignedProctorId = row.assigned_proctor_id;

          if (localAssignStr) {
            try {
              const parsed = JSON.parse(localAssignStr);
              assignedProctorId = parsed.proctorId;
            } catch {}
          }

          return assignedProctorId === facultyProfile.facultyId;
        }).map((row: any) => {
          const roll = row.roll_number || "Unknown";
          const name = row.name || row.student_name || `Student ${roll.slice(-2)}`;
          const attendance = row.attendance || 80;
          const branch = row.branch || "CSE";
          const classSectionVal = row.section || row.class_section || facultyProfile.classSection;
          const assessments = row.college_assessments || [];

          // Local assignments
          const localStoredInterview = localStorage.getItem(`assignedInterview_${roll}`);
          const localStoredGD = localStorage.getItem(`assignedGD_${roll}`);
          
          let assignedInterview = undefined;
          if (localStoredInterview) {
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

        // Deduplicate matched students by studentId (roll number) to prevent duplicates on proctor dashboard
        const uniqueMatchedMap = new Map<string, any>();
        matched.forEach((student) => {
          uniqueMatchedMap.set(student.studentId, student);
        });
        const uniqueMatched = Array.from(uniqueMatchedMap.values());

        setStudents(uniqueMatched);
        setIsRealData(true);
        
        // Seed dynamic activity log updates
        const initialActivities = uniqueMatched.slice(0, 3).map((s, idx) => ({
          id: `act_${idx}`,
          time: `${10 + idx}:${15 + idx * 7} AM`,
          roll: s.studentId,
          text: idx === 0 ? "synced profile credentials" : idx === 1 ? "completed practice mock" : "joined classroom lobby",
          type: "sync" as const
        }));
        setActivities(initialActivities);

      } catch (err) {
        console.error("Error fetching students:", err);
        setStudents([]);
        setIsRealData(true);
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [facultyProfile]);

  // Handle single student interview assignment
  const handleAssignInterview = () => {
    if (!assignTargetStudent) return;
    
    const assignment = {
      topic: interviewTopic,
      difficulty: interviewDifficulty,
      assignedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completed: false
    };

    localStorage.setItem(`assignedInterview_${assignTargetStudent.studentId}`, JSON.stringify(assignment));
    
    // Also save in student's simulated profile metadata fields
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

    // Log activity
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

    // Save assignment for each selected student
    selectedGDStudentIds.forEach(roll => {
      localStorage.setItem(`assignedGD_${roll}`, JSON.stringify(gdAssignment));
      
      // Also register this student under the Supabase mock room participants mapping if we want
      const activeState = localStorage.getItem(`gd_room_state_${roomCode}`);
      let parsedState: any = { code: roomCode, topic: gdTopic, participants: [], dialogue: [], created_at: Date.now() };
      if (activeState) {
        try { parsedState = JSON.parse(activeState); } catch {}
      }

      const matchStudent = students.find(s => s.studentId === roll);
      if (matchStudent) {
        parsedState.participants.push({
          id: Math.random().toString(36).substring(2, 9),
          name: matchStudent.name,
          roll: matchStudent.studentId,
          isHost: false,
          joinedAt: Date.now()
        });
      }
      localStorage.setItem(`gd_room_state_${roomCode}`, JSON.stringify(parsedState));
    });

    // Update students state
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

    // Log activity
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
        return { completed: true, score: parsed.overallScore, level: parsed.candidateLevel };
      } catch {}
    }
    return { completed: false, score: null, level: null };
  };

  // Filters students based on search query and status filter
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
                Proctor Dashboard
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-sans">
                Logged in as <span className="font-semibold text-brand-primary">{facultyProfile.name}</span> &bull; {facultyProfile.department} Coordinator
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Class Status Cards */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-3 rounded-xl">
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">Supervised Class</span>
            <span className="text-sm font-bold text-slate-800">{facultyProfile.classSection}</span>
          </div>
          <div className="h-8 w-[1.5px] bg-slate-200" />
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">Roll Range</span>
            <span className="text-sm font-mono font-bold text-brand-accent">
              {facultyProfile.rollPrefix}{String(facultyProfile.rollStart).padStart(2, "0")} - {String(facultyProfile.rollEnd).padStart(2, "0")}
            </span>
          </div>
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
            <span className="text-[10px] text-emerald-500 font-mono uppercase">{isRealData ? "Live Database Synced" : "Preview Roster"}</span>
          </div>
        </div>

        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">Average Attendance</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">
              {students.length > 0 ? (students.reduce((acc, curr) => acc + (curr.attendance || 0), 0) / students.length).toFixed(1) : "0.0"}%
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Required min 75%</span>
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
            <span className="text-[10px] text-brand-primary font-mono font-semibold">
              {students.filter(s => s.assignedInterview && !getScorecardStatus(s).completed).length} pending
            </span>
          </div>
        </div>

        <div className="bg-brand-card border border-slate-200 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono uppercase">Group Discussions</div>
            <div className="text-2xl font-display font-bold text-slate-800 mt-1">
              {students.filter(s => s.assignedGD).length} Assigned
            </div>
            <span className="text-[10px] text-slate-400 font-mono">15 members limit per GD</span>
          </div>
        </div>
      </div>

      {/* Main content layout: Left column = roster, Right column = live actions/logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column - Supervised student roster table */}
        <div className="lg:col-span-8 bg-brand-card border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-display font-bold text-slate-800">Supervised Student Roster</h3>
              <p className="text-xs text-slate-400 font-mono uppercase mt-0.5">Real-time status updates</p>
            </div>

            {/* Quick action: Bulk GD room assigner */}
            <button
              onClick={() => {
                setSelectedGDStudentIds([]);
                setShowGDModal(true);
              }}
              className="flex items-center space-x-2 bg-brand-primary hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Bulk Create GD Room</span>
            </button>
          </div>

          {loadingStudents ? (
            <div className="p-4 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-brand-primary animate-spin" />
              <span>Querying database profiles...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">No Students Registered:</span> There are currently no registered student accounts in section <span className="font-semibold uppercase">"{facultyProfile.classSection}"</span> that match your roll range bounds ({facultyProfile.rollPrefix}{facultyProfile.rollStart} - {facultyProfile.rollEnd}) in the database. When students register using the gateway, they will appear here.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Live Synced Roster:</span> Showing {students.length} student profiles directly fetched from your Supabase database.
              </div>
            </div>
          )}

          {/* Filters and search block */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search roll number or student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="flex items-center space-x-2 border border-slate-200 rounded-xl px-3 bg-slate-50">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-xs bg-transparent border-none text-slate-700 py-1 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Students</option>
                <option value="completed">Completed Tasks</option>
                <option value="pending">Pending Tasks</option>
                <option value="none">No Tasks Assigned</option>
              </select>
            </div>
          </div>

          {/* Responsive Students Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left border-collapse text-slate-700">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center">Attendance</th>
                  <th className="py-3 px-4">Assignment Status</th>
                  <th className="py-3 px-4 text-right">Performance Score</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const sc = getScorecardStatus(student);
                    return (
                      <tr key={student.studentId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{student.studentId}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">{student.name}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border font-medium ${getAttendanceClass(student.attendance || 0)}`}>
                            {student.attendance}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1">
                            {student.assignedInterview && (
                              <div className="flex items-center gap-1.5 text-[10px] text-brand-primary">
                                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                <span className="font-medium truncate max-w-[100px]">Interview: {student.assignedInterview.topic}</span>
                              </div>
                            )}
                            {student.assignedGD && (
                              <div className="flex items-center gap-1.5 text-[10px] text-brand-accent">
                                <Video className="w-3 h-3 flex-shrink-0" />
                                <span className="font-semibold font-mono">GD: {student.assignedGD.roomCode}</span>
                              </div>
                            )}
                            {!student.assignedInterview && !student.assignedGD && (
                              <span className="text-[10px] text-slate-400 font-mono">No tasks assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold">
                          {sc.completed ? (
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-600">{sc.score}%</span>
                              <span className="text-[9px] text-slate-400 font-normal uppercase">{sc.level?.replace(" Candidate", "")}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-normal italic">Ungraded</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Action: Assign Interview */}
                            <button
                              onClick={() => {
                                setAssignTargetStudent(student);
                                setShowInterviewModal(true);
                              }}
                              className="p-1.5 hover:bg-brand-primary/10 text-brand-primary rounded-lg transition-colors cursor-pointer"
                              title="Assign Mock Interview"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Action: View Report details */}
                            <button
                              onClick={() => {
                                const stored = localStorage.getItem(`scorecard_${student.studentId}`);
                                if (stored) {
                                  // Open reports view
                                  localStorage.setItem("scorecard", stored);
                                  onNavigate("report");
                                } else {
                                  alert(`Student ${student.studentId} has not completed their mock interview assessment yet.`);
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                sc.completed ? "hover:bg-emerald-500/10 text-emerald-500" : "text-slate-300 hover:bg-slate-100"
                              }`}
                              title="View Assessment Scorecard"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                      <span>No students found matching filters.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column - Live Updates & General Settings logs */}
        <div className="lg:col-span-4 space-y-6">
          {/* Proctor ranges setup details block */}
          <div className="bg-brand-card border border-slate-200 p-6 rounded-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Assigned Section</h4>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-sans text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Class & Branch:</span>
                <span className="font-semibold text-slate-800">{facultyProfile.classSection}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Section Proctors:</span>
                <span className="font-semibold text-slate-800">2 Co-Proctors (30 students each)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Co-Proctor 2 range:</span>
                <span className="font-mono text-slate-600">31 - 60</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Department:</span>
                <span className="font-semibold text-slate-800">{facultyProfile.department}</span>
              </div>
            </div>
          </div>

          {/* Simulated live notifications feed */}
          <div className="bg-brand-card border border-slate-200 p-6 rounded-2xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Live Activity Stream</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-mono">Supervised Range logs</p>
            </div>
            
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {activities.map((act) => (
                <div key={act.id} className="flex items-start space-x-3 text-xs border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                    act.type === 'interview' ? 'bg-brand-primary/10 text-brand-primary' :
                    act.type === 'gd' ? 'bg-brand-accent/10 text-brand-accent' :
                    'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    {act.type === 'interview' ? <BookOpen className="w-3.5 h-3.5" /> :
                     act.type === 'gd' ? <Video className="w-3.5 h-3.5" /> :
                     <CheckCircle className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-400 block">{act.time}</span>
                    <p className="text-slate-700 leading-relaxed mt-0.5">
                      <span className="font-mono font-bold text-slate-900 mr-1">{act.roll}</span>
                      {act.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- Interview Assignment Modal --- */}
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
                <h3 className="font-display font-bold text-lg text-slate-800">Assign Interview task</h3>
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

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Difficulty Tier</label>
                  <div className="flex gap-2">
                    {["Beginner", "Intermediate", "Advanced"].map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setInterviewDifficulty(diff)}
                        className={`flex-1 py-2 text-center text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                          interviewDifficulty === diff 
                            ? "bg-brand-primary border-transparent text-white shadow-xs" 
                            : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
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
                    <option value="Cryptocurrency and Web3: The future of digital economics or a speculative bubble?">Cryptocurrency and Web3: The future or bubble?</option>
                    <option value="Is the gig economy beneficial for young professionals starting their careers?">Is the gig economy beneficial for young professionals?</option>
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
                          // Select first 15 students
                          setSelectedGDStudentIds(students.slice(0, 15).map(s => s.studentId));
                        }
                      }}
                      className="text-[10px] text-brand-primary hover:underline font-mono uppercase"
                    >
                      {selectedGDStudentIds.length === 15 ? "Clear Selection" : "Select First 15"}
                    </button>
                  </div>

                  {/* Student selector grid */}
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
                  className="px-5 py-2 bg-brand-primary hover:bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer badge-white-text disabled:opacity-50 disabled:hover:bg-brand-primary"
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
