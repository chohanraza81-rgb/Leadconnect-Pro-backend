// backend/routes/migrate.js
// ⚠️ TEMPORARY one-time migration endpoint — use ke baad delete karein
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');

router.get('/', async (req, res) => {
  try {
    const { password, userId } = req.query;

    // ═══ Auth check ═══
    const expected = process.env.ADMIN_SETTINGS_PASSWORD;
    if (!expected) {
      return res.status(500).json({ error: 'ADMIN_SETTINGS_PASSWORD not set on server' });
    }
    if (password !== expected) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // ═══ userId validation ═══
    if (!userId || !userId.startsWith('user_')) {
      return res.status(400).json({
        error: 'Invalid userId — must start with "user_" (Clerk ID)',
        example: '/api/migrate-userid?password=XXX&userId=user_abc123',
      });
    }

    // ═══ Count before ═══
    const beforeCount = await Lead.countDocuments({ userId: { $exists: false } });
    const totalLeads = await Lead.countDocuments({});

    if (beforeCount === 0) {
      const alreadyOwned = await Lead.countDocuments({ userId });
      return res.json({
        success: true,
        message: 'No migration needed — all leads already have userId',
        stats: { totalLeads, alreadyOwned },
      });
    }

    // ═══ Migrate ═══
    const result = await Lead.updateMany(
      { userId: { $exists: false } },
      { $set: { userId } }
    );

    // ═══ Verify ═══
    const afterCount = await Lead.countDocuments({ userId });

    res.json({
      success: true,
      message: 'Migration complete',
      stats: {
        totalLeads,
        migratedNow: result.modifiedCount,
        ownedByUser: afterCount,
        ownerId: userId,
      },
    });
  } catch (err) {
    console.error('[migrate] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
