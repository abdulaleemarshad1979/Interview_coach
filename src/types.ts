/**
 * Shared Type Definitions for Interview Coach
 */

export interface CompanyPlacementDrive {
  id: string;
  companyName: string;
  roleTitle: string;
  driveType: "Campus Placement" | "Off-Campus Drive" | "Technical HR" | "Soft Skills & Communication" | "System Design";
  description?: string;
  materialText?: string;
  requiredSkills: string[];
  sampleQuestions?: string[];
  createdByFacultyName?: string;
  createdAt?: string;
  assignedSection?: string;
}

export interface StudentProfile {
  studentId: string;
  githubUsername?: string;
  resumeFileName?: string;
  name?: string;
  classSection?: string;
  department?: string;
  academicYear?: string;
  attendance?: number;
  profileImage?: string;
  collegeAssessments?: Array<{
    examName: string;
    percentage: number;
    marks: string;
  }>;
  isSynced?: boolean;

  course?: string;

  assignedInterviewTopic?: string;
  assignedInterviewDifficulty?: string;
  assignedGDTopic?: string;
  assignedGDRoomCode?: string;
  assignedByProctorName?: string;
  assignedProctorId?: string;
  assignedProctorName?: string;

  assignedCompanyDrive?: CompanyPlacementDrive;
}



export interface ParsedResume {
  name: string;
  email?: string;
  education: Array<{
    school: string;
    degree: string;
    major: string;
    graduationDate: string;
  }>;
  skills: string[];
  projects: Array<{
    title: string;
    description: string;
    technologies: string[];
  }>;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  achievements: string[];
}

export interface GitHubRepoAnalysis {
  name: string;
  description: string;
  languages: string[];
  primaryLanguage: string;
  stars: number;
  forks: number;
  url: string;
}

export interface GitHubAnalysisResult {
  primaryStack: string[];
  repos: GitHubRepoAnalysis[];
  qualitySignals: string[];
  weakAreas: string[];
}

export interface CrossReferenceResult {
  alignmentScore: number;
  provenClaims: string[];
  unprovenClaims: string[];
  suggestions: string[];
}

export interface FullAnalysisResult {
  parsedResume: ParsedResume;
  githubAnalysis: GitHubAnalysisResult;
  crossReference: CrossReferenceResult;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  category: string;
  difficulty: 'Beginner' | 'Developing' | 'Intermediate' | 'Advanced' | 'Expert';
}

export interface AnswerFeedback {
  questionId: string;
  questionText: string;
  transcript: string;
  score: number; // 0-100
  pacing: 'Slow' | 'Optimal' | 'Fast';
  fillerWordCount: number;
  strengths: string[];
  improvements: string[];
  speechFeedback: string;
  contentFeedback: string;
  presentationFeedback: string; // eye contact, posture, etc.

  // SoftSkills Assessment Framework (Image 1 & 2 Parameters)
  clarityPronunciation?: number; // 1-5 scale (Video recording / audio acoustic clarity)
  fluencyPace?: number; // 1-5 scale (Speaking test / optimal WPM & pauses)
  grammarAccuracy?: number; // 0-100 percentage (Syntactic accuracy)
  vocabularyUsage?: number; // 0-100 percentage (Lexical richness & technical usage)
  coherenceIdeas?: number; // 1-5 scale (STAR logical structure & clarity)
  confidenceRating?: number; // 1-5 scale (Vocal modulation & on-camera composure)
  vocalConfidence?: number;
  audioClarity?: number; // SNR score 0-100
  pitchVariance?: number; // Pitch inflection 0-100
  speakingPace?: number; // WPM
}

export interface Scorecard {
  id: string;
  studentId: string;
  githubUsername: string;
  date: string;
  overallScore: number;
  candidateLevel: 'Beginner' | 'Developing' | 'Interview Ready' | 'Strong Candidate' | 'Excellent Candidate';
  interviewType?: 'technical' | 'soft-skills';

  // SoftSkills Assessment Framework: Image 1 Speaking Test Evidence Parameters
  clarityPronunciation: number; // 1-5 rating (Evidence: Video Recording)
  fluencyPace: number; // 1-5 rating (Evidence: Speaking Test)
  grammarAccuracy: number; // % Score (Evidence: Grammar Test)
  vocabularyUsage: number; // % Score (Evidence: MCQ / Spoken Test)
  coherenceIdeas: number; // 1-5 rating (Evidence: Speaking Test / STAR Flow)
  confidenceRating: number; // 1-5 rating (Evidence: Video / Interview)

  // SoftSkills Assessment Framework: Image 2 Assessment Parameters & Evolution
  communicationClarityLevel: 'Low' | 'Medium' | 'High';
  communicationClarityScore: number; // 0-100 % score
  grammarVocabularyScore: number; // % score
  fluencyConfidenceRating: number; // 1-5 rating
  presentationSkillsScore: number; // Rubric score 0-100
  teamworkLeadershipRating: number; // 1-5 rating
  interviewReadinessScore: number; // Score 0-100
  bodyLanguageEtiquetteRating: number; // 1-5 rating

  // Before & After Training Comparative Metrics (from PDF Framework)
  trainingComparison?: {
    communicationClarity: { before: string; after: string; method: string };
    grammarVocabulary: { before: string; after: string; method: string };
    fluencyConfidence: { before: string; after: string; method: string };
    presentationSkills: { before: string; after: string; method: string };
    teamworkLeadership: { before: string; after: string; method: string };
    interviewReadiness: { before: string; after: string; method: string };
    bodyLanguageEtiquette: { before: string; after: string; method: string };
  };

  categoryScores: {
    resumeStrength?: number;
    githubStrength?: number;
    technicalDepth?: number;
    problemSolving: number;
    communicationClarity: number;
    vocabularyRichness?: number;
    presentationConfidence: number;
    overallReadiness: number;
    teamworkCollaboration?: number;
    adaptabilityResilience?: number;
    ownershipEQ?: number;
    clarityPronunciation?: number;
    fluencyPace?: number;
    grammarAccuracy?: number;
    vocabularyUsage?: number;
    coherenceIdeas?: number;
    confidence?: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendedTopics: string[];
  sampleAnswers: Array<{
    question: string;
    originalResponse: string;
    improvedVersion: string;
    explanation: string;
  }>;
  finalVerdict: string;
  companyDriveName?: string;
  companyRoleTitle?: string;
}

export interface FacultyProfile {
  facultyId: string;
  name: string;
  email: string;
  department: string;
  classSection: string;
  rollPrefix: string;
  rollStart: number;
  rollEnd: number;
  isFaculty: boolean;
  companyDrives?: CompanyPlacementDrive[];
  assignedInterviews?: Array<{
    id: string;
    studentId: string;
    topic: string;
    difficulty: string;
    companyName?: string;
    roleTitle?: string;
    assignedAt: string;
    completed: boolean;
    score?: number;
  }>;
  assignedGDs?: Array<{
    id: string;
    roomCode: string;
    topic: string;
    students: string[]; // list of studentIds
    assignedAt: string;
    completed: boolean;
  }>;
}

export interface AdminProfile {
  adminId: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

