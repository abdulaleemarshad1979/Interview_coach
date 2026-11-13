import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MAX_PHOTO_BYTES, validImage } from './collegePortal';

// Photos live in their own collection, served by URL. Embedding them as base64 in user/profile
// documents bloated every /api/auth/me response and overflowed the browser's localStorage quota.
const PhotoSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true },
  contentType: { type: String, required: true },
  bytes: { type: Buffer, required: true },
  sha1: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false, collection: 'profile_photos' });
const ProfilePhoto: mongoose.Model<any> = mongoose.models.ProfilePhoto || mongoose.model('ProfilePhoto', PhotoSchema);

export function decodeDataUri(value: unknown): { mime: string; bytes: Buffer } | null {
  const match = typeof value === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value) : null;
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  return bytes.length <= MAX_PHOTO_BYTES && validImage(match[1], bytes) ? { mime: match[1], bytes } : null;
}

export const isPhotoUrl = (value: unknown): value is string => typeof value === 'string' && value.startsWith('/api/photo/');

/** Stores (or refreshes) a student's photo and returns its capability URL. `changed` is false when bytes are identical. */
export async function storePhoto(rollNo: string, mime: string, bytes: Buffer, sourceUrl = ''): Promise<{ url: string; changed: boolean }> {
  const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
  const existing: any = await ProfilePhoto.findOne({ rollNo }).select({ _id: 1, sha1: 1 }).lean();
  // The random key is unguessable, so the URL works in <img> tags without leaking photos by roll-number enumeration.
  const key = existing?._id || crypto.randomBytes(18).toString('hex');
  if (existing?.sha1 === sha1) { if (sourceUrl) await ProfilePhoto.updateOne({ _id: key }, { $set: { sourceUrl } }); return { url: `/api/photo/${key}?v=${sha1.slice(0, 10)}`, changed: false }; }
  await ProfilePhoto.updateOne({ _id: key }, { $set: { rollNo, contentType: mime, bytes, sha1, sourceUrl, updatedAt: new Date() } }, { upsert: true });
  return { url: `/api/photo/${key}?v=${sha1.slice(0, 10)}`, changed: true };
}

export async function readPhoto(key: string): Promise<{ contentType: string; bytes: Buffer; sha1: string } | null> {
  if (!/^[a-f0-9]{36}$/.test(key)) return null;
  const doc: any = await ProfilePhoto.findById(key).select({ contentType: 1, bytes: 1, sha1: 1 }).lean();
  return doc ? { contentType: doc.contentType, bytes: Buffer.from(doc.bytes.buffer ?? doc.bytes), sha1: doc.sha1 } : null;
}

export async function storedPhotoSource(rollNo: string): Promise<string> {
  const doc: any = await ProfilePhoto.findOne({ rollNo }).select({ sourceUrl: 1 }).lean();
  return doc?.sourceUrl || '';
}

/** Best-effort unauthenticated refresh from the portal's own photo URL; any failure leaves the stored photo untouched. */
export async function fetchPublicPhoto(sourceUrl: string, fetcher: typeof fetch = fetch): Promise<{ mime: string; bytes: Buffer } | null> {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || url.origin !== 'https://info.aec.edu.in') return null;
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'InterviewCoach/1.0', Accept: 'image/*' } });
    if (response.status !== 200) { await response.body?.cancel(); return null; }
    const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= MAX_PHOTO_BYTES && validImage(mime, bytes) ? { mime, bytes } : null;
  } catch { return null; }
}
