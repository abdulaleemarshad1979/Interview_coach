import type { InterviewSession, InterviewSessionSummary } from '../../src/lib/interviewTypes';
import { supabase } from '../supabase/client';
import { toStoredInterview, type InterviewOperation, type InterviewRequestRecord, type InterviewStore, type StoredInterview } from './store';

const COLUMNS = 'id, payload, version, updated_at, operation, requests';
const fail = (error: { message: string } | null) => { if (error) throw new Error(`Supabase: ${error.message}`); };
const first = (data: unknown): any | null => (Array.isArray(data) ? data[0] : data) ?? null;
const view = (row: any): StoredInterview | null => row ? toStoredInterview({ id: row.id, payload: row.payload, version: row.version, updatedAt: row.updated_at, operation: row.operation, requests: row.requests }) : null;

/** Same contract as MongoInterviewStore; concurrency control lives in atomic SQL functions (see supabase/migrations). */
export class SupabaseInterviewStore implements InterviewStore {
  async create(ownerId: string, session: InterviewSession) {
    const { error } = await supabase().from('interview_sessions').insert({
      id: session.id, owner_id: ownerId, version: 0, state: session.state, target_role: session.config.targetRole, mode: session.config.mode,
      payload: session, requests: [], created_at: session.createdAt, updated_at: session.updatedAt,
    });
    fail(error);
  }
  async get(ownerId: string, id: string) {
    const { data, error } = await supabase().from('interview_sessions').select(COLUMNS).eq('id', id).eq('owner_id', ownerId).maybeSingle();
    fail(error); return view(data);
  }
  async list(ownerId: string, limit: number, before?: string) {
    let query = supabase().from('interview_sessions').select('id, state, target_role, mode, created_at, updated_at, answer_count, overall_score').eq('owner_id', ownerId);
    if (before) {
      const { data: cursor, error } = await supabase().from('interview_sessions').select('created_at').eq('id', before).eq('owner_id', ownerId).maybeSingle();
      fail(error);
      if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${before})`);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    fail(error);
    const rows = data || [], items = rows.slice(0, limit);
    const sessions: InterviewSessionSummary[] = items.map(row => ({ id: row.id, state: row.state, targetRole: row.target_role, mode: row.mode, createdAt: row.created_at,
      updatedAt: row.updated_at, answerCount: row.answer_count, overallScore: row.overall_score ?? null }));
    return { sessions, nextCursor: rows.length > limit ? items.at(-1)!.id as string : null };
  }
  async claim(ownerId: string, id: string, version: number, operation: InterviewOperation) {
    const { data, error } = await supabase().rpc('interview_claim', { p_owner: ownerId, p_id: id, p_version: version, p_op: operation });
    fail(error); return view(first(data));
  }
  async save(ownerId: string, id: string, operationId: string, session: InterviewSession, requests: InterviewRequestRecord[], release: boolean) {
    const { data, error } = await supabase().rpc('interview_save', { p_owner: ownerId, p_id: id, p_op_id: operationId, p_payload: session, p_requests: requests, p_release: release });
    fail(error); return view(first(data));
  }
  async release(ownerId: string, id: string, operationId: string, lastError: InterviewSession['lastError']) {
    const { error } = await supabase().rpc('interview_release', { p_owner: ownerId, p_id: id, p_op_id: operationId, p_error: lastError });
    fail(error);
  }
  async cancel(ownerId: string, id: string, expiredOnly = false, expectedVersion?: number) {
    const { data, error } = await supabase().rpc('interview_cancel', { p_owner: ownerId, p_id: id, p_expired_only: expiredOnly, p_version: expectedVersion ?? null });
    fail(error); return view(first(data));
  }
  async delete(ownerId: string, id: string) {
    const { data, error } = await supabase().from('interview_sessions').delete().eq('id', id).eq('owner_id', ownerId).select('id');
    fail(error); return (data?.length ?? 0) > 0;
  }
}
