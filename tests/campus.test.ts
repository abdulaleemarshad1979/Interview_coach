import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClass, validateProctors, validateQuestionBank, pageParameters } from '../backend/campusValidation';

test('classes require explicit campus, department, cohort and section', () => {
  assert.deepEqual(validateClass({ portal: 'aus', department: ' it ', cohort: '2024-2028', section: ' a ' }), { portal: 'aus', department: 'IT', cohort: '2024-2028', section: 'A' });
  for (const input of [{}, { portal: 'aec', department: 'IT', cohort: '2024-2028', section: 'A' }, { portal: 'aus', department: 'IT', cohort: '2024-2024', section: 'A' }]) assert.throws(() => validateClass(input));
});
test('proctor assignment is bounded to two distinct server identities', () => {
  const a = 'a'.repeat(24), b = 'b'.repeat(24), c = 'c'.repeat(24);
  assert.deepEqual(validateProctors([a, b]), [a, b]);
  assert.deepEqual(validateProctors([]), []);
  for (const input of [[a, a], [a, b, c], ['$ne'], { $ne: null }]) assert.throws(() => validateProctors(input));
});
test('question banks require bounded real question content and do not accept roles', () => {
  const bank = validateQuestionBank({ company: 'Example', role: 'Engineer', questions: ['Explain a project.'], is_admin: true });
  assert.deepEqual(bank, { company: 'Example', role: 'Engineer', questions: ['Explain a project.'] });
  assert.throws(() => validateQuestionBank({ company: 'Example', role: 'Engineer', questions: [] }));
  assert.throws(() => validateQuestionBank({ company: 'Example', role: 'Engineer', questions: Array(51).fill('Explain a project.') }));
});
test('list endpoints reject excessive pages and MongoDB operator inputs', () => {
  assert.deepEqual(pageParameters({}), { limit: 50, offset: 0 });
  assert.deepEqual(pageParameters({ limit: '20', offset: '40' }), { limit: 20, offset: 40 });
  for (const input of [{ limit: '10000' }, { offset: '-1' }, { limit: { $gt: 0 } }]) assert.throws(() => pageParameters(input));
});
