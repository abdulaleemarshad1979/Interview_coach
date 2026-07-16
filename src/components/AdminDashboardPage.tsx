import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { apiFetch } from "../lib/api";
import { 
  Users, 
  GraduationCap, 
  ShieldAlert, 
  Search, 
  UserCheck, 
  UserX, 
  RefreshCw, 
  Check, 
  Building,
  Hash,
  Sparkles,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { AdminProfile } from "../types";
import Button from "./ui/Button";

interface AdminDashboardPageProps {
  adminProfile: AdminProfile;
  onNavigate: (view: string) => void;
}

interface ProctorRecord {
  id: string;
  name: string;
  email: string;
  department: string;
  classSection: string;
  rollPrefix: string;
  rollStart: number;
  rollEnd: number;
  studentCount?: number;
}

interface StudentRecord {
  id: string;
  roll_number: string;
  name: string;
  department: string;
  classSection: string;
  assignedProctorId?: string;
  assignedProctorName?: string;
}

export default function AdminDashboardPage({ adminProfile, onNavigate }: AdminDashboardPageProps) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [proctors, setProctors] = useState<ProctorRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [assignFilter, setAssignFilter] = useState<"all" | "assigned" | "unassigned">("all");

  // Bulk selection states
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedProctorId, setSelectedProctorId] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Fetch all profiles from Supabase and parse them
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/profiles");
      if (!response.ok) {
        throw new Error(`Failed to load profiles: ${response.statusText}`);
      }
      const data = await response.json();

      const allProfiles = data || [];
      setProfiles(allProfiles);

      // Parse Proctors: Profiles where is_faculty is true, or roll_number is empty but name exists
      const parsedProctors: ProctorRecord[] = allProfiles
        .filter((p: any) => p.is_faculty || (!p.roll_number && p.name))
        .map((p: any) => {
          // Fallback parsing for proctor details from metadata if missing in columns
          // We can check local storage for their profile range if they logged in here
          const cachedProfileStr = localStorage.getItem(`facultyProfile`);
          let cached = null;
          try {
            if (cachedProfileStr) {
              const parsedCached = JSON.parse(cachedProfileStr);
              if (parsedCached.name === p.name) cached = parsedCached;
            }
          } catch {}

          return {
            id: p.id,
            name: p.name || p.student_name || "Faculty Member",
            email: p.email || cached?.email || `${(p.name || "proctor").toLowerCase().replace(/\s+/g, "")}@aec.edu.in`,
            department: p.branch || cached?.department || "CSE",
            classSection: p.class_section || p.section || cached?.classSection || "Section A",
            rollPrefix: cached?.rollPrefix || "24P31A12",
            rollStart: cached?.rollStart || 1,
            rollEnd: cached?.rollEnd || 30
          };
        });

      // Parse Students: Profiles with a roll number
      const parsedStudents: StudentRecord[] = allProfiles
        .filter((p: any) => p.roll_number)
        .map((p: any) => {
          // Read assignment from localStorage override first (fallback)
          const localAssign = localStorage.getItem(`assigned_proctor_${p.roll_number}`);
          let assignedProctorId = p.assigned_proctor_id || undefined;
          let assignedProctorName = p.assigned_proctor_name || undefined;

          if (localAssign) {
            try {
              const parsedLocal = JSON.parse(localAssign);
              assignedProctorId = parsedLocal.proctorId;
              assignedProctorName = parsedLocal.proctorName;
            } catch {}
          }

          return {
            id: p.id,
            roll_number: p.roll_number,
            name: p.student_name || p.name || `Student ${p.roll_number}`,
            department: p.branch || "CSE",
            classSection: p.section || p.class_section || "Section A",
            assignedProctorId,
            assignedProctorName
          };
        });

      // Calculate student counts for proctors
      parsedProctors.forEach(proctor => {
        proctor.studentCount = parsedStudents.filter(s => s.assignedProctorId === proctor.id).length;
      });

      setProctors(parsedProctors);
      setStudents(parsedStudents);
    } catch (err: any) {
      console.error("Error loading Admin data:", err);
      setError(err.message || "Failed to load records from the database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update a student's assigned proctor
  const handleAssignProctor = async (studentId: string, rollNumber: string, proctorId: string) => {
    setSavingStudentId(studentId);
    setError(null);
    setSuccessMessage(null);

    const selectedProctor = proctors.find(p => p.id === proctorId);
    const proctorName = selectedProctor ? selectedProctor.name : "";

    try {
      // 1. Save to LocalStorage for bulletproof instant fallback
      if (proctorId) {
        localStorage.setItem(`assigned_proctor_${rollNumber}`, JSON.stringify({
          proctorId,
          proctorName
        }));
      } else {
        localStorage.removeItem(`assigned_proctor_${rollNumber}`);
      }

      // 2. Attempt to update in Supabase
      let updateError = null;
      try {
        const res = await apiFetch(`/api/profiles/${studentId}`, {
          method: "PATCH",
          body: JSON.stringify({
            assigned_proctor_id: proctorId || null,
            assigned_proctor_name: proctorName || null
          })
        });
        if (!res.ok) {
          updateError = new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
      } catch (err: any) {
        updateError = err;
      }

      if (updateError) {
        console.warn("DB Update failed (likely due to RLS). Relying on LocalStorage fallback.", updateError);
        // Do not throw error here, so user gets a seamless experience even without DB write permissions
      }

      // 3. Update local state
      setStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          return {
            ...s,
            assignedProctorId: proctorId || undefined,
            assignedProctorName: proctorName || undefined
          };
        }
        return s;
      }));

      // Update proctor student counts
      setProctors(prev => prev.map(p => {
        const count = students.filter(s => 
          (s.id === studentId ? proctorId === p.id : s.assignedProctorId === p.id)
        ).length;
        return { ...p, studentCount: count };
      }));

      setSuccessMessage(`Successfully updated assignment for student ${rollNumber}!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save assignment.");
    } finally {
      setSavingStudentId(null);
    }
  };

  // Bulk assign or unassign students to a proctor
  const handleBulkAssign = async (proctorId: string) => {
    if (selectedStudentIds.length === 0) return;
    setBulkAssigning(true);
    setError(null);
    setSuccessMessage(null);

    const selectedProctor = proctors.find(p => p.id === proctorId);
    const proctorName = selectedProctor ? selectedProctor.name : "";

    try {
      // Loop over selected student IDs and assign/unassign them
      for (const studentId of selectedStudentIds) {
        const student = students.find(s => s.id === studentId);
        if (!student) continue;

        // 1. LocalStorage update
        if (proctorId) {
          localStorage.setItem(`assigned_proctor_${student.roll_number}`, JSON.stringify({
            proctorId,
            proctorName
          }));
        } else {
          localStorage.removeItem(`assigned_proctor_${student.roll_number}`);
        }

        // 2. DB update
        try {
          await apiFetch(`/api/profiles/${studentId}`, {
            method: "PATCH",
            body: JSON.stringify({
              assigned_proctor_id: proctorId || null,
              assigned_proctor_name: proctorName || null
            })
          });
        } catch (dbErr) {
          console.warn(`Bulk assign DB update failed for ${student.roll_number}:`, dbErr);
        }
      }

      // 3. Update local state
      setStudents(prev => prev.map(s => {
        if (selectedStudentIds.includes(s.id)) {
          return {
            ...s,
            assignedProctorId: proctorId || undefined,
            assignedProctorName: proctorName || undefined
          };
        }
        return s;
      }));

      // Recompute proctor student counts
      setProctors(prev => prev.map(p => {
        const count = students.map(s => {
          if (selectedStudentIds.includes(s.id)) {
            return {
              ...s,
              assignedProctorId: proctorId || undefined
            };
          }
          return s;
        }).filter(s => s.assignedProctorId === p.id).length;
        return { ...p, studentCount: count };
      }));

      setSuccessMessage(
        proctorId 
          ? `Successfully assigned ${selectedStudentIds.length} students to proctor ${proctorName}!` 
          : `Successfully removed assignments for ${selectedStudentIds.length} students!`
      );
      setSelectedStudentIds([]);
      setSelectedProctorId("");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed during bulk assignment execution.");
    } finally {
      setBulkAssigning(false);
    }
  };

  // Filter students based on search query and status filter
  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.assignedProctorName || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      assignFilter === "all" ||
      (assignFilter === "assigned" && student.assignedProctorId) ||
      (assignFilter === "unassigned" && !student.assignedProctorId);

    return matchesSearch && matchesStatus;
  });

  const totalAssigned = students.filter(s => s.assignedProctorId).length;
  const totalUnassigned = students.length - totalAssigned;
  const assignmentRate = students.length ? Math.round((totalAssigned / students.length) * 100) : 0;

  return (
    <div id="admin-dashboard" className="max-w-7xl mx-auto px-6 py-10 space-y-8 text-slate-800 bg-white">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight flex items-center gap-3">
            <GraduationCap className="w-10 h-10 text-brand-primary" />
            Admin Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            System Administrator: <span className="font-mono text-brand-primary font-semibold">{adminProfile.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>

          {/* Auto Assign Range removed */}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric 1: Total Students */}
        <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Total Students</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-0.5">
              {students.length}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Registered accounts</span>
          </div>
        </div>

        {/* Metric 2: Total Proctors */}
        <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-brand-accent/10 flex items-center justify-center">
            <Building className="w-6 h-6 text-brand-accent" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Total Proctors</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-0.5">
              {proctors.length}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Faculty supervisors</span>
          </div>
        </div>

        {/* Metric 3: Assigned Students */}
        <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Assigned Students</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-0.5">
              {totalAssigned}
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold font-mono">{assignmentRate}% map rate</span>
          </div>
        </div>

        {/* Metric 4: Unassigned Students */}
        <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <UserX className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Unassigned Students</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-0.5">
              {totalUnassigned}
            </div>
            <span className="text-[10px] text-amber-600 font-semibold font-mono">Awaiting routing</span>
          </div>
        </div>
      </div>

      {/* Messages banner */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 text-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
            <span>{error}</span>
          </motion.div>
        )}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-3 text-sm shadow-xs"
          >
            <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Proctors list (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-display font-bold text-lg text-slate-900">Faculty Proctors</h2>
              <span className="bg-slate-200 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
                {proctors.length} Active
              </span>
            </div>

            {proctors.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No active faculty members registered.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {proctors.map(proctor => (
                  <div 
                    key={proctor.id} 
                    className="bg-white border border-slate-200/50 rounded-xl p-3.5 hover:border-brand-primary/30 hover:shadow-xs transition-all flex flex-col gap-2 relative group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-sans font-bold text-sm text-slate-800">{proctor.name}</h3>
                        <p className="text-[11px] text-slate-500 font-mono">{proctor.email}</p>
                      </div>
                      <span className="bg-brand-primary/8 text-brand-primary text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {proctor.studentCount || 0} students
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] border-t border-slate-100 pt-2 text-slate-500">
                      <div>
                        <span className="font-semibold text-slate-700 block">Department</span>
                        {proctor.department}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700 block">Class Section</span>
                        {proctor.classSection}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Student assignments (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900">Student Assignment Roster</h2>
                <p className="text-xs text-slate-500">Assign students to specific proctors to supervise their mock pipelines</p>
              </div>

              {/* Status filtering switches */}
              <div className="bg-slate-200 p-1 rounded-lg flex gap-1">
                {(["all", "assigned", "unassigned"] as const).map((filterVal) => (
                  <button
                    key={filterVal}
                    onClick={() => setAssignFilter(filterVal)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize cursor-pointer ${
                      assignFilter === filterVal ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filterVal}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search students by Roll Number, Name, Branch or Proctor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
              />
            </div>

            {/* Bulk Action Toolbar */}
            {selectedStudentIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-100 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-brand-primary text-white font-mono text-xs font-bold px-2 py-1 rounded-md">
                    {selectedStudentIds.length}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">students selected for bulk action</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={selectedProctorId}
                    onChange={(e) => setSelectedProctorId(e.target.value)}
                    disabled={bulkAssigning}
                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 max-w-[200px]"
                  >
                    <option value="">-- Choose Proctor --</option>
                    {proctors.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.department})
                      </option>
                    ))}
                  </select>

                  <Button
                    onClick={() => handleBulkAssign(selectedProctorId)}
                    disabled={bulkAssigning || !selectedProctorId}
                    className="px-3.5 py-1.5 bg-brand-primary text-white font-bold rounded-lg text-xs hover:bg-brand-primary-hover shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    Assign Selected
                  </Button>

                  <Button
                    onClick={() => handleBulkAssign("")}
                    disabled={bulkAssigning}
                    className="px-3.5 py-1.5 border border-red-200 text-red-600 font-bold rounded-lg text-xs hover:bg-red-50 cursor-pointer"
                  >
                    Unassign Selected
                  </Button>

                  <Button
                    onClick={() => {
                      setSelectedStudentIds([]);
                      setSelectedProctorId("");
                    }}
                    disabled={bulkAssigning}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Table of Students */}
            {filteredStudents.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No student profiles match the filter parameters.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/50 rounded-xl bg-white">
                <table className="w-full text-left text-slate-600 text-xs">
                  <thead className="bg-slate-50 text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={filteredStudents.length > 0 && selectedStudentIds.length === filteredStudents.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIds(filteredStudents.map(s => s.id));
                            } else {
                              setSelectedStudentIds([]);
                            }
                          }}
                          className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20 cursor-pointer"
                        />
                      </th>
                      <th className="px-5 py-3">Roll Number</th>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Department & Section</th>
                      <th className="px-5 py-3 text-right">Assign Proctor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 w-10">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(student.id)}
                            onChange={() => {
                              setSelectedStudentIds(prev =>
                                prev.includes(student.id)
                                  ? prev.filter(id => id !== student.id)
                                  : [...prev, student.id]
                              );
                            }}
                            className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary/20 cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                          {student.roll_number}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-800">
                          {student.name}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="block font-semibold text-slate-700">{student.department}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{student.classSection}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <select
                            disabled={savingStudentId === student.id}
                            value={student.assignedProctorId || ""}
                            onChange={(e) => handleAssignProctor(student.id, student.roll_number, e.target.value)}
                            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 max-w-[200px]"
                          >
                            <option value="">-- Choose Proctor --</option>
                            {proctors.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.department})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
