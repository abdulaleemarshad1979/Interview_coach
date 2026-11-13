import express, { type Request, type RequestHandler, type Response } from 'express';
import { createAIProvider, type AIProvider } from '../ai/provider';
import { ServiceError, safeError } from '../errors';
import { sanitizeDelivery } from '../interview/delivery';
import { addUserTurn, discussionReport, newDiscussion, panelRespond } from './engine';
import { createDiscussionStore, type DiscussionStore } from './store';

export interface DiscussionRouterOptions { requireAuth: RequestHandler; connectDB: () => Promise<unknown>; store?: DiscussionStore; provider?: AIProvider }
type AuthRequest = Request & { user?: { id: string; user_metadata?: Record<string, any> } };

/** AI-panel group discussion: works without an SFU, so a single student can practise turn-taking and argument quality. */
export function createDiscussionRouter(options: DiscussionRouterOptions) {
  const router = express.Router();
  const store = options.store || createDiscussionStore();
  const provider = options.provider || createAIProvider();
  const busy = new Set<string>(); // one in-flight AI call per discussion; double-clicks get a clear 409
  router.use(options.requireAuth);
  router.use(async (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { await options.connectDB(); next(); } catch { res.status(503).json({ error: 'The session database is unavailable. Please retry shortly.', code: 'DATABASE_UNAVAILABLE', retryable: true }); }
  });
  const owner = (req: AuthRequest) => { if (!req.user?.id) throw new ServiceError(401, 'UNAUTHENTICATED', 'Sign in to join a discussion.'); return req.user.id; };
  const idOf = (req: Request) => { if (!/^[a-f0-9-]{36}$/i.test(req.params.id || '')) throw new ServiceError(404, 'NOT_FOUND', 'Discussion not found.'); return req.params.id; };
  const fail = (res: Response, error: unknown) => { const safe = safeError(error); if (!res.headersSent) res.status(safe.status === 499 ? 409 : safe.status).json({ error: safe.message, code: safe.code, retryable: safe.retryable }); };
  const load = async (req: AuthRequest) => { const session = await store.get(owner(req), idOf(req)); if (!session) throw new ServiceError(404, 'NOT_FOUND', 'Discussion not found.'); return session; };
  const exclusive = async (req: AuthRequest, work: () => Promise<unknown>) => {
    const key = `${owner(req)}:${idOf(req)}`;
    if (busy.has(key)) throw new ServiceError(409, 'SESSION_BUSY', 'The panel is still responding. Wait a moment.');
    busy.add(key);
    try { return await work(); } finally { busy.delete(key); }
  };
  const nameOf = (req: AuthRequest) => String(req.user?.user_metadata?.student_name || req.user?.user_metadata?.name || 'You').slice(0, 40);

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const ownerId = owner(req);
      let session = newDiscussion(req.body?.topic);
      await store.create(ownerId, session);
      session = await panelRespond(session, provider);
      const saved = await store.save(ownerId, session);
      res.status(201).json({ session: saved || session });
    } catch (error) { fail(res, error); }
  });
  router.get('/', async (req: AuthRequest, res) => { try { res.json({ discussions: await store.list(owner(req), 20) }); } catch (error) { fail(res, error); } });
  router.get('/:id', async (req: AuthRequest, res) => { try { res.json({ session: await load(req) }); } catch (error) { fail(res, error); } });

  router.post('/:id/turns', async (req: AuthRequest, res) => {
    try {
      await exclusive(req, async () => {
        const current = await load(req);
        if (req.body?.expectedVersion !== undefined && req.body.expectedVersion !== current.version) throw new ServiceError(409, 'VERSION_CONFLICT', 'The discussion changed. Refresh and retry.');
        const withUser = addUserTurn(current, req.body?.text, nameOf(req), sanitizeDelivery(req.body?.delivery));
        // The candidate's words are saved before the AI call, so a provider failure never loses what they said.
        const saved = await store.save(owner(req), withUser);
        if (!saved) throw new ServiceError(409, 'VERSION_CONFLICT', 'The discussion changed. Refresh and retry.');
        try {
          const answered = await store.save(owner(req), await panelRespond(saved, provider));
          res.json({ session: answered || saved });
        } catch (error) {
          const safe = safeError(error);
          res.status(safe.status === 499 ? 409 : safe.status).json({ error: safe.message, code: safe.code, retryable: true, session: saved });
        }
      });
    } catch (error) { fail(res, error); }
  });

  router.post('/:id/complete', async (req: AuthRequest, res) => {
    try {
      await exclusive(req, async () => {
        const current = await load(req);
        if (current.state === 'COMPLETED') return res.json({ session: current });
        const done = await discussionReport(current, provider);
        const saved = await store.save(owner(req), done);
        if (!saved) throw new ServiceError(409, 'VERSION_CONFLICT', 'The discussion changed. Refresh and retry.');
        res.json({ session: saved });
      });
    } catch (error) { fail(res, error); }
  });
  return router;
}
