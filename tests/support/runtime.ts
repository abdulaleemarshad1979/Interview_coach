import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Isolated database; never load the developer's .env or a production database.
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.NODE_ENV = 'test';
process.env.PORT = '3100';
process.env.HOST = '127.0.0.1';
process.env.APP_URL = 'http://127.0.0.1:3100';
delete process.env.GROQ_API_KEY;
delete process.env.ADMIN_EMAILS;
delete process.env.FACULTY_EMAILS;
// Enable only with a locally running development SFU. These are public dev-mode credentials.
if (process.env.TEST_LOCAL_SFU === 'true') {
  process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'secret';
} else { delete process.env.LIVEKIT_URL; delete process.env.LIVEKIT_API_KEY; delete process.env.LIVEKIT_API_SECRET; }
delete process.env.TEST_MODE;
await import('../../server.ts');
const stop = async () => { await mongoose.disconnect(); await mongo.stop(); process.exit(0); };
process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
