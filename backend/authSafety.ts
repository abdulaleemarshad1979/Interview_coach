import crypto from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);
export const PASSWORD_SCHEME = 'scrypt-v1';

export function validateCredentials(email: unknown, password: unknown, signup = false) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' || password.length > 256 || password.length < (signup ? 8 : 1)) {
    throw new Error(signup ? 'A valid email and password of 8–256 characters are required.' : 'A valid email and password are required.');
  }
  return { email: email.trim().toLowerCase(), password };
}

export async function createPasswordHash(password: string, salt: string): Promise<string> {
  const derived = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64,
    { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
  return derived.toString('hex');
}

export async function verifyPassword(password: string, salt: string, storedHash: string, scheme?: string) {
  if (!/^[a-f0-9]{128}$/i.test(storedHash) || !/^[a-f0-9]{32}$/i.test(salt)) return false;
  const actual = scheme === PASSWORD_SCHEME
    ? Buffer.from(await createPasswordHash(password, salt), 'hex')
    : scheme && scheme !== 'legacy-pbkdf2' ? null : await pbkdf2(password, salt, 1000, 64, 'sha512');
  return actual !== null && crypto.timingSafeEqual(actual, Buffer.from(storedHash, 'hex'));
}

// Roles are controlled by the operator; public metadata is never authority.
export function configuredRoles(email: string) {
  const matches = (key: string) => (process.env[key] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
  const is_admin = matches('ADMIN_EMAILS');
  return { is_admin, is_faculty: is_admin || matches('FACULTY_EMAILS') };
}

export function effectiveRoles(user: { email: string; staffProvisioned?: boolean }) {
  return user.staffProvisioned === true ? configuredRoles(user.email) : { is_admin: false, is_faculty: false };
}

const mutableMetadata = new Set([
  'student_name', 'name', 'faculty_name', 'department', 'branch', 'class_section', 'academic_year',
  'github_username', 'resume_file_name', 'profile_image', 'avatar_url', 'profile_completed',
  'analysis_result', 'interview_questions', 'scorecard', 'scorecard_history', 'interview_scorecard', 'active_scorecard',
  'interview_history', 'company_drives', 'roll_prefix', 'roll_start', 'roll_end',
]);
export function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => mutableMetadata.has(key)));
}

export function profileIdForUser(user: { id: string; email: string; user_metadata?: any }): string {
  if (user.user_metadata?.is_admin || user.user_metadata?.is_faculty) return user.id;
  if (!user.email.toLowerCase().endsWith("@aec.edu.in")) return user.id;
  return String(user.user_metadata?.roll_number || user.email.split('@')[0]).toUpperCase();
}

export function canAccessProfile(user: { id: string; email: string; user_metadata?: any }, profileId: unknown, write = false): boolean {
  if (typeof profileId !== 'string' || profileId.length > 128) return false;
  return user.user_metadata?.is_admin === true || (!write && user.user_metadata?.is_faculty === true) ||
    profileId === user.id || profileId.toUpperCase() === profileIdForUser(user);
}

const profileFields = new Set(['roll_number', 'name', 'student_name', 'class_section', 'section', 'branch', 'department',
  'github_username', 'resume_file_name', 'profile_image', 'avatar_url']);
const staffProfileFields = new Set(['assigned_proctor_id', 'assigned_proctor_name']);
export function sanitizeProfile(value: unknown, staff = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, data]) =>
    (profileFields.has(key) || (staff && staffProfileFields.has(key))) && (typeof data === 'string' || data === null)));
}
