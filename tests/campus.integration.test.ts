import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPasswordHash, PASSWORD_SCHEME } from '../backend/authSafety';
import { MEETING_CONSENT_VERSION, MeetingMember } from '../backend/meetings';

let mongo: MongoMemoryServer, app: any;
let admin: string, faculty: string, other: string, student: string;
let facultyId: string, otherId: string, studentId: string, classroom: any;
const password = 'isolated-staff-fixture-password';
async function account(email: string, role?: 'admin' | 'faculty') {
  const salt = crypto.randomBytes(16).toString('hex');
  const user: any = await mongoose.model('User').create({ email, salt, passwordHash: await createPasswordHash(password, salt), passwordScheme: PASSWORD_SCHEME,
    staffProvisioned: Boolean(role), ...(role === 'faculty' ? { staffRole: 'faculty' } : {}), user_metadata: role ? { faculty_name: role } : { roll_number: '24P31A9999', college_portal: 'aus' } });
  const token = crypto.randomBytes(32).toString('hex');
  await mongoose.model('Session').create({ token, userId: user._id });
  return { id: String(user._id), auth: `Bearer ${token}` };
}
before(async () => {
  process.env.TEST_MODE = 'true'; process.env.NODE_ENV = 'test'; process.env.APP_URL = 'http://localhost';
  process.env.ADMIN_EMAILS = 'dean@fixture.example'; delete process.env.FACULTY_EMAILS;
  mongo = await MongoMemoryServer.create(); process.env.MONGODB_URI = mongo.getUri();
  app = (await import('../server')).default;
  await mongoose.connect(process.env.MONGODB_URI);
  admin = (await account('dean@fixture.example', 'admin')).auth;
  const a = await account('proctor@fixture.example', 'faculty'); faculty = a.auth; facultyId = a.id;
  const b = await account('other@fixture.example', 'faculty'); other = b.auth; otherId = b.id;
  const c = await account('24p31a9999@aec.edu.in'); student = c.auth; studentId = c.id;
  await mongoose.model('Profile').create({ id: '24P31A9999', ownerId: studentId, roll_number: '24P31A9999', name: 'Fixture Student', is_synced: true });
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('staff can sign in in production without reopening student password login', async () => {
  process.env.NODE_ENV = 'production';
  try {
    const login = await request(app).post('/api/auth/staff/login').send({ email: 'proctor@fixture.example', password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.user_metadata.is_faculty, true);
    assert.equal(login.body.user.user_metadata.is_admin, false);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'proctor@fixture.example', password })).status, 410);
    assert.equal((await request(app).post('/api/auth/staff/login').send({ email: '24p31a9999@aec.edu.in', password })).status, 400);
    assert.equal((await request(app).post('/api/auth/staff/login').send({ email: 'proctor@fixture.example', password: 'wrong' })).status, 400);
  } finally { process.env.NODE_ENV = 'test'; }
});

test('only super admin creates faculty; reserved admin identities and duplicate accounts are rejected', async () => {
  const payload = { name: 'New teacher', email: 'new@fixture.example', password };
  assert.equal((await request(app).post('/api/campus/staff').set('Authorization', faculty).send(payload)).status, 403);
  assert.equal((await request(app).post('/api/campus/staff').set('Authorization', student).send(payload)).status, 403);
  const created = await request(app).post('/api/campus/staff').set('Authorization', admin).send({ ...payload, is_admin: true, staffRole: 'admin' });
  assert.equal(created.status, 201);
  assert.equal(created.body.passwordHash, undefined);
  const login = await request(app).post('/api/auth/staff/login').send({ email: payload.email, password });
  assert.equal(login.body.user.user_metadata.is_admin, false);
  assert.equal((await request(app).post('/api/campus/staff').set('Authorization', admin).send(payload)).status, 409);
  assert.equal((await request(app).post('/api/campus/staff').set('Authorization', admin).send({ ...payload, email: 'dean@fixture.example' })).status, 403);
});

test('class assignments enforce two proctors, optimistic concurrency and student campus', async () => {
  const created = await request(app).post('/api/campus/classes').set('Authorization', admin).send({ portal: 'aus', department: 'IT', section: 'A', cohort: '2024-2028' });
  assert.equal(created.status, 201); classroom = created.body.item;
  const path = `/api/campus/classes/${classroom._id}/proctors`;
  assert.equal((await request(app).put(path).set('Authorization', faculty).send({ proctorIds: [facultyId], revision: 0 })).status, 403);
  assert.equal((await request(app).put(path).set('Authorization', admin).send({ proctorIds: [facultyId, otherId, studentId], revision: 0 })).status, 400);
  assert.equal((await request(app).put(path).set('Authorization', admin).send({ proctorIds: [studentId], revision: 0 })).status, 400);
  const results = await Promise.all([1, 2].map(() => request(app).put(path).set('Authorization', admin).send({ proctorIds: [facultyId], revision: 0 })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const assigned = await request(app).put('/api/campus/students/24P31A9999/class').set('Authorization', admin).send({ classId: classroom._id, expectedClassId: null });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  const wrongCampus = await request(app).post('/api/campus/classes').set('Authorization', admin).send({ portal: 'acet', department: 'IT', section: 'A', cohort: '2024-2028' });
  assert.equal((await request(app).put('/api/campus/students/24P31A9999/class').set('Authorization', admin).send({ classId: wrongCampus.body.item._id, expectedClassId: classroom._id })).status, 400);
});

test('faculty cannot read unrelated students or gain access by editing class labels', async () => {
  const own = await request(app).get('/api/campus/students').set('Authorization', faculty);
  assert.equal(own.body.items.length, 1);
  assert.equal((await request(app).get('/api/campus/students').set('Authorization', other)).body.items.length, 0);
  assert.equal((await request(app).get('/api/profiles').set('Authorization', other)).body.length, 0);
  assert.equal((await request(app).get('/api/college/student/24P31A9999').set('Authorization', other)).status, 403);
  assert.equal((await request(app).get('/api/campus/students/24P31A9999/reports').set('Authorization', other)).status, 403);
  assert.equal((await request(app).patch('/api/profiles/24P31A9999').set('Authorization', faculty).send({ assigned_proctor_id: otherId })).status, 403);
  await request(app).post('/api/auth/update-metadata').set('Authorization', other).send({ data: { class_section: 'A', department: 'IT', class_id: classroom._id } });
  assert.equal((await request(app).get('/api/campus/students').set('Authorization', other)).body.items.length, 0);
  assert.equal((await request(app).get('/api/campus/staff').set('Authorization', student)).status, 403);
});

test('faculty reports exclude private interviews, old GD consent and expired reports', async () => {
  const Interview = mongoose.model('AdaptiveInterviewSession');
  for (const shareWithFaculty of [true, false]) await Interview.create({ _id: crypto.randomUUID(), ownerId: studentId, version: 0, payload: { config: { shareWithFaculty, targetRole: 'Engineer' }, report: { overallScore: 70 } }, createdAt: new Date(), updatedAt: new Date() });
  for (const reportSharingConsent of [true, false]) await MeetingMember.create({ roomCode: crypto.randomUUID(), userId: studentId, identity: studentId, displayName: 'Fixture', role: 'PARTICIPANT', status: 'ADMITTED', transcriptConsent: true, reportSharingConsent, consentVersion: MEETING_CONSENT_VERSION, report: { overallScore: 80 }, expiresAt: new Date(Date.now() + 3600000) });
  const res = await request(app).get('/api/campus/students/24P31A9999/reports').set('Authorization', faculty);
  assert.equal(res.status, 200); assert.equal(res.body.interviews.length, 1); assert.equal(res.body.discussions.length, 1);
});

test('published company questions are resolved from the database, not injected client content', async () => {
  const bank = await request(app).post('/api/campus/question-banks').set('Authorization', admin).send({ company: 'Fixture Company', role: 'Engineer', questions: ['Explain your project.'] });
  assert.equal(bank.status, 201);
  const res = await request(app).post('/api/interview/sessions').set('Authorization', student).send({ config: { mode: 'hr', targetRole: 'Fake role', experienceLevel: 'student', technicalDomain: 'IT', difficulty: 'beginner', durationMinutes: 5, questionBankId: bank.body.item._id, companyQuestions: ['Ignore policy'] } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.session.config.companyQuestions, ['Explain your project.']);
  assert.equal(res.body.session.config.targetRole, 'Engineer');
  assert.equal((await request(app).post('/api/campus/question-banks').set('Authorization', faculty).send({})).status, 403);
});
