import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { officialPortalFixture } from '../fixtures/collegePortal';

// Isolated database; never load the developer's .env or a production database.
const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.TEST_BROWSER_PORT || '3100';
process.env.HOST = '127.0.0.1';
process.env.APP_URL = `http://127.0.0.1:${process.env.PORT}`;
delete process.env.GROQ_API_KEY;
delete process.env.ADMIN_EMAILS;
delete process.env.FACULTY_EMAILS;
// The browser suite signs in through the real app API and an isolated official
// portal fixture. No request goes to the live college service.
const nativeFetch = globalThis.fetch;
const portalFixture = officialPortalFixture('browser-test-password');
globalThis.fetch = (input, init) => String(input).startsWith('https://info.aec.edu.in/')
  ? portalFixture.fetcher(input, init) : nativeFetch(input, init);
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
