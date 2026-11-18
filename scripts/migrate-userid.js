// backend/scripts/migrate-userid.js
require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Report = require('../models/Report'); // agar hai to
// ... baqi models import karein (LocalBusiness etc.)

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const OWNER_ID = process.env.OWNER_USER_ID;
  if (!OWNER_ID || !OWNER_ID.startsWith('user_')) {
    console.error('❌ OWNER_USER_ID environment variable set karein (Clerk userId — user_xxx)');
    process.exit(1);
  }

  console.log(`Migrating data to owner: ${OWNER_ID}`);

  const models = [
    { name: 'Lead', model: Lead },
    // { name: 'Report', model: Report },
    // { name: 'LocalBusiness', model: LocalBusiness },
  ];

  for (const { name, model } of models) {
    const result = await model.updateMany(
      { userId: { $exists: false } },   // jinme userId nahi hai
      { $set: { userId: OWNER_ID } }     // owner ko assign
    );
    console.log(`✅ ${name}: ${result.modifiedCount} documents migrated`);
  }

  await mongoose.disconnect();
  console.log('✅ Done');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
