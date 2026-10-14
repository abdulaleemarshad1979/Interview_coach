import mongoose from 'mongoose';
import type { InterviewSession, InterviewSessionSummary } from '../../src/lib/interviewTypes';
import { remainingSeconds } from './engine';

export interface InterviewOperation {
  id: string;
  requestId: string;
  kind: 'start' | 'answer' | 'complete';
  expiresAt: number;
}
export interface InterviewRequestRecord {
  requestId: string;
  kind: InterviewOperation['kind'];
  hash: string;
  completed: boolean;
  turnId?: string;
}
export interface StoredInterview {
  session: InterviewSession;
  operation: InterviewOperation | null;
  requests: InterviewRequestRecord[];
}
export interface InterviewStore {
  create(ownerId: string, session: InterviewSession): Promise<void>;
  get(ownerId: string, id: string): Promise<StoredInterview | null>;
  list(ownerId: string, limit: number, before?: string): Promise<{ sessions: InterviewSessionSummary[]; nextCursor: string | null }>;
  claim(ownerId: string, id: string, version: number, operation: InterviewOperation): Promise<StoredInterview | null>;
  save(ownerId: string, id: string, operationId: string, session: InterviewSession, requests: InterviewRequestRecord[], release: boolean): Promise<StoredInterview | null>;
  release(ownerId: string, id: string, operationId: string, error: InterviewSession['lastError']): Promise<void>;
  cancel(ownerId: string, id: string, expiredOnly?: boolean, expectedVersion?: number): Promise<StoredInterview | null>;
  delete(ownerId: string, id: string): Promise<boolean>;
}

const schema = new mongoose.Schema({
  _id: { type: String, required: true }, ownerId: { type: String, required: true },
  version: { type: Number, required: true, default: 0 }, schemaVersion: { type: Number, default: 1 },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  operation: { type: mongoose.Schema.Types.Mixed, default: null },
  requests: { type: [mongoose.Schema.Types.Mixed], default: [] },
  updatedAt: { type: Date, required: true }, createdAt: { type: Date, required: true },
}, { minimize: false, versionKey: false, collection: 'interview_sessions' });
schema.index({ ownerId: 1, _id: -1 });
schema.index({ ownerId: 1, updatedAt: -1 });
schema.index({ ownerId: 1, createdAt: -1, _id: -1 });
const InterviewDocument: mongoose.Model<any> = mongoose.models.AdaptiveInterviewSession || mongoose.model('AdaptiveInterviewSession', schema);

function view(document: any): StoredInterview | null {
  if (!document) return null;
  const payload = document.payload as InterviewSession;
  return {
    session: { ...payload, id: document._id, version: document.version, updatedAt: new Date(document.updatedAt).toISOString(), remainingSeconds: remainingSeconds(payload), isProcessing: Boolean(document.operation && document.operation.expiresAt > Date.now()) },
    operation: document.operation || null,
    requests: document.requests || [],
  };
}

export class MongoInterviewStore implements InterviewStore {
  async create(ownerId: string, session: InterviewSession) {
    await InterviewDocument.create({ _id: session.id, ownerId, version: 0, payload: session, operation: null, requests: [], createdAt: new Date(session.createdAt), updatedAt: new Date(session.updatedAt) });
  }
  async get(ownerId: string, id: string) {
    return view(await InterviewDocument.findOne({ _id: id, ownerId }).lean());
  }
  async list(ownerId: string, limit: number, before?: string) {
    const cursor = before ? await InterviewDocument.findOne({ _id: before, ownerId }).select({ createdAt: 1 }).lean() as any : null;
    const documents = await InterviewDocument.find({ ownerId, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: before } }] } : {}) })
      .select({ _id: 1, 'payload.state': 1, 'payload.config.targetRole': 1, 'payload.config.mode': 1, 'payload.createdAt': 1, updatedAt: 1, 'payload.turns.role': 1, 'payload.report.overallScore': 1 })
      .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const items = documents.slice(0, limit);
    return {
      sessions: items.map((doc: any) => ({
        id: doc._id, state: doc.payload.state, targetRole: doc.payload.config.targetRole,
        mode: doc.payload.config.mode, createdAt: doc.payload.createdAt, updatedAt: new Date(doc.updatedAt).toISOString(),
        answerCount: (doc.payload.turns || []).filter((turn: any) => turn.role === 'candidate').length,
        overallScore: doc.payload.report?.overallScore ?? null,
      })),
      nextCursor: documents.length > limit ? items.at(-1)?._id as string : null,
    };
  }
  async claim(ownerId: string, id: string, version: number, operation: InterviewOperation) {
    return view(await InterviewDocument.findOneAndUpdate({
      _id: id, ownerId, version,
      $or: [{ operation: null }, { 'operation.expiresAt': { $lte: Date.now() } }],
    }, { $set: { operation, updatedAt: new Date(), 'payload.isProcessing': true }, $inc: { version: 1 } }, { returnDocument: 'after' }).lean());
  }
  async save(ownerId: string, id: string, operationId: string, session: InterviewSession, requests: InterviewRequestRecord[], release: boolean) {
    return view(await InterviewDocument.findOneAndUpdate({ _id: id, ownerId, 'operation.id': operationId, 'operation.expiresAt': { $gt: Date.now() } }, {
      $set: { payload: { ...session, isProcessing: !release }, requests, updatedAt: new Date(), ...(release ? { operation: null } : {}) },
      $inc: { version: 1 },
    }, { returnDocument: 'after' }).lean());
  }
  async release(ownerId: string, id: string, operationId: string, error: InterviewSession['lastError']) {
    await InterviewDocument.updateOne({ _id: id, ownerId, 'operation.id': operationId }, { $set: { operation: null, 'payload.isProcessing': false, 'payload.lastError': error, updatedAt: new Date() }, $inc: { version: 1 } });
  }
  async cancel(ownerId: string, id: string, expiredOnly = false, expectedVersion?: number) {
    return view(await InterviewDocument.findOneAndUpdate({ _id: id, ownerId, ...(expectedVersion === undefined ? {} : { version: expectedVersion }), ...(expiredOnly ? { $or: [{ operation: null }, { 'operation.expiresAt': { $lte: Date.now() } }] } : {}) }, {
      $set: { operation: null, 'payload.isProcessing': false, updatedAt: new Date() }, $inc: { version: 1 },
    }, { returnDocument: 'after' }).lean());
  }
  async delete(ownerId: string, id: string) {
    const result = await InterviewDocument.deleteOne({ _id: id, ownerId });
    return result.deletedCount > 0;
  }
}
