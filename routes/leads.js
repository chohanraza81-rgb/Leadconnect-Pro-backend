const router = require('express').Router();
const Lead = require('../models/Lead');

// Get leads with optional filters
router.get('/', async (req, res) => {
  try {
    const { niche, country, status, search } = req.query;
    const filter = {};
    if (niche && niche !== 'all') filter.niche = niche;
    if (country && country !== 'all') filter.country = country;
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk delete
router.post('/bulk-delete', async (req, res) => {
  try {
    await Lead.deleteMany({ _id: { $in: req.body.ids } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get distinct filter values
router.get('/filters', async (req, res) => {
  try {
    const [niches, countries] = await Promise.all([
      Lead.distinct('niche'),
      Lead.distinct('country'),
    ]);
    res.json({
      niches,
      countries,
      statuses: ['new', 'contacted', 'replied', 'converted'],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update a lead
router.put('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
      { $inc: { whatsappClicks: 1 }, $push: { whatsappClickedAt: new Date() } },
      { new: true }
    );
    res.json(lead);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
