import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import supertest from 'supertest';
import { addUserTurn, discussionReport, newDiscussion, panelRespond, validatePanelTurns } from '../backend/discussion/engine';
import { createDiscussionRouter } from '../backend/discussion/router';
import type { DiscussionStore } from '../backend/discussion/store';
import type { DiscussionSession } from '../src/lib/discussionTypes';
import type { AIProvider } from '../backend/ai/provider';

const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
function provider(responses: unknown[]): AIProvider {
  let i = 0;
  return { completeJson: async () => ({ value: responses[Math.min(i++, responses.length - 1)], usage, model: 'fake', provider: 'fake' }), transcribe: async () => ({ text: '', source: 'fake' }) };
}

test('panel turns must use known, alternating speakers', () => {
  const s = newDiscussion('Should teams use AI pair programmers?');
  assert.equal(validatePanelTurns({ turns: [{ speaker: 'aisha', text: 'I think yes.' }, { speaker: 'rahul', text: 'Prove it.' }] }, s).length, 2);
  assert.throws(() => validatePanelTurns({ turns: [{ speaker: 'aisha', text: 'a' }, { speaker: 'aisha', text: 'b' }] }, s));
  assert.throws(() => validatePanelTurns({ turns: [{ speaker: 'bot', text: 'a' }] }, s));
});

test('report verifies quotes, weights criteria and survives a retry', async () => {
  let s: DiscussionSession = newDiscussion('Remote work or office work for new graduates?');
  s = addUserTurn(s, 'I believe mentoring happens faster in an office because questions are cheap.', 'Asha');
  const id = s.turns[0].id;
  const good = { summary: 'ok', criteria: Object.fromEntries(['argumentQuality', 'topicUnderstanding', 'communicationClarity', 'collaboration'].map(k => [k, { score: 4, feedback: 'f', evidence: [{ turnId: id, quote: 'mentoring happens faster in an office', explanation: 'e' }] }])), strengths: ['s'], improvements: ['i'] };
  const bad = { ...good, criteria: Object.fromEntries(Object.keys(good.criteria).map(k => [k, { score: 4, feedback: 'f', evidence: [{ turnId: id, quote: 'invented words', explanation: 'e' }] }])) };
  const done = await discussionReport(s, provider([bad, good]));
  assert.equal(done.state, 'COMPLETED');
  assert.equal(done.report!.contentScore, 80);
  assert.equal(done.report!.overallScore, 80); // no delivery captured: not blended
});

test('router saves the candidate turn before calling the panel and returns it when the AI fails', async () => {
  const sessions = new Map<string, DiscussionSession>();
  const store: DiscussionStore = {
    create: async (_o, s) => { sessions.set(s.id, s); },
    get: async (_o, id) => sessions.get(id) ?? null,
    save: async (_o, s) => { const n = { ...s, version: s.version + 1 }; sessions.set(s.id, n); return n; },
    list: async () => [],
  };
  const panel = { turns: [{ speaker: 'meera', text: 'Welcome! Who wants to start?' }] };
  const ai = provider([panel, { nonsense: true }]);
  const app = express(); app.use(express.json());
  app.use('/api/discussions', createDiscussionRouter({ requireAuth: (req: any, _r, next) => { req.user = { id: 'u1', user_metadata: { student_name: 'Asha' } }; next(); }, connectDB: async () => {}, store, provider: ai }));
  const api = supertest(app);
  const created = await api.post('/api/discussions').send({ topic: 'Open source in education' }).expect(201);
  const id = created.body.session.id;
  const failed = await api.post(`/api/discussions/${id}/turns`).send({ text: 'Open source lets students read real code.' });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.session.turns.at(-1).text, 'Open source lets students read real code.');
  await api.post(`/api/discussions/${id}/turns`).send({ text: '' }).expect(400);
});
