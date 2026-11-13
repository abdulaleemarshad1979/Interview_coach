import assert from 'node:assert/strict';
import test from 'node:test';
import { blendOverall, computeDelivery, sanitizeDelivery } from '../backend/interview/delivery';
import { validateEvidence } from '../backend/interview/engine';
import type { InterviewTurn } from '../src/lib/interviewTypes';

const turn = (id: string, text: string, delivery?: InterviewTurn['delivery']): InterviewTurn => ({ id, role: 'candidate', text, createdAt: '', delivery });
const words = (n: number) => Array(n).fill('word').join(' ');

test('sanitizeDelivery rejects out-of-range or malformed client metrics', () => {
  assert.equal(sanitizeDelivery({ durationMs: -1, speechMs: 1, silenceMs: 1, longPauses: 0 }), undefined);
  assert.equal(sanitizeDelivery('x'), undefined);
  const ok = sanitizeDelivery({ durationMs: 20000, speechMs: 15000, silenceMs: 5000, longPauses: 1, camera: { samples: 3, faceRatio: 1, eyeContactRatio: 1, steadiness: 1 } });
  assert.equal(ok?.camera, undefined); // too few samples to trust
});

test('delivery score weights camera and voice signals and blends into the overall score', () => {
  const good = { durationMs: 30000, speechMs: 24000, silenceMs: 6000, longPauses: 0, camera: { samples: 100, faceRatio: 1, eyeContactRatio: 0.9, steadiness: 1 } };
  const report = computeDelivery([turn('a', words(60), good)]); // 60 words / 0.4 min = 150 wpm
  assert.equal(report.wordsPerMinute, 150);
  assert.ok(report.score! >= 90);
  assert.equal(blendOverall(80, report), Math.round(80 * 0.8 + report.score! * 0.2));
});

test('no captured signals leaves delivery unscored and the overall score unchanged', () => {
  const report = computeDelivery([turn('a', words(30))]);
  assert.equal(report.score, null);
  assert.equal(blendOverall(72, report), 72);
});

test('filler words and very fast speech lower delivery', () => {
  const bad = { durationMs: 20000, speechMs: 12000, silenceMs: 8000, longPauses: 4 };
  const report = computeDelivery([turn('a', `um uh basically ${words(60)}`, bad)]);
  assert.ok(report.components.pacing! < 50 && report.components.fluency! < 80);
});

test('evidence quotes tolerate punctuation and case, and lenient mode drops fabricated quotes', () => {
  const turns = [turn('t1', 'I used JWT, with refresh tokens.')];
  assert.equal(validateEvidence([{ turnId: 't1', quote: 'i used jwt with refresh tokens', explanation: 'x' }], turns).length, 1);
  assert.throws(() => validateEvidence([{ turnId: 't1', quote: 'I used OAuth', explanation: 'x' }], turns));
  assert.equal(validateEvidence([{ turnId: 't1', quote: 'I used OAuth', explanation: 'x' }, { turnId: 't1', quote: 'JWT', explanation: 'y' }], turns, 0, true).length, 1);
});
