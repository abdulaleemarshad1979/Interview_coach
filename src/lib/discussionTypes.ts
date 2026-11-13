import type { DeliveryMetrics, DeliveryReport, InterviewEvidence } from './interviewTypes';

export const PANEL = [
  { id: 'aisha', name: 'Aisha', persona: 'a pragmatic engineer who grounds arguments in concrete examples and data' },
  { id: 'rahul', name: 'Rahul', persona: 'a polite devil\'s advocate who challenges assumptions and asks for evidence' },
  { id: 'meera', name: 'Meera', persona: 'a collaborative facilitator who connects ideas and invites quieter views' },
] as const;

export const DISCUSSION_CRITERIA = ['argumentQuality', 'topicUnderstanding', 'communicationClarity', 'collaboration'] as const;
export type DiscussionCriterion = typeof DISCUSSION_CRITERIA[number];
export const CRITERIA_WEIGHTS: Record<DiscussionCriterion, number> = { argumentQuality: 0.3, topicUnderstanding: 0.25, communicationClarity: 0.25, collaboration: 0.2 };

export interface DiscussionTurn {
  id: string;
  /** 'candidate' is the signed-in student; 'interviewer' marks an AI panelist (shape shared with interview evidence checks). */
  role: 'candidate' | 'interviewer';
  speaker: string;
  name: string;
  text: string;
  createdAt: string;
  delivery?: DeliveryMetrics;
}

export interface DiscussionReport {
  id: string;
  createdAt: string;
  summary: string;
  criteria: Record<DiscussionCriterion, { score: number | null; feedback: string; evidence: InterviewEvidence[] }>;
  contentScore: number | null;
  delivery: DeliveryReport;
  overallScore: number | null;
  strengths: string[];
  improvements: string[];
  limitations: string[];
  model: string;
}

export interface DiscussionSession {
  id: string;
  version: number;
  topic: string;
  state: 'ACTIVE' | 'COMPLETED';
  turns: DiscussionTurn[];
  report: DiscussionReport | null;
  createdAt: string;
  updatedAt: string;
}
