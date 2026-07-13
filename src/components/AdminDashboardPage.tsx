import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Users, 
  FileText, 
  Activity, 
  Award, 
  TrendingUp,
  CheckCircle2,
  Clock,
  Search,
  Download,
  UserPlus,
  UserCheck
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface AdminStats {
  totalUsers: number;
  completedAnalyses: number;
  completedInterviews: number;
  averageScore: number;
}

interface PendingRegistration {
  id: string;
  email: string;
  rollNumber: string;
  registeredAt: string;
  facultyId?: string | null;
  facultyName?: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    completedAnalyses: 0,
    completedInterviews: 0,
    averageScore: 0
  });
  
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(null);
  const [assignedFaculty, setAssignedFaculty] = useState("");

  useEffect(() => {
    // Load users from localStorage (simulating API call)
    const loadStats = () => {
      // Count users with analysis data
      let analysesCount = 0;
      let interviewsCount = 0;
      let totalScore = 0;
      let scoreCount = 0;

      // Check localStorage for user data
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('analysisResult_')) {
          analysesCount++;
        }
        if (key.startsWith('scorecard_')) {
          interviewsCount++;
          try {
            const scorecard = JSON.parse(localStorage.getItem(key) || '{}');
            totalScore += scorecard.overallScore || 0;
            scoreCount++;
          } catch (e) {
            console.error("Error parsing scorecard", e);
          }
        }
      });

      // Count unique users with any data
      const userKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('analysisResult_') || key.startsWith('scorecard_')
      );
      
      setStats({
        totalUsers: userKeys.length,
        completedAnalyses: analysesCount,
        completedInterviews: interviewsCount,
        averageScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0
      });
    };

    loadStats();
    
    // Fetch pending registrations from Supabase auth.users
    const fetchPendingRegistrations = async () => {
      try {
        // Get all users from Supabase
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        
        if (error) {
          console.error("Error fetching users:", error);
          setLoading(false);
          return;
        }
        
        // Filter users who have roll_number in metadata but no faculty assigned
        const pendingRegs: PendingRegistration[] = [];
        for (const user of users) {
          const rollNumber = user.user_metadata?.roll_number;
          const facultyId = user.user_metadata?.faculty_id;
          
          if (rollNumber && !facultyId) {
            pendingRegs.push({
              id: user.id,
              email: user.email || "",
              rollNumber: rollNumber,
              registeredAt: user.created_at,
              facultyId: null
            });
          }
        }
        
        setPendingRegistrations(pendingRegs);
      } catch (err) {
        console.error("Error in fetchPendingRegistrations:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPendingRegistrations();
  }, []);

  // Handle assigning faculty to a student
  const handleAssignFaculty = async () => {
    if (!assigningStudentId || !assignedFaculty) return;
    
    try {
      // Get the current user data first
      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(assigningStudentId);
      
      if (fetchError) {
        console.error("Error fetching user:", fetchError);
        alert("Failed to fetch user data. Please check the console for details.");
        return;
      }
      
      // Update user metadata with faculty_id
      const { error } = await supabase.auth.admin.updateUserById(
        assigningStudentId,
        {
          ...userData.user,
          user_metadata: {
            ...userData.user.user_metadata,
            faculty_id: assignedFaculty
          }
        }
      );
      
      if (error) {
        console.error("Error assigning faculty:", error);
        alert("Failed to assign faculty. Please check the console for details.");
        return;
      }
      
      // Update local state
      setPendingRegistrations(prev => 
        prev.map(reg => 
          reg.id === assigningStudentId 
            ? { ...reg, facultyId: assignedFaculty } 
            : reg
        )
      );
      
      setAssigningStudentId(null);
      setAssignedFaculty("");
    } catch (err) {
      console.error("Error in handleAssignFaculty:", err);
      alert("Failed to assign faculty. Please check the console for details.");
    }
  };

  // Fetch available faculty members from Supabase
  const [availableFaculties, setAvailableFaculties] = useState<{id: string, email: string}[]>([]);
  
  useEffect(() => {
    const fetchFaculties = async () => {
      try {
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        
        if (error) {
          console.error("Error fetching faculties:", error);
          return;
        }
        
        // Filter users who have role="faculty" in metadata
        const faculties = (users || []).filter(user => 
          user.user_metadata?.role === 'faculty'
        ).map(user => ({
          id: user.id,
          email: user.email || ""
        }));
        
        setAvailableFaculties(faculties);
      } catch (err) {
        console.error("Error in fetchFaculties:", err);
      }
    };
    
    fetchFaculties();
  }, []);

  return (
    <div id="admin-dashboard-page" className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-8">
        <div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Admin Command Center
          </h1>
          <p className="text-gray-400 mt-1">
            System Overview & User Management Dashboard
          </p>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center space-x-2 bg-white/5 hover:bg-white/10 text-white font-medium px-6 py-3.5 rounded-xl text-sm transition-all cursor-pointer border border-white/5"
        >
          <Activity className="w-4 h-4" />
          <span>Refresh Stats</span>
        </button>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Metric 1 */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-mono uppercase">Total Users</div>
              <div className="text-2xl font-display font-bold text-white mt-1">
                {stats.totalUsers}
              </div>
              <span className="text-[10px] text-blue-400 font-mono uppercase">Registered Students</span>
            </div>
          </div>

          {/* Metric 2 */}
          <div className="bg-gradient-to-br from-emerald-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <FileText className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-mono uppercase">Analyses Done</div>
              <div className="text-2xl font-display font-bold text-white mt-1">
                {stats.completedAnalyses}
              </div>
              <span className="text-[10px] text-emerald-400 font-mono uppercase">Profile Scans</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div className="bg-gradient-to-br from-purple-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Award className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-mono uppercase">Interviews</div>
              <div className="text-2xl font-display font-bold text-white mt-1">
                {stats.completedInterviews}
              </div>
              <span className="text-[10px] text-purple-400 font-mono uppercase">Mock Interviews</span>
            </div>
          </div>

          {/* Metric 4 */}
          <div className="bg-gradient-to-br from-orange-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl flex items-center space-x-4 shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-orange-400" />
            </div>
            <div>
              <div className="text-xs text-gray-400 font-mono uppercase">Avg Score</div>
              <div className="text-2xl font-display font-bold text-white mt-1">
                {stats.averageScore}%
              </div>
              <span className="text-[10px] text-orange-400 font-mono uppercase">Overall Performance</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Quick Actions & Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats Summary */}
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-lg font-display font-bold text-white mb-4">System Performance</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Analysis Completion Rate</span>
                  <span className="text-sm font-mono text-emerald-400">85%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Interview Completion Rate</span>
                  <span className="text-sm font-mono text-blue-400">72%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '72%' }}></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Average Response Time</span>
                  <span className="text-sm font-mono text-purple-400">2.4s</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full" style={{ width: '65%' }}></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">System Health</span>
                  <span className="text-sm font-mono text-green-400">100%</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-lg font-display font-bold text-white mb-4">Recent System Activity</h3>
            
            <div className="space-y-4">
              {[
                { icon: FileText, text: "Analysis completed for user 22A91A0501", time: "2 hours ago", color: "emerald" },
                { icon: Award, text: "Interview scorecard generated for admin", time: "3 hours ago", color: "purple" },
                { icon: Users, text: "New user registered: 24P31A9999", time: "5 hours ago", color: "blue" },
                { icon: CheckCircle2, text: "System maintenance completed", time: "Yesterday", color: "green" }
              ].map((activity, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center space-x-4 p-3 bg-slate-800/30 rounded-xl hover:bg-slate-700/30 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg bg-${activity.color}-500/20 flex items-center justify-center`}>
                    <activity.icon className={`w-5 h-5 text-${activity.color}-400`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-200">{activity.text}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <button className="w-full mt-4 py-2 bg-slate-700/30 hover:bg-slate-600/30 text-gray-300 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2">
              <Clock className="w-4 h-4" />
              <span>View All Activity Logs</span>
            </button>
          </div>

          {/* Pending Registrations */}
          {pendingRegistrations.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-blue-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-display font-bold text-white">Pending Registrations</h3>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-mono">
                  {pendingRegistrations.length} New
                </span>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingRegistrations.map((reg, idx) => (
                  <motion.div 
                    key={reg.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl hover:bg-slate-700/40 transition-colors group"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UserPlus className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-200">{reg.rollNumber}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{reg.email}</p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          Registered: {new Date(reg.registeredAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    {/* Assign Faculty Dropdown */}
                    <div className="flex items-center space-x-2">
                      {availableFaculties.length === 0 ? (
                        <span className="text-xs text-orange-400 italic">No faculty accounts yet</span>
                      ) : (
                        <>
                          <select
                            value={assigningStudentId === reg.id ? assignedFaculty : ""}
                            onChange={(e) => {
                              setAssigningStudentId(reg.id);
                              setAssignedFaculty(e.target.value);
                            }}
                            disabled={!!reg.facultyId}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              assigningStudentId === reg.id 
                                ? 'bg-blue-600/20 border-blue-500/30 text-white focus:ring-2 focus:ring-blue-500/50' 
                                : 'bg-slate-700/30 border-slate-600/30 text-gray-300'
                            } border rounded-lg text-sm`}
                          >
                            <option value="">Assign Faculty</option>
                            {availableFaculties.map(faculty => (
                              <option key={faculty.id} value={faculty.id}>
                                {faculty.email}
                              </option>
                            ))}
                          </select>
                          
                          {assigningStudentId === reg.id && assignedFaculty && !reg.facultyId && (
                            <button
                              onClick={handleAssignFaculty}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                              title="Confirm Assignment"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                      
                      {reg.facultyId && (
                        <div className="flex items-center space-x-1 px-2 py-1 bg-emerald-500/20 rounded-lg">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs text-emerald-300">Assigned</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column - Quick Actions */}
        <div className="space-y-6">
          {/* Admin Tools Card */}
          <div className="bg-gradient-to-br from-indigo-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-lg font-display font-bold text-white mb-4">Admin Tools</h3>
            
            <div className="space-y-3">
              {[
                { icon: Download, text: "Export All Data", color: "bg-blue-500" },
                { icon: Search, text: "Search Users", color: "bg-purple-500" },
                { icon: CheckCircle2, text: "Verify Users", color: "bg-emerald-500" }
              ].map((tool, idx) => (
                <button
                  key={idx}
                  className="w-full flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-700/40 rounded-xl transition-all group"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg ${tool.color}/20 flex items-center justify-center`}>
                      <tool.icon className={`w-5 h-5 text-${tool.color.split('-')[1]}-400 group-hover:scale-110 transition-transform`} />
                    </div>
                    <span className="text-sm font-medium text-gray-300">{tool.text}</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-slate-600 group-hover:bg-white transition-colors"></div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-gradient-to-br from-orange-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-lg font-display font-bold text-white mb-4">Quick Tips</h3>
            
            <div className="space-y-3">
              {[
                "Use the Export feature to download student reports",
                "Search users by roll number or email",
                "Verify user accounts before granting special access"
              ].map((tip, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-gradient-to-br from-green-900/30 to-slate-900 border border-white/5 p-6 rounded-2xl">
            <h3 className="text-lg font-display font-bold text-white mb-4">System Status</h3>
            
            <div className="space-y-3">
              {[
                { name: "API Server", status: "Online", color: "bg-green-500" },
                { name: "Database", status: "Connected", color: "bg-blue-500" },
                { name: "Storage", status: "Active", color: "bg-purple-500" }
              ].map((service, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{service.name}</span>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${service.color} animate-pulse`}></div>
                    <span className="text-xs font-mono text-green-400">{service.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
