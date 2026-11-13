export const INTERVIEW_STATES = [
  'PREPARING', 'INTRODUCTION', 'QUESTIONING', 'FOLLOW_UP',
  'TOPIC_TRANSITION', 'CLOSING', 'EVALUATION', 'COMPLETED',
] as const;

export type InterviewState = typeof INTERVIEW_STATES[number];
export type InterviewMode = 'technical' | 'hr' | 'behavioral' | 'resume' | 'project' | 'system-design' | 'coding' | 'mixed';
export type InterviewDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface InterviewConfig {
  mode: InterviewMode;
  targetRole: string;
  experienceLevel: 'student' | 'junior' | 'mid' | 'senior';
  technicalDomain: string;
  difficulty: InterviewDifficulty;
  durationMinutes: number;
  resumeText?: string;
  companyName?: string;
  jobDescription?: string;
  githubContext?: string;
  githubUsername?: string;
  questionBankId?: string;
  companyQuestions?: string[];
  shareWithFaculty?: boolean;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  topic: string;
  difficulty: InterviewDifficulty;
  kind: 'INTRODUCTION' | 'PRIMARY' | 'FOLLOW_UP';
  basedOnTurnId?: string;
  groundedIn?: string;
}

/** Observable delivery signals captured while one answer was spoken. Never emotion or personality. */
export interface DeliveryMetrics {
  durationMs: number;
  speechMs: number;
  silenceMs: number;
  longPauses: number;
  camera?: { samples: number; faceRatio: number; eyeContactRatio: number; steadiness: number };
}

export interface InterviewTurn {
  id: string;
  role: 'interviewer' | 'candidate';
  text: string;
  questionId?: string;
  createdAt: string;
  delivery?: DeliveryMetrics;
}

export interface DeliveryReport {
  /** 0-100 composite of the available components; null when no delivery signal was captured. */
  score: number | null;
  /** Share of the overall score contributed by delivery (0 when score is null). */
  weight: number;
  components: { eyeContact: number | null; presence: number | null; pacing: number | null; fluency: number | null; hesitation: number | null };
  wordsPerMinute: number | null;
  fillersPer100Words: number | null;
  answersWithCamera: number;
  answersWithVoice: number;
  notes: string[];
}

export interface InterviewEvidence {
  turnId: string;
  quote: string;
  explanation: string;
}

export const INTERVIEW_DIMENSIONS = [
  'technicalAccuracy', 'reasoningQuality', 'communicationClarity',
  'relevance', 'completeness', 'problemSolving', 'supportedConfidence',
] as const;
export type InterviewDimension = typeof INTERVIEW_DIMENSIONS[number];

export interface InterviewDimensionScore {
  score: number | null;
  feedback: string;
  evidence: InterviewEvidence[];
}

export interface InterviewReport {
  id: string;
  sessionId: string;
  createdAt: string;
  overallScore: number | null;
  summary: string;
  dimensions: Record<InterviewDimension, InterviewDimensionScore>;
  strengths: Array<{ text: string; evidence: InterviewEvidence[] }>;
  improvements: Array<{ text: string; evidence: InterviewEvidence[] }>;
  practiceExercises: string[];
  limitations: string[];
  /** Weighted into overallScore: overall = (1 - delivery.weight) * content + delivery.weight * delivery.score. */
  delivery?: DeliveryReport;
  contentScore?: number | null;
  provider: string;
  model: string;
}

export interface InterviewMemory {
  coveredTopics: string[];
  candidateClaims: Array<{ text: string; turnId: string; quote: string }>;
  followUpOpportunities: string[];
  difficulty: InterviewDifficulty;
  followUpCount: number;
  summary: string;
}

export interface InterviewUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface InterviewSession {
  id: string;
  version: number;
  state: InterviewState;
  config: InterviewConfig;
  currentQuestion: InterviewQuestion | null;
  turns: InterviewTurn[];
  memory: InterviewMemory;
  report: InterviewReport | null;
  usage: InterviewUsage;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  remainingSeconds: number;
  isProcessing: boolean;
  pendingAnswer: { requestId: string; questionId: string; turnId: string } | null;
  lastError: { code: string; message: string; retryable: boolean } | null;
}

export interface InterviewSessionSummary {
  id: string;
  state: InterviewState;
  targetRole: string;
  mode: InterviewMode;
  createdAt: string;
  updatedAt: string;
  answerCount: number;
  overallScore: number | null;
}

export interface InterviewMutation {
  requestId: string;
  expectedVersion: number;
}

export interface InterviewAnswerInput extends InterviewMutation {
  questionId: string;
  text: string;
}

export type InterviewStreamEvent =
  | { event: 'status'; data: { state: InterviewState; message: string } }
  | { event: 'delta'; data: { text: string; provisional: true } }
  | { event: 'session'; data: { session: InterviewSession } }
  | { event: 'error'; data: { error: string; code: string; retryable: boolean } };
