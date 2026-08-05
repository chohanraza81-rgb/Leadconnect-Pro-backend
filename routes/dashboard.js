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
      { $sort: { count: -1 } },
    ]);
    const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'SG', 'SA', 'AE', 'PK', 'IN', 'TR', 'MY'];
    const result = countries.map(code => {
      const found = data.find(d => d._id === code);
      return { country: code, count: found ? found.count : 0 };
    });
    data.forEach(d => {
      if (!countries.includes(d._id) && d._id) result.push({ country: d._id, count: d.count });
    });
    res.json(result);
  } catch (e) {
    res.json(countries.map(c => ({ country: c, count: 0 })));
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
