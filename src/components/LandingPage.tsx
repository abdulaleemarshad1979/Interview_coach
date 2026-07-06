import React from "react";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight, ShieldCheck, Terminal, Award, FileText, CheckCircle } from "lucide-react";

interface LandingPageProps {
  onNavigate: (view: string) => void;
  isLoggedIn: boolean;
}

export default function LandingPage({ onNavigate, isLoggedIn }: LandingPageProps) {
  // Smooth staggered container for hero items
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
  };

  return (
    <div id="landing-page" className="relative min-h-[calc(100vh-73px)] w-full flex flex-col justify-between overflow-x-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-brand-accent/10 blur-[120px] pointer-events-none" />

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="lg:col-span-7 space-y-8 text-left"
        >
          {/* Tagline */}
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center space-x-2 bg-brand-primary/5 border border-brand-primary/20 px-3.5 py-1.5 rounded-full"
          >
            <GraduationCap className="w-4 h-4 text-brand-primary" />
            <span className="text-xs font-semibold tracking-wide text-brand-primary font-display uppercase">Designed for University Students</span>
          </motion.div>

          {/* Heading */}
          <motion.h1 
            variants={itemVariants}
            className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.1] tracking-tight"
          >
            Master Your Next <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-accent neon-text-glow">
              Technical Interview
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p 
            variants={itemVariants}
            className="text-gray-400 text-base sm:text-lg max-w-xl font-normal leading-relaxed"
          >
            A high-fidelity mock interview coach powered by Gemini. Upload your resume, input your GitHub, and experience an adaptive technical examination customized precisely to your proven codebase and claimed skills.
          </motion.p>

          {/* CTAs */}
          <motion.div 
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 pt-2"
          >
            <button
              onClick={() => onNavigate(isLoggedIn ? "dashboard" : "login")}
              className="px-8 py-4 rounded-xl bg-linear-to-r from-brand-accent to-brand-primary text-brand-bg font-bold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-xl flex items-center justify-center space-x-2 neon-glow-btn group cursor-pointer"
              id="cta-start"
            >
              <span>{isLoggedIn ? "Go to Dashboard" : "Start Mock Interview"}</span>
              <ArrowRight className="w-4 h-4 text-brand-bg group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#how-it-works"
              className="px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-center transition-colors duration-200 border border-white/5"
            >
              See How It Works
            </a>
          </motion.div>

          {/* Micro-Credentials */}
          <motion.div 
            variants={itemVariants}
            className="grid grid-cols-3 gap-6 pt-6 border-t border-white/5 text-left"
          >
            <div>
              <div className="font-display font-bold text-2xl text-white">100%</div>
              <div className="text-xs text-gray-400 font-mono">Tailored Questions</div>
            </div>
            <div>
              <div className="font-display font-bold text-2xl text-white">Live</div>
              <div className="text-xs text-gray-400 font-mono">Voice & Video API</div>
            </div>
            <div>
              <div className="font-display font-bold text-2xl text-white">Zero</div>
              <div className="text-xs text-gray-400 font-mono">Bias Analysis</div>
            </div>
          </motion.div>
        </motion.div>

        {/* Visual Showcase Graphic */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="lg:col-span-5 relative"
        >
          <div className="relative w-full h-[380px] sm:h-[450px] rounded-2xl bg-brand-card/80 border border-white/5 p-6 flex flex-col justify-between shadow-2xl glass-panel">
            {/* Mock Webcam Stream Panel */}
            <div className="relative h-44 rounded-xl bg-black overflow-hidden flex items-center justify-center border border-white/10 group">
              <div className="absolute top-3 left-3 bg-red-600 w-2.5 h-2.5 rounded-full animate-pulse" />
              <div className="absolute top-3 right-3 bg-white/10 text-white font-mono text-[9px] px-2 py-0.5 rounded uppercase">Webcam Enabled</div>
              <Terminal className="w-8 h-8 text-brand-primary opacity-40 group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white font-mono text-[10px] px-3 py-1 rounded">
                Eye Contact Status: <span className="text-brand-primary">High Engagement</span>
              </div>
            </div>

            {/* Simulated Live Interview Card */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs font-mono text-gray-400">
                <span className="px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary border border-brand-primary/20">ROUND 3: Technical Depth</span>
                <span>•</span>
                <span>Adaptive</span>
              </div>
              <h3 className="text-white font-display font-medium text-base leading-snug">
                "Since you built the TypeScript compiler project mentioned in your portfolio, how did you architect the type-checker to handle cyclical module imports?"
              </h3>
              
              {/* Audio visualizer bar graph simulation */}
              <div className="flex items-center justify-between space-x-1.5 h-6 bg-brand-bg/50 px-4 py-1.5 rounded-lg border border-white/5">
                <span className="text-[9px] font-mono text-gray-500">USER INPUT (MIC)</span>
                <div className="flex items-center space-x-0.5">
                  <div className="w-1 h-3 bg-brand-primary rounded animate-pulse" style={{ animationDelay: "0.1s" }} />
                  <div className="w-1 h-4 bg-brand-primary rounded animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <div className="w-1 h-2 bg-brand-primary rounded animate-pulse" style={{ animationDelay: "0.3s" }} />
                  <div className="w-1 h-5 bg-brand-primary rounded animate-pulse" style={{ animationDelay: "0.4s" }} />
                  <div className="w-1 h-3 bg-brand-primary rounded animate-pulse" style={{ animationDelay: "0.5s" }} />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Feature Value Propositions */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 border-t border-white/5 w-full text-center">
        <div className="max-w-3xl mx-auto space-y-4 mb-16">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">How Coach Works</h2>
          <p className="text-gray-400">Our evaluation pipeline is highly objective and focuses strictly on evidence, communication flow, and technical capability.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-brand-card/40 border border-white/5 hover:border-brand-primary/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-6">
              <FileText className="w-6 h-6 text-brand-primary" />
            </div>
            <h4 className="text-white font-display font-semibold text-lg mb-3">Portfolio Alignment</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              We extract tech stack definitions from your resume and fetch actual project evidence from public GitHub repositories, cross-referencing your portfolio to avoid canned, generic templates.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-brand-card/40 border border-white/5 hover:border-brand-primary/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-6">
              <Terminal className="w-6 h-6 text-brand-primary" />
            </div>
            <h4 className="text-white font-display font-semibold text-lg mb-3">Live Adaptive Questions</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              Questions escalate dynamically. As you answer, Gemini Live API handles audio reasoning, presenting tougher logic, systems architecture, and design trade-off queries.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-brand-card/40 border border-white/5 hover:border-brand-primary/20 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-6">
              <Award className="w-6 h-6 text-brand-primary" />
            </div>
            <h4 className="text-white font-display font-semibold text-lg mb-3">Observable Metrics ONLY</h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              We analyze vocabulary richness, structuring, filler-word counts, and pacing. We strictly grade observable communication presentation metrics—not emotional or personal traits.
            </p>
          </div>
        </div>
      </section>

      {/* Humble University footer */}
      <footer className="w-full border-t border-white/5 py-8 text-center text-xs text-gray-500 font-mono">
        © 2026 University Career Center Tech Lab • Powered by Gemini Flash
      </footer>
    </div>
  );
}
