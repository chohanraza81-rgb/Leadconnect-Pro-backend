// backend/routes/leads.js
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');

// ═══════════ GET ALL LEADS (sirf apne) ═══════════
router.get('/', async (req, res) => {
  try {
    const { niche, country, status, search } = req.query;

    // 🔒 Ownership filter — sabse pehle
    const filter = { userId: req.userId };

    if (niche && niche !== 'all') filter.niche = niche;
    if (country && country !== 'all') filter.country = country;
    if (status && status !== 'all') filter.status = status;
    if (search && search.trim()) {
      const s = search.trim();
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { company: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
    }

    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════ BULK DELETE (sirf apne) ═══════════
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    // 🔒 Sirf apne leads delete ho — userId condition
    const result = await Lead.deleteMany({
      _id: { $in: ids },
      userId: req.userId,
    });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════ FILTERS (sirf apne data se) ═══════════
router.get('/filters', async (req, res) => {
  try {
    // 🔒 distinct bhi scoped — sirf apne niches/countries
    const [niches, countries] = await Promise.all([
      Lead.distinct('niche', { userId: req.userId }),
      Lead.distinct('country', { userId: req.userId }),
    ]);

    res.json({
      niches: (niches || []).filter(Boolean),
      countries: (countries || []).filter(Boolean),
      statuses: ['new', 'contacted', 'replied', 'qualified', 'converted'],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════ UPDATE LEAD (ownership check) ═══════════
router.put('/:id', async (req, res) => {
  try {
    // 🔒 userId + _id dono match — warna 404
    // Client kabhi userId spoof nahi kar sakta
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════ WHATSAPP CLICK TRACK (ownership check) ═══════════
router.put('/:id/whatsapp-click', async (req, res) => {
  try {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        $inc: { whatsappClicks: 1 },
        $push: { whatsappClickedAt: new Date() },
      },
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
