import express, { type RequestHandler } from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { canAccessProfile, configuredRoles, createPasswordHash, effectiveRoles, PASSWORD_SCHEME, profileIdForUser, validateCredentials } from './authSafety';
import { boundedText, pageParameters, validateClass, validateProctors, validateQuestionBank } from './campusValidation';
import { ServiceError } from './errors';
import { MeetingMember, MEETING_CONSENT_VERSION } from './meetings';

const classSchema = new mongoose.Schema({
  portal: { type: String, enum: ['aus', 'acet'], required: true }, department: { type: String, required: true },
  section: { type: String, required: true }, cohort: { type: String, required: true },
  proctorIds: { type: [String], default: [], validate: (v: string[]) => v.length <= 2 && new Set(v).size === v.length },
  revision: { type: Number, default: 0 }, createdBy: String,
}, { timestamps: true });
classSchema.index({ portal: 1, department: 1, cohort: 1, section: 1 }, { unique: true });
classSchema.index({ proctorIds: 1 });
export const CampusClass: mongoose.Model<any> = mongoose.models.CampusClass || mongoose.model('CampusClass', classSchema);
const questionSchema = new mongoose.Schema({ company: String, role: String, questions: [String], createdBy: String }, { timestamps: true });
export const CompanyQuestionBank: mongoose.Model<any> = mongoose.models.CompanyQuestionBank || mongoose.model('CompanyQuestionBank', questionSchema);
const auditSchema = new mongoose.Schema({ actorId: String, action: String, subjectId: String, at: { type: Date, default: Date.now } });
export const CampusAudit: mongoose.Model<any> = mongoose.models.CampusAudit || mongoose.model('CampusAudit', auditSchema);

type CampusUser = { id: string; email: string; user_metadata?: any };
export async function profileReadFilter(user: CampusUser) {
  if (user.user_metadata?.is_admin) return {};
  if (user.user_metadata?.is_faculty) {
    const ids = await CampusClass.find({ proctorIds: user.id }).distinct('_id');
    return { $or: [{ id: profileIdForUser(user) }, { class_id: { $in: ids.map(String) } }] };
  }
  return { id: profileIdForUser(user) };
}
export async function mayReadProfile(user: CampusUser, id: string) {
  if (canAccessProfile(user, id)) return true;
  if (!user.user_metadata?.is_faculty) return false;
  return Boolean(await mongoose.model('Profile').exists({ $and: [{ id }, await profileReadFilter(user)] }));
}
function objectId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw new ServiceError(400, 'INVALID_ID', 'Invalid record ID.');
  return value;
}
export function createCampusRouter({ requireAuth }: { requireAuth: RequestHandler }) {
  const router = express.Router();
  router.use(requireAuth);
  const admin: RequestHandler = (req: any, res, next) => req.user.user_metadata?.is_admin ? next() : res.status(403).json({ error: 'Super admin access required.' });
  const staff: RequestHandler = (req: any, res, next) => req.user.user_metadata?.is_faculty ? next() : res.status(403).json({ error: 'Faculty access required.' });
  const handle = (fn: (req: any, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { void fn(req, res).catch(next); };
  const audit = (actorId: string, action: string, subjectId: string) => CampusAudit.create({ actorId, action, subjectId });
  router.get('/classes', staff, handle(async (req, res) => {
    const { limit, offset } = pageParameters(req.query);
    const filter = req.user.user_metadata.is_admin ? {} : { proctorIds: req.user.id };
    const [items, total] = await Promise.all([CampusClass.find(filter).sort({ department: 1, cohort: 1, section: 1, _id: 1 }).skip(offset).limit(limit).lean(), CampusClass.countDocuments(filter)]);
    res.json({ items, total });
  }));
  router.post('/classes', admin, handle(async (req, res) => {
    const value = validateClass(req.body);
    const item = await CampusClass.create({ ...value, createdBy: req.user.id });
    await audit(req.user.id, 'class.created', String(item._id));
    res.status(201).json({ item });
  }));
  router.put('/classes/:id/proctors', admin, handle(async (req, res) => {
    const id = objectId(req.params.id), proctorIds = validateProctors(req.body?.proctorIds);
    if (!Number.isInteger(req.body.revision) || req.body.revision < 0) throw new ServiceError(400, 'INVALID_REVISION', 'Refresh the class before assigning proctors.');
    const users = await mongoose.model('User').find({ _id: { $in: proctorIds }, staffProvisioned: true }).lean();
    if (users.length !== proctorIds.length || users.some((u: any) => !effectiveRoles(u).is_faculty)) throw new ServiceError(400, 'INVALID_PROCTOR', 'Only provisioned faculty can be assigned.');
    const item = await CampusClass.findOneAndUpdate({ _id: id, revision: req.body.revision }, { $set: { proctorIds }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true });
    if (!item) throw new ServiceError(409, 'CLASS_CHANGED', 'The class changed. Refresh and try again.');
    await audit(req.user.id, 'class.proctors.assigned', id);
    res.json({ item });
  }));
  router.put('/students/:id/class', admin, handle(async (req, res) => {
    const id = boundedText(req.params.id, 'Student ID', 128);
    const classId = req.body.classId === null ? null : objectId(req.body.classId);
    const classroom = classId ? await CampusClass.findById(classId).lean() : null;
    if (classId && !classroom) throw new ServiceError(404, 'CLASS_NOT_FOUND', 'Class not found.');
    const Profile = mongoose.model('Profile');
    const profile: any = await Profile.findOne({ id, is_faculty: false, is_synced: true }).lean();
    if (!profile?.ownerId) throw new ServiceError(404, 'STUDENT_NOT_FOUND', 'Student must sign in through their college portal first.');
    const owner: any = await mongoose.model('User').findById(profile.ownerId).select('user_metadata.college_portal').lean();
    if (classroom && owner?.user_metadata?.college_portal !== classroom.portal) throw new ServiceError(400, 'CAMPUS_MISMATCH', 'The student and class must belong to the same portal.');
    if (req.body.expectedClassId !== null && typeof req.body.expectedClassId !== 'string') throw new ServiceError(400, 'INVALID_REVISION', 'Refresh the student roster before assigning.');
    const item = await Profile.findOneAndUpdate({ id, class_id: req.body.expectedClassId }, { $set: { class_id: classId, updated_at: new Date() } }, { returnDocument: 'after' });
    if (!item) throw new ServiceError(409, 'STUDENT_CHANGED', 'Student assignment changed. Refresh and retry.');
    await audit(req.user.id, 'student.class.assigned', id);
    res.json({ item });
  }));
  router.get('/staff', admin, handle(async (req, res) => {
    const { limit, offset } = pageParameters(req.query);
    const User = mongoose.model('User');
    const [users, total] = await Promise.all([User.find({ staffProvisioned: true }).select('_id email user_metadata.faculty_name staffProvisioned staffRole lastLoginAt').sort({ _id: 1 }).skip(offset).limit(limit).lean(), User.countDocuments({ staffProvisioned: true })]);
    res.json({ total, items: users.map((u: any) => ({ id: String(u._id), email: u.email, name: u.user_metadata?.faculty_name || u.email, ...effectiveRoles(u), lastLoginAt: u.lastLoginAt || null })) });
  }));
  router.post('/staff', admin, handle(async (req, res) => {
    const { email, password } = validateCredentials(req.body?.email, req.body?.password, true);
    const name = boundedText(req.body?.name, 'Faculty name', 120);
    if (configuredRoles(email).is_admin) throw new ServiceError(403, 'RESERVED_ADMIN', 'Super admin accounts must be provisioned by the operator.');
    if (password.length < 12) throw new ServiceError(400, 'WEAK_PASSWORD', 'Use at least 12 characters for a staff password.');
    const salt = crypto.randomBytes(16).toString('hex');
    // This endpoint can create faculty only. Admin bootstrap remains operator-controlled.
    const item: any = await mongoose.model('User').create({ email, salt, passwordHash: await createPasswordHash(password, salt), passwordScheme: PASSWORD_SCHEME, staffProvisioned: true, staffRole: 'faculty', user_metadata: { faculty_name: name } });
    await audit(req.user.id, 'faculty.created', String(item._id));
    res.status(201).json({ id: String(item._id), email, name });
  }));
  router.get('/summary', admin, handle(async (_req, res) => {
    const Profile = mongoose.model('Profile'), User = mongoose.model('User'), Session = mongoose.model('Session');
    const [students, teachers, classes, enrolledClasses, active] = await Promise.all([
      Profile.countDocuments({ is_synced: true, is_faculty: false }), User.countDocuments({ staffProvisioned: true }), CampusClass.countDocuments(),
      Profile.distinct('class_id', { is_synced: true, class_id: { $ne: null } }),
      Session.aggregate([{ $match: { createdAt: { $gt: new Date(Date.now() - 7 * 86400000) } } }, { $group: { _id: '$userId' } }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'account' } }, { $match: { 'account.staffProvisioned': true } }, { $count: 'count' }]),
    ]);
    res.json({ students, teachers, classes, enrolledClasses: enrolledClasses.length, teachersWithValidSessions: active[0]?.count || 0 });
  }));
  router.get('/students', staff, handle(async (req, res) => {
    const { limit, offset } = pageParameters(req.query);
    const filter: any = { $and: [await profileReadFilter(req.user), { is_faculty: false, is_synced: true }] };
    if (req.query.classId) filter.$and.push({ class_id: objectId(req.query.classId) });
    const Profile = mongoose.model('Profile');
    const [items, total] = await Promise.all([Profile.find(filter).sort({ id: 1 }).skip(offset).limit(limit).lean(), Profile.countDocuments(filter)]);
    res.json({ items, total });
  }));
  router.get('/students/:id/reports', staff, handle(async (req, res) => {
    const id = boundedText(req.params.id, 'Student ID', 128), { limit, offset } = pageParameters(req.query);
    if (!await mayReadProfile(req.user, id)) throw new ServiceError(403, 'CLASS_ACCESS_DENIED', 'This student is outside your assigned classes.');
    const student: any = await mongoose.model('Profile').findOne({ id, is_faculty: false }).lean();
    if (!student?.ownerId) throw new ServiceError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    const [interviews, discussions] = await Promise.all([
      mongoose.model('AdaptiveInterviewSession').find({ ownerId: student.ownerId, 'payload.report': { $ne: null }, 'payload.config.shareWithFaculty': true }).select('_id payload.report payload.config.targetRole updatedAt').sort({ updatedAt: -1 }).skip(offset).limit(limit).lean(),
      MeetingMember.find({ userId: student.ownerId, report: { $ne: null }, transcriptConsent: true, reportSharingConsent: true, consentVersion: MEETING_CONSENT_VERSION, expiresAt: { $gt: new Date() } }).select('roomCode report joinedAt').sort({ joinedAt: -1 }).skip(offset).limit(limit).lean(),
    ]);
    await audit(req.user.id, 'student.reports.viewed', id);
    res.json({ interviews, discussions, limit, offset });
  }));
  router.get('/question-banks', handle(async (req, res) => {
    const { limit, offset } = pageParameters(req.query);
    const [items, total] = await Promise.all([CompanyQuestionBank.find().sort({ company: 1, _id: 1 }).skip(offset).limit(limit).lean(), CompanyQuestionBank.countDocuments()]);
    res.json({ items, total });
  }));
  router.post('/question-banks', admin, handle(async (req, res) => {
    const value = validateQuestionBank(req.body);
    const item = await CompanyQuestionBank.create({ ...value, createdBy: req.user.id });
    await audit(req.user.id, 'question-bank.created', String(item._id));
    res.status(201).json({ item });
  }));
  router.use((error: any, _req: any, res: any, _next: any) => {
    if (error?.code === 11000) return res.status(409).json({ error: 'This account or class already exists.', code: 'ALREADY_EXISTS' });
    if (error instanceof ServiceError) return res.status(error.status).json({ error: error.message, code: error.code });
    res.status(503).json({ error: 'Campus service unavailable. Refresh to check whether your change was saved.', code: 'CAMPUS_UNAVAILABLE' });
  });
  return router;
}
