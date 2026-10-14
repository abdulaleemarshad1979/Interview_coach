import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPasswordHash, verifyPassword, PASSWORD_SCHEME, sanitizeMetadata, configuredRoles, canAccessProfile, validateCredentials } from '../backend/authSafety.ts';

test('versioned password hashes verify and legacy hashes remain eligible for migration', async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const password = 'correct horse test battery';
  const hash = await createPasswordHash(password, salt);
  assert.equal(await verifyPassword(password, salt, hash, PASSWORD_SCHEME), true);
  assert.equal(await verifyPassword('incorrect', salt, hash, PASSWORD_SCHEME), false);
  const legacy = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  assert.equal(await verifyPassword(password, salt, legacy), true);
  assert.equal(await verifyPassword(password, salt, legacy, 'unknown'), false);
  assert.equal(await verifyPassword(password, salt, 'bad'), false);
});
test('metadata cannot grant roles, change identity or inject MongoDB operators', () => {
  assert.deepEqual(sanitizeMetadata({ is_admin: true, is_faculty: true, roll_number: 'OTHER', $set: {}, name: 'Ada' }), { name: 'Ada' });
  const previous = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'admin@example.com';
  assert.deepEqual(configuredRoles('ADMIN@example.com'), { is_admin: true, is_faculty: true });
  assert.equal(configuredRoles('student@example.com').is_admin, false);
  if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous;
});
test('students cannot read or write another profile and staff reads do not grant writes', () => {
  const student = { id: 'user1', email: 'roll1@aec.edu.in', user_metadata: { roll_number: 'ROLL1' } };
  assert.equal(canAccessProfile(student, 'ROLL1', true), true);
  assert.equal(canAccessProfile(student, 'ROLL2'), false);
  assert.equal(canAccessProfile({ ...student, user_metadata: { is_faculty: true } }, 'ROLL2'), true);
  assert.equal(canAccessProfile({ ...student, user_metadata: { is_faculty: true } }, 'ROLL2', true), false);
  assert.throws(() => validateCredentials({ $ne: null }, 'password123', true));
  assert.throws(() => validateCredentials('user@example.com', 'short', true));
});
