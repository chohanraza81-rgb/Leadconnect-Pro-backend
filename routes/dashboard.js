const router = require('express').Router();
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');

router.get('/stats', async (req, res) => {
  try {
    const [totalLeads, emailsFound, whatsapp, campaignsSent] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ email: { $ne: '', $exists: true } }),
      Lead.aggregate([{ $group: { _id: null, total: { $sum: '$whatsappClicks' } } }]),
      Campaign.countDocuments(),
    ]);
    res.json({
      totalLeads: totalLeads || 0,
      emailsFound: emailsFound || 0,
      whatsappClicks: whatsapp[0]?.total || 0,
      campaignsSent: campaignsSent || 0,
    });
  } catch (e) {
    res.json({ totalLeads: 0, emailsFound: 0, whatsappClicks: 0, campaignsSent: 0 });
  }
});

router.get('/country-stats', async (req, res) => {
  try {
    const data = await Lead.aggregate([
      { $match: { country: { $ne: '', $exists: true } } },
      { $group: { _id: { $toUpper: '$country' }, count: { $sum: 1 } } },
    ]);

    // Build map from aggregated data
    const map = {};
    data.forEach(d => { if (d._id) map[d._id] = d.count; });

    // Ensure all standard countries are present
    const standard = ['US', 'UK', 'CA', 'AU', 'DE', 'SG', 'SA', 'AE', 'PK', 'IN', 'TR', 'MY'];
    const result = standard.map(code => ({
      country: code,
      count: map[code] || 0,
    }));

    // Add any extra countries (e.g., KARACHI, INDIAN) with their counts
    Object.keys(map).forEach(code => {
      if (!standard.includes(code)) {
        result.push({ country: code, count: map[code] });
      }
    });

    res.json(result);
  } catch (e) {
    res.json([]);
  }
});

router.get('/performance', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [whatsapp, emails] = await Promise.all([
      Lead.aggregate([
        { $unwind: { path: '$whatsappClickedAt', preserveNullAndEmptyArrays: false } },
        { $match: { whatsappClickedAt: { $gte: thirtyDaysAgo, $lte: now } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$whatsappClickedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Campaign.aggregate([
        { $unwind: { path: '$sequence', preserveNullAndEmptyArrays: false } },
        { $match: { 'sequence.sentAt': { $gte: thirtyDaysAgo, $lte: now }, 'sequence.type': 'email' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sequence.sentAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({ whatsapp: whatsapp || [], emails: emails || [] });
  } catch (e) {
    res.json({ whatsapp: [], emails: [] });
  }
});

router.get('/geo-data', async (req, res) => {
  try {
    const data = await Lead.aggregate([
      { $match: { country: { $ne: '', $exists: true } } },
      { $group: { _id: { $toUpper: '$country' }, count: { $sum: 1 } } },
    ]);
    const map = {};
    data.forEach(d => { if (d._id) map[d._id] = d.count; });
    res.json(map);
  } catch (e) {
    res.json({});
  }
});

module.exports = router;
