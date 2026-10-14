import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
let app: any;
let auth: string;
let userId: string;
before(async () => {
  process.env.TEST_MODE = 'true'; process.env.NODE_ENV = 'test';
  process.env.APP_URL = 'http://localhost';
  delete process.env.GROQ_API_KEY; delete process.env.ADMIN_EMAILS; delete process.env.FACULTY_EMAILS;
  mongo = await MongoMemoryServer.create(); process.env.MONGODB_URI = mongo.getUri();
  app = (await import('../server.ts')).default;
  const signup = await request(app).post('/api/auth/signup').send({ email: 'ada@example.com', password: 'test-password-secure', user_metadata: { student_name: 'Ada' } });
  assert.equal(signup.status, 201, JSON.stringify(signup.body));
  auth = `Bearer ${signup.body.session.access_token}`; userId = signup.body.user.id;
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('actual auth persists login sessions and prevents browser role escalation', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'test-password-secure' });
  assert.equal(login.status, 200);
  const wrong = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrong-password' });
  assert.equal(wrong.status, 400);
  const update = await request(app).post('/api/auth/update-metadata').set('Authorization', auth).send({ data: { is_admin: true, is_faculty: true, roll_number: 'OTHER', name: 'Ada revised' } });
  assert.equal(update.status, 200);
  assert.equal(update.body.user.user_metadata.is_admin, false);
  assert.equal(update.body.user.user_metadata.roll_number, userId);
  const staff = await request(app).post('/api/auth/signup').send({ email: 'evil@example.com', password: 'test-password-secure', user_metadata: { is_admin: true } });
  assert.equal(staff.status, 403);
  process.env.ADMIN_EMAILS = 'reserved@example.com';
  const reserved = await request(app).post('/api/auth/signup').send({ email: 'reserved@example.com', password: 'test-password-secure' });
  assert.equal(reserved.status, 403); delete process.env.ADMIN_EMAILS;
  const college = await request(app).post('/api/auth/signup').send({ email: '24p31a1234@aec.edu.in', password: 'test-password-secure' });
  assert.equal(college.status, 403);
  const ownProfiles = await request(app).get('/api/profiles').set('Authorization', auth);
  assert.equal(ownProfiles.body[0].ownerId, userId);
  const current = await request(app).get('/api/auth/me').set('Authorization', auth);
  assert.equal(current.body.user.id, userId);
  process.env.ADMIN_EMAILS = 'ada@example.com';
  const unprovisioned = await request(app).get('/api/auth/me').set('Authorization', auth);
  assert.equal(unprovisioned.body.user.user_metadata.is_admin, false);
  await mongoose.model('User').updateOne({ _id: userId }, { staffProvisioned: true });
  const provisioned = await request(app).get('/api/auth/me').set('Authorization', auth);
  assert.equal(provisioned.body.user.user_metadata.is_admin, true);
  delete process.env.ADMIN_EMAILS;
  await mongoose.model('User').updateOne({ _id: userId }, { staffProvisioned: false });
});

test('session expiry is enforced before eventual Mongo TTL deletion', async () => {
  const login = await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'test-password-secure' });
  await mongoose.model('Session').updateOne({ token: login.body.session.access_token }, { createdAt: new Date(Date.now() - 8 * 86400000) });
  const expired = await request(app).get('/api/interview/sessions').set('Authorization', `Bearer ${login.body.session.access_token}`);
  assert.equal(expired.status, 401);
});

test('profile ownership, API authentication, origins and retired endpoints are enforced', async () => {
  assert.equal((await request(app).post('/api/profiles/upsert').set('Authorization', auth).send({ id: 'OTHER', name: 'Impersonated' })).status, 403);
  assert.equal((await request(app).patch('/api/profiles/OTHER').set('Authorization', auth).send({ is_admin: true })).status, 403);
  assert.equal((await request(app).get('/api/interview/sessions')).status, 401);
  assert.equal((await request(app).get('/api/meetings')).status, 401);
  assert.equal((await request(app).get('/api/voice/status').set('Origin', 'https://attacker.example')).status, 403);
  assert.equal((await request(app).post('/api/gd-room/join').send({ createNew: true, name: 'Fake host' })).status, 410);
  assert.equal((await request(app).post('/api/interview/generate-report').send({})).status, 410);
  assert.equal((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{')).status, 400);
});

test('actual Mongo interview persistence survives provider failure without fabricated responses', async () => {
  const created = await request(app).post('/api/interview/sessions').set('Authorization', auth).send({ config: {
    mode: 'technical', targetRole: 'Backend engineer', experienceLevel: 'junior', technicalDomain: 'Node.js', difficulty: 'intermediate', durationMinutes: 15,
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const session = created.body.session;
  assert.equal(session.state, 'PREPARING');
  const started = await request(app).post(`/api/interview/sessions/${session.id}/start`).set('Authorization', auth).send({ requestId: 'actual-start-001', expectedVersion: session.version });
  assert.equal(started.status, 503);
  assert.equal(started.body.code, 'PROVIDER_NOT_CONFIGURED');
  const loaded = await request(app).get(`/api/interview/sessions/${session.id}`).set('Authorization', auth);
  assert.equal(loaded.status, 200); assert.equal(loaded.body.session.report, null);
  assert.equal(loaded.body.session.turns.filter((turn: any) => turn.role === 'interviewer').length, 0);
  assert.equal((await request(app).post('/api/voice/synthesize').set('Authorization', auth).send({ text: 'Tell me about a recent project.', voice: 'hannah' })).status, 503);
  assert.equal((await request(app).delete(`/api/interview/sessions/${session.id}`).set('Authorization', auth)).status, 204);
  assert.equal((await request(app).get(`/api/interview/sessions/${session.id}`).set('Authorization', auth)).status, 404);
});
