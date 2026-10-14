import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { officialPortalFixture } from './fixtures/collegePortal';
import { verifyPassword, createPasswordHash } from '../backend/authSafety';

let mongo: MongoMemoryServer, app: any, attempt = 0;
const nativeFetch = globalThis.fetch;
before(async () => {
  process.env.TEST_MODE = 'true'; process.env.NODE_ENV = 'test';
  delete process.env.ADMIN_EMAILS; delete process.env.FACULTY_EMAILS;
  mongo = await MongoMemoryServer.create(); process.env.MONGODB_URI = mongo.getUri();
  app = (await import('../server.ts')).default;
  app.set('trust proxy', 1);
});
after(async () => { globalThis.fetch = nativeFetch; await mongoose.disconnect(); await mongo?.stop(); });
function post(path: string) { return request(app).post(path).set('X-Forwarded-For', `192.0.2.${++attempt}`); }
async function withPortal<T>(password: string, work: (fixture: ReturnType<typeof officialPortalFixture>) => Promise<T>, options = {}) {
  const fixture = officialPortalFixture(password, options); globalThis.fetch = fixture.fetcher;
  try { return await work(fixture); } finally { globalThis.fetch = nativeFetch; }
}

test('verified college login creates a session and reuses the account after ECAP password changes', async () => {
  const credentials = { rollNo: '24P31A9999', password: 'first-portal-password', portal: 'acet', classSection: 'Section B' };
  const first = await withPortal(credentials.password, () => post('/api/college/login').send(credentials));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.profile.attendance, 78.4);
  assert.equal(first.body.user.user_metadata.college_portal, 'acet');
  assert.equal(first.body.profile.classSection, 'Section B');
  const saved: any = await mongoose.model<any>('User').findById(first.body.user.id);
  assert.equal(await verifyPassword(credentials.password, saved.salt, saved.passwordHash, saved.passwordScheme), false);
  await mongoose.model<any>('User').updateOne({ _id: saved._id }, { $set: { 'user_metadata.github_username': 'example-projects' } });
  const second = await withPortal('changed-portal-password', () => post('/api/college/login').send({ ...credentials, password: 'changed-portal-password', classSection: 'Section A' }));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(second.body.user.user_metadata.github_username, 'example-projects');
  assert.equal(second.body.profile.classSection, 'Section B');
  assert.equal(await mongoose.model<any>('User').countDocuments({ email: saved.email }), 1);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${second.body.session.access_token}`);
  assert.equal(me.status, 200); assert.equal(me.body.user.id, first.body.user.id);
  const storedProfile: any = await mongoose.model<any>('Profile').findOne({ id: credentials.rollNo });
  assert.equal(storedProfile.ownerId, saved._id.toString());
});

test('a stale local password cannot bypass portal authentication', async () => {
  const user: any = await mongoose.model<any>('User').findOne({ email: '24p31a9999@aec.edu.in' });
  user.passwordHash = await createPasswordHash('old-local-password', user.salt); await user.save();
  const sessionsBefore = await mongoose.model('Session').countDocuments();
  const wrong = await withPortal('changed-portal-password', () => post('/api/college/login').send({ rollNo: '24P31A9999', password: 'old-local-password', portal: 'acet' }));
  assert.equal(wrong.status, 401); assert.equal(wrong.body.code, 'INVALID_PORTAL_CREDENTIALS');
  const bypass = await post('/api/auth/login').send({ email: user.email, password: 'old-local-password' });
  assert.equal(bypass.status, 403); assert.equal(bypass.body.code, 'COLLEGE_LOGIN_REQUIRED');
  assert.equal(await mongoose.model('Session').countDocuments(), sessionsBefore);
});

test('invalid inputs, upstream outages and invalid profiles create no account or session', async () => {
  const users = await mongoose.model<any>('User').countDocuments(), sessions = await mongoose.model('Session').countDocuments();
  const invalid = await post('/api/college/login').send({ rollNo: '24P31A0001', password: 'test-password', portal: 'http://example.com' });
  assert.equal(invalid.status, 400);
  const unavailable = await withPortal('test-password', () => post('/api/college/login').send({ rollNo: '24P31A0001', password: 'test-password', portal: 'acet' }), { unavailable: true });
  assert.equal(unavailable.status, 503); assert.equal(unavailable.body.code, 'PORTAL_UNAVAILABLE');
  const badProfile = await withPortal('test-password', () => post('/api/college/login').send({ rollNo: '24P31A0001', password: 'test-password', portal: 'acet' }), { invalidProfile: true });
  assert.equal(badProfile.status, 502); assert.equal(badProfile.body.code, 'PORTAL_PROFILE_INVALID');
  assert.equal(await mongoose.model<any>('User').countDocuments(), users);
  assert.equal(await mongoose.model('Session').countDocuments(), sessions);
});

test('student login cannot overwrite a provisioned staff account or a profile owned by another account', async () => {
  const user: any = await mongoose.model<any>('User').findOne({ email: '24p31a9999@aec.edu.in' });
  await mongoose.model<any>('User').updateOne({ _id: user._id }, { staffProvisioned: true });
  const staff = await withPortal('test-password', () => post('/api/college/login').send({ rollNo: '24P31A9999', password: 'test-password', portal: 'acet' }));
  assert.equal(staff.status, 403); assert.equal(staff.body.code, 'STAFF_LOGIN_REQUIRED');
  await mongoose.model<any>('User').updateOne({ _id: user._id }, { staffProvisioned: false });
  await mongoose.model<any>('Profile').updateOne({ id: '24P31A9999' }, { ownerId: 'another-user' });
  const conflict = await withPortal('test-password', () => post('/api/college/login').send({ rollNo: '24P31A9999', password: 'test-password', portal: 'acet' }));
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'PROFILE_OWNERSHIP_CONFLICT');
  await mongoose.model<any>('Profile').updateOne({ id: '24P31A9999' }, { ownerId: user._id.toString() });
});

test('profile sync uses the bound college and updates the authoritative stored profile', async () => {
  const login = await withPortal('test-password', () => post('/api/college/login').send({ rollNo: '24P31A9999', password: 'test-password', portal: 'acet' }));
  const token = `Bearer ${login.body.session.access_token}`;
  const wrongCollege = await post('/api/college/sync-portal').set('Authorization', token).send({ rollNo: '24P31A9999', password: 'test-password', portal: 'aus' });
  assert.equal(wrongCollege.status, 409);
  const anotherStudent = await post('/api/college/sync-portal').set('Authorization', token).send({ rollNo: '24P31A0002', password: 'test-password', portal: 'acet' });
  assert.equal(anotherStudent.status, 403);
  const synced = await withPortal('test-password', () => post('/api/college/sync-portal').set('Authorization', token).send({ rollNo: '24P31A9999', password: 'test-password', portal: 'acet' }));
  assert.equal(synced.status, 200);
  const cached = await request(app).get('/api/college/student/24P31A9999').set('Authorization', token);
  assert.equal(cached.body.attendance, 78.4);
});
