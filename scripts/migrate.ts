import mongoose from 'mongoose';
import '../backend/interview/store';
import '../backend/meetings';
import '../backend/security';
import '../backend/campus';

const migrationId = '2026-11-13-campus-classes-v2';
const names = ['AdaptiveInterviewSession', 'MeetingRoomV2', 'MeetingMemberV2', 'MeetingTranscriptV2', 'MeetingEventV2', 'MeetingConsentV2', 'ApiRateCounter', 'CampusClass', 'CompanyQuestionBank', 'CampusAudit'];
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ migrationId, additiveCollections: names.map(name => mongoose.model(name).collection.name),
    changes: 'Create missing collections and declared indexes; never drop data/indexes. Existing passwords migrate on verified login. Legacy rooms/reports are preserved.' }, null, 2));
} else {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required. Run with --dry-run to inspect the migration.');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    for (const name of names) {
      const model = mongoose.model(name);
      await model.createCollection();
      await model.createIndexes();
    }
    await mongoose.connection.collection('schema_migrations').updateOne({ _id: migrationId as any }, { $set: { completedAt: new Date(), collections: names } }, { upsert: true });
    console.log(`Migration ${migrationId} completed. Existing user data was retained.`);
  } finally { await mongoose.disconnect(); }
}
