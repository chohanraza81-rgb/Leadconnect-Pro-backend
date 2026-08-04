const router = require('express').Router();
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');

router.get('/stats', async (req, res) => {
  try {
    const [totalLeads, emailsFound, whatsapp, campaignsSent] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ email: { $ne: '' } }),
      Lead.aggregate([{ $group: { _id: null, total: { $sum: '$whatsappClicks' } } }]),
      Campaign.countDocuments({ sentAt: { $ne: null } }),
    ]);
    res.json({
      totalLeads,
      emailsFound,
      whatsappClicks: whatsapp[0]?.total || 0,
      campaignsSent,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/country-stats', async (req, res) => {
  try {
    const data = await Lead.aggregate([
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'SG', 'SA', 'AE', 'PK', 'IN', 'TR', 'MY'];
    res.json(countries.map(code => ({
      country: code,
      count: data.find(d => d._id === code)?.count || 0,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/performance', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [whatsapp, emails] = await Promise.all([
      Lead.aggregate([
        { $unwind: '$whatsappClickedAt' },
        { $match: { whatsappClickedAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$whatsappClickedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Campaign.aggregate([
        { $unwind: '$sequence' },
        { $match: { 'sequence.sentAt': { $gte: thirtyDaysAgo }, 'sequence.type': 'email' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sequence.sentAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({ whatsapp, emails });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/geo-data', async (req, res) => {
  try {
    const data = await Lead.aggregate([{ $group: { _id: '$country', count: { $sum: 1 } } }]);
    const map = {};
    data.forEach(d => { map[d._id] = d.count; });
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
