import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { configuredRoles, createPasswordHash, PASSWORD_SCHEME, validateCredentials } from '../backend/authSafety';

const email = (process.env.STAFF_EMAIL || '').trim().toLowerCase();
const roles = configuredRoles(email);
if (!email || !roles.is_faculty) throw new Error('Set STAFF_EMAIL to an address authorized in ADMIN_EMAILS or FACULTY_EMAILS.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
process.env.TEST_MODE = 'true';
await import('../server');
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const User: mongoose.Model<any> = mongoose.model('User');
  let user: any = await User.findOne({ email });
  if (!user) {
    const { password } = validateCredentials(email, process.env.STAFF_INITIAL_PASSWORD, true);
    const salt = crypto.randomBytes(16).toString('hex');
    user = await User.create({ email, salt, passwordHash: await createPasswordHash(password, salt), passwordScheme: PASSWORD_SCHEME,
      user_metadata: { faculty_name: process.env.STAFF_NAME || 'Staff member', ...roles } });
  }
  user.staffProvisioned = true;
  await user.save();
  await mongoose.model('Profile').findOneAndUpdate({ id: user._id.toString() }, { $set: {
    ownerId: user._id.toString(), name: process.env.STAFF_NAME || user.user_metadata?.faculty_name || 'Staff member', ...roles,
  } }, { upsert: true, returnDocument: 'after' });
  console.log('Staff account provisioned. Existing account password was retained. Remove STAFF_INITIAL_PASSWORD from the environment.');
} finally { await mongoose.disconnect(); }
