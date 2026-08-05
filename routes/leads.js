const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');

// Get leads with optional filters and search
router.get('/', async (req, res) => {
  try {
    const { niche, country, status, search } = req.query;
    const filter = {};

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

// Bulk delete leads
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    await Lead.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deletedCount: ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get distinct filter values (niches, countries)
router.get('/filters', async (req, res) => {
  try {
    const [niches, countries] = await Promise.all([
      Lead.distinct('niche'),
      Lead.distinct('country'),
    ]);
    res.json({
      niches: (niches || []).filter(Boolean),
      countries: (countries || []).filter(Boolean),
      statuses: ['new', 'contacted', 'replied', 'converted'],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update a single lead
router.put('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Track WhatsApp click
router.put('/:id/whatsapp-click', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { whatsappClicks: 1 },
        $push: { whatsappClickedAt: new Date() },
      },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
