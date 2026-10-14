import { apiFetch } from "./api";

export interface MeetingCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
}
export interface MeetingReport {
  summary: string;
  strongestArguments: Array<{ segmentId: string; quote: string }>;
  criteria: Array<MeetingCriterion & { score: number | null; explanation: string; evidence: Array<{ segmentId: string; quote: string }> }>;
  overallScore: number | null;
  improvements: string[];
  exercises: string[];
  uncertainties: string[];
  evidenceAvailable: boolean;
  turnCount: number;
  speakingSeconds: number;
  durationSource: string;
  attribution: string;
  provider: string | null;
  model: string | null;
}
export interface MeetingRoomInfo {
  code: string;
  title: string;
  topic: string;
  status: "OPEN" | "ENDED";
  waitingRoom: boolean;
  hasPasscode: boolean;
  observerMode: "OFF" | "PASSIVE" | "ACTIVE";
  rubric: MeetingCriterion[];
  retentionDays: number;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
}
export interface MeetingMemberInfo {
  identity: string;
  displayName: string;
  role: "HOST" | "PARTICIPANT";
  status: "WAITING" | "ADMITTED" | "DENIED" | "LEFT";
  handRaised: boolean;
  transcriptConsent: boolean;
  joinedAt: string;
  report?: MeetingReport | null;
  consentVersion?: string;
  activity?: { turnCount: number; speakingSeconds: number; participationShare: number | null };
}
export interface MeetingSegment {
  id: string;
  identity: string;
  speakerName: string;
  text: string;
  status: "TRANSCRIBING" | "FINAL" | "CORRECTED" | "FAILED";
  startedAt: string;
  endedAt: string;
  speakingSeconds: number;
  attribution: string;
}
export interface MeetingSnapshot {
  room: MeetingRoomInfo;
  me: MeetingMemberInfo;
  participants: MeetingMemberInfo[];
  transcript: MeetingSegment[];
  events: Array<{ id: string; type: "CHAT" | "MODERATOR"; speakerName: string; text: string; createdAt: string }>;
  reports?: Array<{ identity: string; displayName: string; report: MeetingReport }>;
}
export interface MeetingStatus {
  configured: boolean;
  missing: string[];
  urlValid: boolean;
  consentVersion: string;
  tokenLifetimeSeconds: number;
}
export class MeetingApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function meetingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(`/api/meetings${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new MeetingApiError(typeof data.error === "string" ? data.error : "The discussion service is unavailable. Please retry.", data.code || "REQUEST_FAILED", response.status);
  return data as T;
}
export function postMeeting<T>(path: string, body: unknown = {}, signal?: AbortSignal) {
  return meetingRequest<T>(path, { method: "POST", body: JSON.stringify(body), signal });
}
export function formatMeetingId(code: string) { return code.match(/.{1,4}/g)?.join("-") || code; }
export function meetingInvitation(code: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("meeting", code);
  return url.toString();
}
