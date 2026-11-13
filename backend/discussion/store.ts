import mongoose from 'mongoose';
import type { DiscussionSession } from '../../src/lib/discussionTypes';
import { supabase, supabaseConfigured } from '../supabase/client';

export interface DiscussionStore {
  create(ownerId: string, session: DiscussionSession): Promise<void>;
  get(ownerId: string, id: string): Promise<DiscussionSession | null>;
  /** Optimistic save: false when the stored version is no longer `session.version`. Bumps the version on success. */
  save(ownerId: string, session: DiscussionSession): Promise<DiscussionSession | null>;
  list(ownerId: string, limit: number): Promise<Array<Pick<DiscussionSession, 'id' | 'topic' | 'state' | 'createdAt' | 'updatedAt'> & { overallScore: number | null }>>;
}

const Doc: mongoose.Model<any> = mongoose.models.DiscussionSessionDoc || mongoose.model('DiscussionSessionDoc', new mongoose.Schema({
  _id: String, ownerId: { type: String, required: true, index: true }, version: { type: Number, default: 0 },
  payload: mongoose.Schema.Types.Mixed, createdAt: Date, updatedAt: Date,
}, { versionKey: false, minimize: false, collection: 'discussion_sessions' }));

const withVersion = (payload: DiscussionSession, version: number, updatedAt: Date | string): DiscussionSession => ({ ...payload, version, updatedAt: new Date(updatedAt).toISOString() });

const mongoStore: DiscussionStore = {
  async create(ownerId, s) { await Doc.create({ _id: s.id, ownerId, version: 0, payload: s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) }); },
  async get(ownerId, id) { const d: any = await Doc.findOne({ _id: id, ownerId }).lean(); return d ? withVersion(d.payload, d.version, d.updatedAt) : null; },
  async save(ownerId, s) {
    const d: any = await Doc.findOneAndUpdate({ _id: s.id, ownerId, version: s.version }, { $set: { payload: s, updatedAt: new Date() }, $inc: { version: 1 } }, { returnDocument: 'after' }).lean();
    return d ? withVersion(d.payload, d.version, d.updatedAt) : null;
  },
  async list(ownerId, limit) {
    const docs = await Doc.find({ ownerId }).select({ 'payload.topic': 1, 'payload.state': 1, 'payload.report.overallScore': 1, createdAt: 1, updatedAt: 1 }).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((d: any) => ({ id: d._id, topic: d.payload.topic, state: d.payload.state, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(), overallScore: d.payload.report?.overallScore ?? null }));
  },
};

const must = (error: { message: string } | null) => { if (error) throw new Error(`Supabase: ${error.message}`); };
const supabaseStore: DiscussionStore = {
  async create(ownerId, s) { must((await supabase().from('discussion_sessions').insert({ id: s.id, owner_id: ownerId, payload: s, created_at: s.createdAt, updated_at: s.updatedAt })).error); },
  async get(ownerId, id) {
    const { data, error } = await supabase().from('discussion_sessions').select('payload, version, updated_at').eq('id', id).eq('owner_id', ownerId).maybeSingle();
    must(error); return data ? withVersion(data.payload, data.version, data.updated_at) : null;
  },
  async save(ownerId, s) {
    const { data, error } = await supabase().from('discussion_sessions').update({ payload: s, version: s.version + 1, updated_at: new Date().toISOString() })
      .eq('id', s.id).eq('owner_id', ownerId).eq('version', s.version).select('payload, version, updated_at').maybeSingle();
    must(error); return data ? withVersion(data.payload, data.version, data.updated_at) : null;
  },
  async list(ownerId, limit) {
    const { data, error } = await supabase().from('discussion_sessions').select('id, topic:payload->>topic, state:payload->>state, score:payload->report->>overallScore, created_at, updated_at')
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit);
    must(error);
    return (data || []).map((r: any) => ({ id: r.id, topic: r.topic, state: r.state, createdAt: r.created_at, updatedAt: r.updated_at, overallScore: r.score == null ? null : Number(r.score) }));
  },
};

export const createDiscussionStore = (): DiscussionStore => (supabaseConfigured() ? supabaseStore : mongoStore);
