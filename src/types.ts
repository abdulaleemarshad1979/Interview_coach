/**
 * Shared Type Definitions for Interview Coach
 */

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
  category: 'Intro' | 'Project Explanation' | 'Technical Depth' | 'Problem Solving' | 'Architecture' | 'Real-World Tradeoffs';
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
}

export interface Scorecard {
  id: string;
  studentId: string;
  githubUsername: string;
  date: string;
  overallScore: number;
  candidateLevel: 'Beginner' | 'Developing' | 'Interview Ready' | 'Strong Candidate' | 'Excellent Candidate';
  categoryScores: {
    resumeStrength: number;
    githubStrength: number;
    technicalDepth: number;
    problemSolving: number;
    communicationClarity: number;
    vocabularyRichness: number;
    presentationConfidence: number;
    overallReadiness: number;
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
  assignedInterviews?: Array<{
    id: string;
    studentId: string;
    topic: string;
    difficulty: string;
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

