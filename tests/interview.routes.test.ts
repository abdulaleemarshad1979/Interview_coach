import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createInterviewRouter } from '../backend/interview/router.ts';
import { MongoInterviewStore } from '../backend/interview/store.ts';
import { INTERVIEW_DIMENSIONS, type InterviewSession } from '../src/lib/interviewTypes.ts';
import type { AIProvider, JsonCompletionOptions } from '../backend/ai/provider.ts';

let database: MongoMemoryServer;
const config = { mode: 'technical', targetRole: 'Backend engineer', experienceLevel: 'junior', technicalDomain: 'Node.js APIs', difficulty: 'intermediate', durationMinutes: 15 };
before(async () => { database = await MongoMemoryServer.create(); await mongoose.connect(database.getUri()); });
after(async () => { await mongoose.disconnect(); await database?.stop(); });

function providerFixture() {
  let calls = 0;
  let failNext = false;
  let invalidReport = false;
  let paraphraseStart = false;
  let gate: (() => Promise<void>) | undefined;
  const provider: AIProvider = {
    async completeJson(options: JsonCompletionOptions) {
      calls++;
      if (failNext) { failNext = false; throw Object.assign(new Error('Simulated upstream outage'), { status: 503 }); }
      if (gate) await gate();
      let value: any;
      if (options.purpose === 'report') {
        const data = JSON.parse(options.messages[1].content);
        const answer = data.answers[0];
        const evidence = [{ turnId: answer.id, quote: invalidReport ? 'Text that was never spoken' : answer.text.slice(0, 35), explanation: 'Fixture rubric evidence.' }];
        value = { summary: 'Fixture feedback, not a real AI evaluation.', dimensions: Object.fromEntries(INTERVIEW_DIMENSIONS.map(name => [name, { score: 65, feedback: 'Explain the example in more detail.', evidence }])), strengths: [{ text: 'Offers a concrete example.', evidence }], improvements: [{ text: 'Describe the tradeoffs.', evidence }], practiceExercises: ['Explain JWT expiration and refresh-token security.'], limitations: ['Synthetic provider fixture used in integration test.'] };
      } else {
        const source = options.messages[1].content.split('UNTRUSTED_SESSION_DATA=')[1];
        const data = JSON.parse(source);
        const latest = data.recentAnswers.at(-1);
        const start = data.state === 'PREPARING';
        const close = data.remainingSeconds === 0;
        const follow = !start && !close && data.state !== 'INTRODUCTION' && latest?.text.includes('JWT') && data.memory.followUpCount < 2;
        const question = start ? 'What experience led you to backend engineering?' : follow ? 'How do you handle JWT expiration and refresh?' : data.previousQuestions.some((text: string) => text.includes('authentication')) ? 'How do you choose a database index for a slow query?' : 'How did you implement authentication in your project?';
        value = { utterance: close ? 'The interview has reached its time limit. I will prepare your report.' : start && paraphraseStart ? 'Could you tell me what brought you into backend work?' : question, action: close ? 'CLOSE' : start || data.state === 'INTRODUCTION' ? 'ASK' : follow ? 'FOLLOW_UP' : 'TRANSITION', question: close ? null : { text: question, topic: start ? 'Background' : follow || question.includes('authentication') ? 'Authentication' : 'Databases', difficulty: 'intermediate' }, grounding: follow ? { turnId: latest.id, quote: 'JWT' } : null, memory: { summary: latest ? `Candidate answered about ${data.currentQuestion?.topic}.` : '', claims: latest ? [{ text: 'Provided a project example.', turnId: latest.id, quote: latest.text.slice(0, 40) }] : [], followUpOpportunities: [] } };
      }
      const raw = JSON.stringify(value);
      if (options.onDelta) { for (let i = 0; i < raw.length; i += 24) options.onDelta(raw.slice(i, i + 24)); }
      return { value, usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 }, model: 'synthetic-test-model', provider: 'synthetic-test-provider' };
    },
    transcribe: async () => ({ text: 'Synthetic transcription fixture', source: 'synthetic-test-provider' }),
  };
  return { provider, get calls() { return calls; }, fail: () => { failNext = true; }, paraphraseFirstQuestion: () => { paraphraseStart = true; }, invalidEvidence: (value: boolean) => { invalidReport = value; }, block: (fn?: () => Promise<void>) => { gate = fn; } };
}
function appFixture(provider: AIProvider) {
  const app = express(); app.use(express.json());
  app.use('/sessions', createInterviewRouter({ provider, store: new MongoInterviewStore(), connectDB: async () => {}, requireAuth: (req: any, res, next) => {
    if (!req.headers.authorization) { res.status(401).json({ error: 'Sign in required.' }); return; }
    req.user = { id: req.headers.authorization.replace('Bearer ', '') }; next();
  } }));
  return app;
}
const auth = (req: request.Test, user = 'alice') => req.set('Authorization', `Bearer ${user}`);
async function createAndStart(app: ReturnType<typeof express>) {
  const created = await auth(request(app).post('/sessions')).send({ config }).expect(201);
  const session: InterviewSession = created.body.session;
  const started = await auth(request(app).post(`/sessions/${session.id}/start`)).send({ requestId: crypto.randomUUID(), expectedVersion: session.version }).expect(200);
  return started.body.session as InterviewSession;
}
async function answer(app: ReturnType<typeof express>, session: InterviewSession, text: string, requestId = crypto.randomUUID()) {
  const result = await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: session.version, questionId: session.currentQuestion!.id, text }).expect(200);
  return result.body.session as InterviewSession;
}

test('authenticated MongoDB interview persists answers, grounded follow-ups, history and a validated report', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  let session = await createAndStart(app);
  assert.equal(session.state, 'INTRODUCTION');
  session = await answer(app, session, 'I build Node.js APIs and have delivered a team project.');
  assert.equal(session.state, 'QUESTIONING');
  session = await answer(app, session, 'I implemented authentication using JWT and rotated refresh tokens.');
  assert.equal(session.state, 'FOLLOW_UP'); assert.equal(session.currentQuestion?.groundedIn, 'JWT');
  const persisted = await auth(request(appFixture(fixture.provider)).get(`/sessions/${session.id}`)).expect(200);
  assert.equal(persisted.body.session.turns.length, session.turns.length);
  const completed = await auth(request(app).post(`/sessions/${session.id}/complete`)).send({ requestId: crypto.randomUUID(), expectedVersion: session.version }).expect(200);
  assert.equal(completed.body.session.state, 'COMPLETED'); assert.equal(completed.body.session.report.overallScore, 65);
  const evidence = completed.body.session.report.dimensions.reasoningQuality.evidence[0];
  assert.ok(session.turns.find(turn => turn.id === evidence.turnId)?.text.includes(evidence.quote));
  await auth(request(app).get(`/sessions/${session.id}/report`)).expect(200);
  const history = await auth(request(app).get('/sessions?limit=1')).expect(200);
  assert.equal(history.body.sessions.length, 1);
  await auth(request(app).delete(`/sessions/${session.id}`)).expect(204);
  await auth(request(app).get(`/sessions/${session.id}`)).expect(404);
});
test('a paraphrased AI introduction starts the interview with the canonical saved question', async () => {
  const fixture = providerFixture(); fixture.paraphraseFirstQuestion();
  const session = await createAndStart(appFixture(fixture.provider));
  assert.equal(session.state, 'INTRODUCTION');
  assert.equal(session.turns.at(-1)?.text, session.currentQuestion?.text);
});
test('failed AI answer can be retried idempotently without duplicating transcript or completion', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  let session = await createAndStart(app); const requestId = crypto.randomUUID(); const questionId = session.currentQuestion!.id;
  const text = 'I build reliable Node.js APIs with a small project team.';
  fixture.fail();
  await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: session.version, questionId, text }).expect(502);
  session = (await auth(request(app).get(`/sessions/${session.id}`)).expect(200)).body.session;
  assert.equal(session.turns.filter(turn => turn.role === 'candidate').length, 1); assert.equal(session.pendingAnswer?.requestId, requestId);
  session = await answer(app, session, text, requestId);
  assert.equal(session.turns.filter(turn => turn.role === 'candidate').length, 1); assert.equal(session.pendingAnswer, null);
  const calls = fixture.calls;
  await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: 0, questionId, text }).expect(200);
  assert.equal(fixture.calls, calls);
  await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: session.version, questionId, text: 'Different answer' }).expect(409);
});
test('ownership, stale version and invalid inputs are rejected before AI processing', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  await request(app).get('/sessions').expect(401);
  const session = await createAndStart(app); const calls = fixture.calls;
  await auth(request(app).get(`/sessions/${session.id}`), 'bob').expect(404);
  await auth(request(app).delete(`/sessions/${session.id}`), 'bob').expect(404);
  await auth(request(app).post(`/sessions/${session.id}/complete`), 'bob').send({ requestId: crypto.randomUUID(), expectedVersion: session.version }).expect(404);
  await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId: crypto.randomUUID(), expectedVersion: 0, questionId: session.currentQuestion!.id, text: 'A valid answer.' }).expect(409);
  await auth(request(app).post('/sessions')).send({ config: { ...config, durationMinutes: -1 } }).expect(400);
  assert.equal(fixture.calls, calls);
});
test('SSE streams provisional provider text and commits only one final validated session', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  const created = (await auth(request(app).post('/sessions')).send({ config }).expect(201)).body.session;
  const result = await auth(request(app).post(`/sessions/${created.id}/start`)).set('Accept', 'text/event-stream').send({ requestId: crypto.randomUUID(), expectedVersion: created.version }).expect(200);
  assert.ok(result.text.includes('event: delta\n'));
  assert.ok(result.text.includes('"provisional":true'));
  assert.equal((result.text.match(/event: session\n/g) || []).length, 1);
  assert.ok(!result.text.includes('"action":"ASK"'));
});
test('cancellation invalidates database lease and preserves answer for retry across routers', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  let session = await createAndStart(app);
  let unblock!: () => void; let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { unblock = resolve; });
  fixture.block(async () => { entered(); await waiting; });
  const requestId = crypto.randomUUID(); const questionId = session.currentQuestion!.id; const text = 'I build Node.js APIs and test them.';
  const inflight = auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: session.version, questionId, text }).then(result => result);
  await enteredPromise;
  const busy = (await auth(request(app).get(`/sessions/${session.id}`)).expect(200)).body.session;
  await auth(request(app).post(`/sessions/${session.id}/messages`)).send({ requestId, expectedVersion: busy.version, questionId, text }).expect(409);
  const cancelled = await auth(request(appFixture(fixture.provider)).post(`/sessions/${session.id}/cancel`)).expect(200);
  assert.equal(cancelled.body.session.isProcessing, false);
  unblock(); const response = await inflight; assert.equal(response.status, 409);
  fixture.block(); session = (await auth(request(app).get(`/sessions/${session.id}`)).expect(200)).body.session;
  session = await answer(app, session, text, requestId);
  assert.equal(session.turns.filter(turn => turn.role === 'candidate').length, 1);
});
test('fabricated report evidence returns an explicit failure and saved evaluation is retryable', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  let session = await createAndStart(app); session = await answer(app, session, 'I implemented a Node.js API for a library catalogue.');
  const requestId = crypto.randomUUID(); fixture.invalidEvidence(true);
  const failed = await auth(request(app).post(`/sessions/${session.id}/complete`)).send({ requestId, expectedVersion: session.version }).expect(502);
  assert.equal(failed.body.code, 'INVALID_EVIDENCE');
  session = (await auth(request(app).get(`/sessions/${session.id}`)).expect(200)).body.session;
  assert.equal(session.state, 'EVALUATION'); assert.equal(session.report, null);
  fixture.invalidEvidence(false);
  const result = await auth(request(app).post(`/sessions/${session.id}/complete`)).send({ requestId, expectedVersion: session.version }).expect(200);
  assert.equal(result.body.session.state, 'COMPLETED');
});
test('resume retains the fixed deadline and an expired interview accepts the final answer before closing', async () => {
  const fixture = providerFixture(); const app = appFixture(fixture.provider);
  let session = await createAndStart(app); const originalEnd = session.endsAt;
  session = (await auth(request(app).post(`/sessions/${session.id}/resume`)).send({ expectedVersion: session.version }).expect(200)).body.session;
  assert.equal(session.endsAt, originalEnd);
  await mongoose.connection.collection('interview_sessions').updateOne({ _id: session.id } as any, { $set: { 'payload.endsAt': new Date(Date.now() - 5000).toISOString() } });
  session = await answer(app, session, 'I delivered a Node.js API for our team project.');
  assert.equal(session.state, 'CLOSING'); assert.equal(session.remainingSeconds, 0); assert.equal(session.currentQuestion, null);
  assert.equal(session.turns.filter(turn => turn.role === 'candidate').length, 1);
});
