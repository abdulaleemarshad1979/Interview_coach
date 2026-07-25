import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing. Run with: npx tsx --env-file=.env scripts/db-admin.ts");
  process.exit(1);
}

const action = process.argv[2] || "list";

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI as string);
  console.log("Connected successfully!");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("Database handle not found.");
    process.exit(1);
  }

  const collections = await db.listCollections().toArray();
  console.log("\n--- Active Collections & Document Counts ---");
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(` - ${col.name}: ${count} document(s)`);
  }

  if (action === "list") {
    console.log("\n💡 To clear/wipe all database collections, run:");
    console.log("   npx tsx --env-file=.env scripts/db-admin.ts clear");
  } else if (action === "clear") {
    console.log("\n⚠️ Clearing all collections...");
    for (const col of collections) {
      await db.collection(col.name).deleteMany({});
      console.log(` ✅ Cleared collection: ${col.name}`);
    }
    console.log("\n🎉 All database collections emptied successfully!");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
