import crypto from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import type { InterviewSession } from '../../src/lib/interviewTypes';
import { createAIProvider, type AIProvider } from '../ai/provider';
import { ServiceError, safeError } from '../errors';
import { assertTransition, generateInterviewTurn, generateReport, newSession, validateConfig } from './engine';
import { MongoInterviewStore, type InterviewOperation, type InterviewRequestRecord, type InterviewStore } from './store';

export interface InterviewRouterOptions {
  requireAuth: RequestHandler;
  connectDB: () => Promise<unknown>;
  store?: InterviewStore;
  provider?: AIProvider;
}
type AuthRequest = Request & { user?: { id: string } };
const activeOperations = new Map<string, { operationId: string; controller: AbortController }>();

function identity(req: AuthRequest): string {
  if (!req.user?.id) throw new ServiceError(401, 'UNAUTHENTICATED', 'Sign in to access interview sessions.');
  return req.user.id;
}
function sessionId(req: Request): string {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id || '')) throw new ServiceError(404, 'NOT_FOUND', 'Interview session not found.');
  return req.params.id;
}
function version(body: any) {
  if (!Number.isInteger(body?.expectedVersion) || body.expectedVersion < 0) throw new ServiceError(400, 'INVALID_REQUEST', 'A valid expectedVersion is required. Refresh the session before retrying.');
  return body.expectedVersion as number;
}
function mutationId(body: any) {
  if (typeof body?.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId)) throw new ServiceError(400, 'INVALID_REQUEST', 'Provide a stable requestId of 8–80 letters, numbers, hyphens, or underscores. Reuse it when retrying.');
  return body.requestId as string;
}
function missing(): never { throw new ServiceError(404, 'NOT_FOUND', 'Interview session not found.'); }
function errorResponse(res: Response, error: unknown) {
  const safe = safeError(error);
  if (!res.headersSent) res.status(safe.status === 499 ? 409 : safe.status).json({ error: safe.message, code: safe.code, retryable: safe.retryable });
  return safe;
}

export function createInterviewRouter(options: InterviewRouterOptions) {
  const router = express.Router();
  const store = options.store || new MongoInterviewStore();
  const provider = options.provider || createAIProvider();
  router.use(options.requireAuth);
  router.use(async (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { await options.connectDB(); next(); }
    catch { res.status(503).json({ error: 'The session database is unavailable. Please retry shortly.', code: 'DATABASE_UNAVAILABLE', retryable: true }); }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const config = validateConfig(req.body?.config);
      const session = newSession(config);
      await store.create(identity(req), session);
      res.status(201).json({ session });
    } catch (error) { errorResponse(res, error); }
  });
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (req.query.before && (typeof req.query.before !== 'string' || !/^[a-f0-9-]{36}$/i.test(req.query.before)))) throw new ServiceError(400, 'INVALID_REQUEST', 'Provide a limit between 1 and 50 and a valid history cursor.');
      res.json(await store.list(identity(req), limit, req.query.before as string | undefined));
    } catch (error) { errorResponse(res, error); }
  });
  router.get('/:id', async (req: AuthRequest, res) => {
    try { const data = await store.get(identity(req), sessionId(req)); if (!data) missing(); res.json({ session: data.session }); }
    catch (error) { errorResponse(res, error); }
  });
  router.get('/:id/report', async (req: AuthRequest, res) => {
    try {
      const data = await store.get(identity(req), sessionId(req)); if (!data) missing();
      if (!data.session.report) throw new ServiceError(409, 'REPORT_PENDING', 'A report has not been generated yet. Complete or retry evaluation.');
      res.json({ report: data.session.report });
    } catch (error) { errorResponse(res, error); }
  });

  async function run(req: AuthRequest, res: Response, kind: InterviewOperation['kind']) {
    let lease: InterviewOperation | undefined;
    let ownerId = '';
    let id = '';
    let stream = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    const send = (event: string, data: unknown) => {
      if (stream && !res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const close = () => { if (!res.writableEnded) controller.abort(); };
    try {
      ownerId = identity(req); id = sessionId(req);
      const expectedVersion = version(req.body);
      const requestId = mutationId(req.body);
      let data = await store.get(ownerId, id); if (!data) missing();
      let answerText = '';
      let questionId = '';
      if (kind === 'answer') {
        answerText = typeof req.body.text === 'string' ? req.body.text.trim() : '';
        questionId = typeof req.body.questionId === 'string' ? req.body.questionId : '';
        if (!answerText || answerText.length > 12000 || !/^[a-f0-9-]{36}$/i.test(questionId)) throw new ServiceError(400, 'INVALID_ANSWER', 'Provide an answer of 1–12,000 characters and the current question ID.');
      }
      const hash = crypto.createHash('sha256').update(JSON.stringify({ kind, questionId, answerText })).digest('hex');
      const previous = data.requests.find(item => item.requestId === requestId);
      if (previous && (previous.hash !== hash || previous.kind !== kind)) throw new ServiceError(409, 'REQUEST_ID_REUSED', 'This requestId was already used for a different action or answer.');
      if (previous?.completed) { res.json({ session: data.session }); return; }
      if (!previous && data.requests.length >= 256) throw new ServiceError(429, 'SESSION_REQUEST_LIMIT', 'This interview has reached its request limit. Retry an existing saved request or create a new session.');
      if (kind === 'start' && data.session.state !== 'PREPARING') throw new ServiceError(409, 'INVALID_STATE', 'This interview has already started. Resume the saved session.');
      if (kind === 'answer') {
        if (!['INTRODUCTION', 'QUESTIONING', 'FOLLOW_UP', 'TOPIC_TRANSITION'].includes(data.session.state) || data.session.currentQuestion?.id !== questionId) throw new ServiceError(409, 'STALE_QUESTION', 'This question has changed. Refresh the session before answering.');
        if (data.session.pendingAnswer && data.session.pendingAnswer.requestId !== requestId) throw new ServiceError(409, 'ANSWER_PENDING', 'Your previous answer is saved. Retry that request before submitting another answer.');
      }
      if (kind === 'complete') {
        if (data.session.state === 'COMPLETED') { res.json({ session: data.session }); return; }
        if (data.session.state === 'PREPARING' || !data.session.turns.some(turn => turn.role === 'candidate')) throw new ServiceError(409, 'NO_ANSWERS', 'Answer at least one question before completing the interview.');
      }
      if (data.session.version !== expectedVersion) throw new ServiceError(409, 'VERSION_CONFLICT', 'The interview changed in another request. Refresh it before retrying.');
      lease = { id: crypto.randomUUID(), requestId, kind, expiresAt: Date.now() + 150000 };
      const claimed = await store.claim(ownerId, id, expectedVersion, lease);
      if (!claimed) throw new ServiceError(409, 'SESSION_BUSY', 'Another request is processing this interview. Wait or cancel it before retrying.');
      data = claimed;
      activeOperations.set(`${ownerId}:${id}`, { operationId: lease.id, controller });
      stream = req.headers.accept?.includes('text/event-stream') === true;
      if (stream) {
        res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n'); }, 15000);
      }
      res.on('close', close);
      const records: InterviewRequestRecord[] = [...data.requests];
      let record = records.find(item => item.requestId === requestId);
      if (!record) { record = { requestId, kind, hash, completed: false }; records.push(record); }
      let working = structuredClone(data.session);
      if (kind === 'answer' && !record.turnId) {
        const turnId = crypto.randomUUID();
        working.turns.push({ id: turnId, role: 'candidate', text: answerText, questionId, createdAt: new Date().toISOString() });
        working.pendingAnswer = { requestId, questionId, turnId };
        record.turnId = turnId;
      }
      if (kind === 'complete') {
        if (working.state !== 'EVALUATION') {
          if (working.state !== 'CLOSING') { assertTransition(working.state, 'CLOSING'); working.state = 'CLOSING'; send('status', { state: 'CLOSING', message: 'Interview closed. Preparing transcript evidence.' }); }
          assertTransition(working.state, 'EVALUATION'); working.state = 'EVALUATION';
          working.currentQuestion = null;
          working.pendingAnswer = null;
        }
      }
      working.lastError = null;
      const saved = await store.save(ownerId, id, lease.id, working, records, false);
      if (!saved) throw new ServiceError(409, 'CANCELLED', 'The operation was cancelled. Refresh the saved session.', true);
      working = saved.session;
      send('status', { state: working.state, message: kind === 'complete' ? 'Evaluating saved transcript evidence.' : 'Generating a contextual interview question.' });
      if (kind === 'complete') working = await generateReport(working, provider, controller.signal);
      else working = await generateInterviewTurn(working, provider, {
        isStart: kind === 'start', signal: controller.signal,
        onPreview: stream ? text => send('delta', { text, provisional: true }) : undefined,
        onState: state => send('status', { state, message: state === 'TOPIC_TRANSITION' ? 'Moving to the next topic.' : 'Saving the validated interviewer response.' }),
      });
      controller.signal.throwIfAborted();
      record.completed = true;
      const final = await store.save(ownerId, id, lease.id, working, records, true);
      if (!final) throw new ServiceError(409, 'CANCELLED', 'The operation was cancelled. Refresh the saved session.', true);
      if (stream) { send('session', { session: final.session }); res.end(); }
      else res.json({ session: final.session });
    } catch (error) {
      const safe = safeError(error);
      if (lease) await store.release(ownerId, id, lease.id, { code: safe.code, message: safe.message, retryable: safe.retryable }).catch(() => {});
      // Log only classification, never provider payloads, transcripts, headers, or credentials.
      if (safe.status >= 500) console.error('[interview] request failed', { code: safe.code, kind });
      if (stream) { send('error', { error: safe.message, code: safe.code, retryable: safe.retryable }); if (!res.writableEnded) res.end(); }
      else errorResponse(res, safe);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      res.removeListener('close', close);
      if (lease && activeOperations.get(`${ownerId}:${id}`)?.operationId === lease.id) activeOperations.delete(`${ownerId}:${id}`);
    }
  }

  router.post('/:id/start', (req, res) => { void run(req as AuthRequest, res, 'start'); });
  router.post('/:id/messages', (req, res) => { void run(req as AuthRequest, res, 'answer'); });
  router.post('/:id/complete', (req, res) => { void run(req as AuthRequest, res, 'complete'); });

  router.post('/:id/cancel', async (req: AuthRequest, res) => {
    try {
      const ownerId = identity(req); const id = sessionId(req);
      const active = activeOperations.get(`${ownerId}:${id}`);
      const data = await store.cancel(ownerId, id); if (!data) missing();
      active?.controller.abort();
      res.json({ session: data.session });
    } catch (error) { errorResponse(res, error); }
  });
  router.post('/:id/resume', async (req: AuthRequest, res) => {
    try {
      const ownerId = identity(req); const id = sessionId(req);
      const data = await store.get(ownerId, id); if (!data) missing();
      if (data.session.version !== version(req.body)) throw new ServiceError(409, 'VERSION_CONFLICT', 'Refresh the session before resuming.');
      if (data.operation && data.operation.expiresAt > Date.now()) throw new ServiceError(409, 'SESSION_BUSY', 'This interview is still processing. Wait or cancel the operation.');
      // Resuming never extends the wall-clock deadline; completed reports remain immutable.
      const resumed = await store.cancel(ownerId, id, true, data.session.version); if (!resumed) throw new ServiceError(409, 'SESSION_BUSY', 'Another request started while this session was resuming.');
      res.json({ session: resumed.session });
    } catch (error) { errorResponse(res, error); }
  });
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const ownerId = identity(req); const id = sessionId(req);
      const deleted = await store.delete(ownerId, id); if (!deleted) missing();
      activeOperations.get(`${ownerId}:${id}`)?.controller.abort();
      res.status(204).end();
    } catch (error) { errorResponse(res, error); }
  });
  return router;
}
