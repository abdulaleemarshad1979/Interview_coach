import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';

const RateCounter: mongoose.Model<any> = mongoose.models.ApiRateCounter || mongoose.model('ApiRateCounter', new mongoose.Schema({
  _id: String, hits: { type: Number, default: 0 }, expiresAt: { type: Date, expires: 0 },
}));

// Fixed windows use a unique key per bucket, making increments atomic across replicas.
class MongoRateStore {
  windowMs = 60000;
  localKeys = false;
  constructor(public prefix: string, private connectDB: () => Promise<unknown>) {}
  init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
  private key(key: string) { return `${this.prefix}:${key}:${Math.floor(Date.now() / this.windowMs)}`; }
  async increment(key: string) {
    await this.connectDB();
    const resetTime = new Date((Math.floor(Date.now() / this.windowMs) + 1) * this.windowMs);
    const counter = await RateCounter.findOneAndUpdate({ _id: this.key(key) },
      { $inc: { hits: 1 }, $setOnInsert: { expiresAt: resetTime } }, { upsert: true, new: true });
    return { totalHits: counter.hits, resetTime };
  }
  async decrement(key: string) { await RateCounter.updateOne({ _id: this.key(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } }); }
  async resetKey(key: string) { await RateCounter.deleteOne({ _id: this.key(key) }); }
}

export function createApiLimiter(prefix: string, limit: number, windowMs: number, connectDB: () => Promise<unknown>) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    ...(process.env.NODE_ENV === 'production' ? { store: new MongoRateStore(prefix, connectDB) } : {}),
    message: { error: 'Too many requests. Please wait and try again.', code: 'RATE_LIMITED' },
  });
}

export const restrictOrigins: RequestHandler = (req, res, next) => {
  const origin = req.get('Origin');
  if (!origin) return next();
  const allowed = new Set([process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS || '').split(',')].filter(Boolean).map(value => {
    try { return new URL(value!).origin; } catch { return ''; }
  }));
  // Same-origin only by default. Reverse proxies must configure APP_URL explicitly.
  allowed.add(`${req.protocol}://${req.get('host')}`);
  if (!allowed.has(origin)) return res.status(403).json({ error: 'This origin is not allowed.', code: 'ORIGIN_DENIED' });
  res.setHeader('Vary', 'Origin');
  if (origin !== `${req.protocol}://${req.get('host')}`) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
