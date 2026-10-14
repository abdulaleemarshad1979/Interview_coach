import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTransition, buildInterviewContext, generateInterviewTurn, newSession,
  partialUtterance, remainingSeconds, validateConfig, validateDecision, validateEvidence, validateReport,
} from '../backend/interview/engine.ts';
import { INTERVIEW_DIMENSIONS, type InterviewSession } from '../src/lib/interviewTypes.ts';
import { parseProviderJson, type AIProvider } from '../backend/ai/provider.ts';

const config = { mode: 'technical', targetRole: 'Backend engineer', experienceLevel: 'junior', technicalDomain: 'Node.js APIs', difficulty: 'intermediate', durationMinutes: 15 };
function fixture() {
  const session = newSession(validateConfig(config));
  session.state = 'QUESTIONING';
  session.startedAt = new Date().toISOString();
  session.endsAt = new Date(Date.now() + 900000).toISOString();
  session.currentQuestion = { id: 'q1', text: 'How did you implement authentication?', topic: 'Authentication', difficulty: 'intermediate', kind: 'PRIMARY' };
  session.turns = [
    { id: 'i1', role: 'interviewer', text: session.currentQuestion.text, questionId: 'q1', createdAt: new Date().toISOString() },
    { id: 'a1', role: 'candidate', text: 'I implemented authentication using JWT and rotated refresh tokens.', questionId: 'q1', createdAt: new Date().toISOString() },
  ];
  return session;
}
function decision() {
  return {
    utterance: 'How did you handle JWT expiration and refresh?', action: 'FOLLOW_UP',
    question: { text: 'How did you handle JWT expiration and refresh?', topic: 'Authentication', difficulty: 'intermediate' },
    grounding: { turnId: 'a1', quote: 'using JWT' },
    memory: { summary: 'Candidate described JWT authentication and refresh-token rotation.', claims: [{ text: 'Used JWT', turnId: 'a1', quote: 'using JWT' }], followUpOpportunities: ['Stolen refresh token recovery'] },
  };
}
function report(session: InterviewSession) {
  const evidence = [{ turnId: 'a1', quote: 'using JWT', explanation: 'Names the concrete token mechanism used.' }];
  return { summary: 'Transcript-based practice feedback.', dimensions: Object.fromEntries(INTERVIEW_DIMENSIONS.map(name => [name, { score: 70, feedback: 'Describe the security tradeoffs in more detail.', evidence }])), strengths: [{ text: 'Identifies a concrete mechanism.', evidence }], improvements: [{ text: 'Explain token security.', evidence }], practiceExercises: ['Explain how to revoke a stolen refresh token.'], limitations: ['Only one answer is available.'] };
}

test('explicit interview states reject skipped and backwards transitions', () => {
  assert.doesNotThrow(() => assertTransition('PREPARING', 'INTRODUCTION'));
  assert.doesNotThrow(() => assertTransition('QUESTIONING', 'FOLLOW_UP'));
  assert.doesNotThrow(() => assertTransition('FOLLOW_UP', 'TOPIC_TRANSITION'));
  assert.doesNotThrow(() => assertTransition('EVALUATION', 'COMPLETED'));
  assert.throws(() => assertTransition('PREPARING', 'COMPLETED'));
  assert.throws(() => assertTransition('COMPLETED', 'QUESTIONING'));
  assert.throws(() => assertTransition('CLOSING', 'FOLLOW_UP'));
});
test('configuration validates mode, duration and untrusted resume limits', () => {
  assert.equal(validateConfig(config).targetRole, 'Backend engineer');
  assert.throws(() => validateConfig({ ...config, durationMinutes: 0 }));
  assert.throws(() => validateConfig({ ...config, targetRole: { $ne: null } }));
  assert.throws(() => validateConfig({ ...config, resumeText: 'x'.repeat(16001) }));
  assert.throws(() => validateConfig({ ...config, mode: 'unsupported' }));
});
test('follow-ups must cite latest candidate evidence and refer to its actual content', () => {
  const session = fixture();
  assert.equal(validateDecision(decision(), session, false).question?.text, decision().question.text);
  assert.throws(() => validateDecision({ ...decision(), grounding: { turnId: 'i1', quote: 'authentication' } }, session, false));
  assert.throws(() => validateDecision({ ...decision(), grounding: { turnId: 'a1', quote: 'I used OAuth' } }, session, false));
  const unrelated = { ...decision(), utterance: 'What is your favourite food?', question: { ...decision().question, text: 'What is your favourite food?' } };
  assert.throws(() => validateDecision(unrelated, session, false));
  const goSession = fixture(); goSession.turns[1].text = 'I used Go to build an API.';
  const goQuestion = { ...decision(), utterance: 'How did you handle Go goroutine cancellation?', question: { ...decision().question, text: 'How did you handle Go goroutine cancellation?' }, grounding: { turnId: 'a1', quote: 'used Go' }, memory: { summary: 'Candidate uses Go.', claims: [], followUpOpportunities: [] } };
  assert.doesNotThrow(() => validateDecision(goQuestion, goSession, false));
  assert.equal(validateDecision({ ...decision(), utterance: `Are you ready? ${decision().utterance}` }, session, false).utterance, decision().question.text);
  assert.equal(validateDecision({ ...decision(), utterance: 'Could you explain your JWT refresh approach?' }, session, false).utterance, decision().question.text);
  session.memory.followUpCount = 2;
  assert.throws(() => validateDecision(decision(), session, false));
});
test('context retains factual memory while bounding old transcripts and resume text', () => {
  const session = fixture();
  session.config.resumeText = 'resume '.repeat(3000);
  session.memory.candidateClaims = [{ text: 'Used JWT', turnId: 'a1', quote: 'using JWT' }];
  for (let i = 0; i < 45; i++) session.turns.push({ id: `older${i}`, role: 'candidate', text: 'old transcript '.repeat(800), createdAt: new Date().toISOString() });
  const context = buildInterviewContext(session);
  assert.ok(context.length < 22000);
  assert.ok(context.includes('using JWT'));
  const parsed = JSON.parse(context);
  assert.equal(parsed.recentAnswers.length, 3);
  assert.equal(parsed.config.resumeText.length, 8000);
});
test('report rejects fabricated or interviewer evidence and computes score from validated dimensions', () => {
  const session = fixture();
  const raw = report(session);
  const result = validateReport(raw, session, { provider: 'test-fixture', model: 'test-fixture' });
  assert.equal(result.overallScore, 70);
  assert.equal(result.dimensions.technicalAccuracy.evidence[0].turnId, 'a1');
  assert.throws(() => validateEvidence([{ turnId: 'i1', quote: 'authentication', explanation: 'Not candidate evidence' }], session.turns));
  raw.dimensions.reasoningQuality.evidence[0].quote = 'fabricated claim';
  assert.throws(() => validateReport(raw, session, { provider: 'test-fixture', model: 'test-fixture' }));
});
test('JSON streaming preview handles split escapes and never emits raw JSON', () => {
  assert.equal(partialUtterance('{"utterance":"How do you handle JWT'), 'How do you handle JWT');
  assert.equal(partialUtterance('{"utterance":"One \\u20'), 'One ');
  assert.equal(partialUtterance('{"utterance":"Say \\"token\\"?","action"'), 'Say "token"?');
  assert.equal(partialUtterance('{"memory":'), '');
  assert.throws(() => parseProviderJson('{invalid}'));
  assert.throws(() => parseProviderJson('[1,2]'));
});
test('deadline closes questioning and difficulty changes are bounded', async () => {
  const session = fixture(); session.endsAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(remainingSeconds(session), 0);
  const close = { ...decision(), utterance: 'The interview is complete. I will prepare your transcript-based feedback.', action: 'CLOSE', question: null, grounding: null };
  const provider: AIProvider = { completeJson: async () => ({ value: close, usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 }, provider: 'test-fixture', model: 'test-fixture' }), transcribe: async () => ({ text: '', source: 'test-fixture' }) };
  const next = await generateInterviewTurn(session, provider);
  assert.equal(next.state, 'CLOSING'); assert.equal(next.currentQuestion, null); assert.equal(next.usage.totalTokens, 30);
  const easy = fixture(); easy.memory.difficulty = 'beginner';
  assert.throws(() => validateDecision({ ...decision(), question: { ...decision().question, difficulty: 'advanced' } }, easy, false));
});

test('multi-turn follow-ups retain earlier claims, cap depth, and transition naturally', async () => {
  let session = fixture();
  const scripts = [
    decision(),
    { ...decision(), utterance: 'How would you revoke a stolen refresh token?', question: { text: 'How would you revoke a stolen refresh token?', topic: 'Authentication', difficulty: 'advanced' }, grounding: { turnId: 'a2', quote: 'refresh tokens' }, memory: { summary: 'Candidate uses JWT, rotation and HTTP-only cookies.', claims: [{ text: 'Stores refresh tokens in HTTP-only cookies.', turnId: 'a2', quote: 'HTTP-only cookies' }], followUpOpportunities: ['Replay detection'] } },
    { ...decision(), utterance: 'Let us move to data access. How do you select indexes for a slow database query?', action: 'TRANSITION', question: { text: 'How do you select indexes for a slow database query?', topic: 'Databases', difficulty: 'intermediate' }, grounding: null, memory: { summary: 'Discussed JWT and refresh-token revocation; now testing database reasoning.', claims: [], followUpOpportunities: [] } },
  ];
  const provider: AIProvider = { completeJson: async () => ({ value: scripts.shift(), usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, provider: 'test-fixture', model: 'test-fixture' }), transcribe: async () => ({ text: '', source: 'test-fixture' }) };
  session = await generateInterviewTurn(session, provider);
  assert.equal(session.memory.followUpCount, 1);
  session.turns.push({ id: 'a2', role: 'candidate', text: 'I store refresh tokens in HTTP-only cookies.', questionId: session.currentQuestion!.id, createdAt: new Date().toISOString() });
  session = await generateInterviewTurn(session, provider);
  assert.equal(session.memory.followUpCount, 2); assert.equal(session.currentQuestion!.basedOnTurnId, 'a2');
  assert.ok(session.memory.candidateClaims.some(claim => claim.turnId === 'a1' && claim.quote === 'using JWT'));
  session.turns.push({ id: 'a3', role: 'candidate', text: 'I invalidate refresh tokens on logout but need to improve replay detection.', questionId: session.currentQuestion!.id, createdAt: new Date().toISOString() });
  const states: string[] = [];
  session = await generateInterviewTurn(session, provider, { onState: state => { states.push(state); } });
  assert.deepEqual(states, ['TOPIC_TRANSITION', 'QUESTIONING']); assert.equal(session.memory.followUpCount, 0);
  assert.ok(session.memory.coveredTopics.includes('Authentication'));
  assert.ok(session.memory.candidateClaims.some(claim => claim.turnId === 'a1'));
});
