import React from "react";
import { GraduationCap, LogOut, Code, User, Settings, Award } from "lucide-react";
import { StudentProfile, FacultyProfile } from "../types";

interface NavbarProps {
  studentProfile: StudentProfile | null;
  facultyProfile?: FacultyProfile | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export default function Navbar({ studentProfile, facultyProfile, currentView, onNavigate, onLogout }: NavbarProps) {
  return (
    <header id="app-navbar" className="glass-nav sticky top-0 z-50 w-full px-6 py-4 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo and Branding */}
        <div 
          onClick={() => onNavigate("landing")} 
          className="flex items-center space-x-3 cursor-pointer group"
          id="nav-logo"
        >
          <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-slate-100 shadow-xs">
            <img 
              src="https://www.adityauniversity.in/public/frontend/assets/images/site-logo.svg" 
              alt="Aditya University Logo" 
              className="h-9 object-contain"
            />
            <div className="h-6 w-[1.5px] bg-slate-200" />
            <img 
              src="https://www.adityauniversity.in/public/frontend/assets/images/naac-logo.svg" 
              alt="NAAC Logo" 
              className="h-8 object-contain"
            />
          </div>
          <div className="hidden md:block">
            <span className="font-display font-bold text-sm tracking-tight text-slate-800 group-hover:text-brand-primary transition-colors block leading-none">
              INTERVIEW<span className="text-brand-primary font-medium">COACH</span>
            </span>
            <span className="text-[9px] font-mono tracking-wider text-slate-500 uppercase block mt-1">Aditya University Portal</span>
          </div>
        </div>

        {/* Navigation Options - shown if student or faculty is logged in */}
        {studentProfile ? (
          <nav id="nav-menu" className="hidden lg:flex items-center space-x-1">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "dashboard"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate("analyze")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "analyze"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Analyze Profile
            </button>
            <button
              onClick={() => onNavigate("interview")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "interview"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Live Interview
            </button>
            <button
              onClick={() => onNavigate("group-discussion")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "group-discussion"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Group Discussion
            </button>
            <button
              onClick={() => onNavigate("report")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "report"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Latest Report
            </button>
            <button
              onClick={() => onNavigate("profile")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "profile"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Profile
            </button>

          </nav>
        ) : facultyProfile ? (
          <nav id="nav-menu" className="hidden lg:flex items-center space-x-1">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "dashboard"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Proctor Panel
            </button>
            <button
              onClick={() => onNavigate("group-discussion")}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer ${
                currentView === "group-discussion"
                  ? "text-brand-primary bg-slate-100 font-semibold"
                  : "text-slate-600 hover:text-brand-primary hover:bg-slate-50"
              }`}
            >
              Group Discussion
            </button>

          </nav>
        ) : null}

        {/* Action Button Group */}
        <div className="flex items-center space-x-4">
          {(studentProfile || facultyProfile) ? (
            <div className="flex items-center space-x-3">
              {/* User Identification badge */}
              {studentProfile ? (
                <button
                  onClick={() => onNavigate("profile")}
                  className={`flex items-center space-x-2 bg-brand-card hover:bg-slate-800 border border-white/5 rounded-full pl-1.5 pr-3 py-1 text-xs font-mono text-gray-300 cursor-pointer hover:border-brand-primary/30 transition-all duration-200 group ${
                    currentView === "profile" ? "ring-2 ring-brand-primary/50" : ""
                  }`}
                  title="View & Sync College Profile"
                >
                  {studentProfile.profileImage ? (
                    <img 
                      src={studentProfile.profileImage} 
                      alt="avatar" 
                      className="w-5 h-5 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center border border-white/5 group-hover:border-brand-primary/20">
                      <User className="w-2.5 h-2.5 text-brand-primary" />
                    </div>
                  )}
                  <span className="font-mono text-[11px] group-hover:text-white transition-colors">
                    {studentProfile.name ? studentProfile.name.split(" ")[0] : studentProfile.studentId}
                  </span>
                </button>
              ) : (
                <div
                  className="flex items-center space-x-2 bg-brand-primary/10 border border-brand-primary/20 rounded-full px-3 py-1 text-xs font-mono text-brand-primary"
                  title={`Proctor: ${facultyProfile?.name} (${facultyProfile?.classSection})`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span className="font-mono font-bold text-[11px]">
                    Proctor {facultyProfile?.name.split(" ")[0]}
                  </span>
                </div>
              )}
              <button
                onClick={onLogout}
                className="flex items-center space-x-1.5 bg-red-950/30 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer"
                id="btn-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate("login")}
              className="px-5 py-2 rounded-xl bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-semibold text-sm hover:scale-[1.02] neon-glow-btn transition-all duration-300 shadow-md cursor-pointer"
              id="btn-nav-login"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
