import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

test('additive migration is repeatable and preserves existing records', async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const original = { id: 'legacy-profile', name: 'Existing profile', attendance: 73 };
    await mongoose.connection.collection('profiles').insertOne(original);
    const run = promisify(execFile);
    for (let index = 0; index < 2; index++) await run(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
      env: { ...process.env, MONGODB_URI: mongo.getUri() }, timeout: 20000,
    });
    const kept = await mongoose.connection.collection('profiles').findOne({ id: original.id });
    assert.equal(kept?.attendance, original.attendance);
    assert.equal(kept?.name, original.name);
    assert.equal(await mongoose.connection.collection('schema_migrations').countDocuments(), 1);
    const collections = (await mongoose.connection.db!.listCollections().toArray()).map(collection => collection.name);
    assert.ok(collections.includes('interview_sessions'));
    assert.ok(collections.includes('meetingtranscriptv2'));
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
