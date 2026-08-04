const router = require('express').Router();
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const { generateEmailSequence } = require('../services/groqService');
const { sendEmail } = require('../services/emailSender');

// Generate sequence for a specific lead
router.post('/generate-email', async (req, res) => {
  const { leadId, offer } = req.body;
  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const emails = await generateEmailSequence({
      firstName: lead.name.split(' ')[0],
      company: lead.company,
      offer,
    });
    res.json({ emails });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Campaign CRUD
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find().populate('leads', 'name company email').sort('-createdAt');
    res.json(campaigns);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    const campaign = new Campaign(req.body);
    await campaign.save();
    res.json(campaign);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    await Campaign.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a specific email step from a campaign
router.post('/send-email', async (req, res) => {
  const { campaignId, stepIndex, toEmail } = req.body;
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const step = campaign.sequence[stepIndex];
    if (!step || step.type !== 'email') return res.status(400).json({ error: 'Invalid step' });
    await sendEmail({ to: toEmail, subject: step.subject, html: `<p>${step.body.replace(/\n/g, '<br>')}</p>` });
    step.sentAt = new Date();
    await campaign.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get WhatsApp links
router.post('/whatsapp-links', async (req, res) => {
  const { leadIds, message } = req.body;
  try {
    const leads = await Lead.find({ _id: { $in: leadIds } });
    const links = leads
      .filter(l => l.phone)
      .map(l => `https://wa.me/${l.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`);
    res.json({ links });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
