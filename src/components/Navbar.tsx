import React from "react";
import { GraduationCap, LogOut, Code, User, Settings, Award } from "lucide-react";
import { StudentProfile } from "../types";

interface NavbarProps {
  studentProfile: StudentProfile | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export default function Navbar({ studentProfile, currentView, onNavigate, onLogout }: NavbarProps) {
  return (
    <header id="app-navbar" className="glass-nav sticky top-0 z-50 w-full px-6 py-4 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo and Branding */}
        <div 
          onClick={() => onNavigate("landing")} 
          className="flex items-center space-x-3 cursor-pointer group"
          id="nav-logo"
        >
          <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-brand-accent to-brand-primary flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
            <GraduationCap className="w-6 h-6 text-brand-bg stroke-[2]" />
          </div>
          <div>
            <span className="font-display font-bold text-lg tracking-tight text-white group-hover:text-brand-primary transition-colors">
              INTERVIEW<span className="text-brand-primary font-medium">COACH</span>
            </span>
            <div className="text-[9px] font-mono tracking-wider text-gray-500 uppercase">AI-Powered Training</div>
          </div>
        </div>

        {/* Navigation Options - shown if student is logged in */}
        {studentProfile && (
          <nav id="nav-menu" className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === "dashboard"
                  ? "text-brand-primary bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onNavigate("analyze")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === "analyze"
                  ? "text-brand-primary bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Analyze Profile
            </button>
            <button
              onClick={() => onNavigate("interview")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === "interview"
                  ? "text-brand-primary bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Live Interview
            </button>
            <button
              onClick={() => onNavigate("report")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === "report"
                  ? "text-brand-primary bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Latest Report
            </button>
            <button
              onClick={() => onNavigate("settings")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                currentView === "settings"
                  ? "text-brand-primary bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Settings
            </button>
          </nav>
        )}

        {/* Action Button Group */}
        <div className="flex items-center space-x-4">
          {studentProfile ? (
            <div className="flex items-center space-x-3">
              {/* Student Identification badge */}
              <div className="flex items-center bg-brand-card border border-white/5 rounded-full px-3 py-1 text-xs font-mono text-gray-300">
                <User className="w-3 h-3 text-brand-primary mr-1.5" />
                <span>ID: {studentProfile.studentId}</span>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center space-x-1.5 bg-red-950/30 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                id="btn-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate("login")}
              className="px-5 py-2 rounded-xl bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-semibold text-sm hover:scale-[1.02] neon-glow-btn transition-all duration-300 shadow-md"
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
