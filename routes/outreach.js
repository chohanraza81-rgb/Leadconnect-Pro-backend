const express = require('express');
const router = express.Router();
const axios = require('axios');
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const { generateEmailSequence } = require('../services/groqService');
const { sendEmail } = require('../services/emailSender');
const { getConfig } = require('../services/config');

// =============== EXISTING ENDPOINTS ===============

// Generate sequence for a single lead (Sequencer – still available if needed)
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
    const campaigns = await Campaign.find()
      .populate('leads', 'name company email phone')
      .sort('-createdAt');
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

// Get WhatsApp links for selected leads
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

// =============== EMAIL TEMPLATE GENERATION (for bulk email) ===============
router.post('/generate-template', async (req, res) => {
  const { subject, offer, signature } = req.body;
  if (!subject || !offer) return res.status(400).json({ error: 'Subject (niche) and offer are required' });

  try {
    const apiKey = getConfig().groqApiKey;
    if (!apiKey) return res.status(500).json({ error: 'Groq API key not configured' });

    const prompt = `Write 3 different professional email templates for a B2B outreach campaign.
Topic: ${subject}
Value proposition: ${offer}
${signature ? `Signature: ${signature}` : ''}

IMPORTANT RULES:
- Use "{{firstName}}" as a placeholder for the recipient's first name.
- Use "{{company}}" as a placeholder for their company name.
- Include the signature exactly as provided at the end of each email.
- Make each template polished, actionable, and under 200 words.
Label each template clearly with "Option 1:", "Option 2:", "Option 3:".`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1200,
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    const text = response.data.choices[0].message.content;
    const parts = text.split(/Option \d:/i).filter(s => s.trim().length > 30);
    const templates = parts.length >= 3 ? parts.slice(0, 3) : parts.length > 0 ? parts : [text];
    res.json({ templates: templates.map(t => t.trim()) });
  } catch (e) {
    console.error('Template generation error:', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to generate templates' });
  }
});

// =============== BULK SEND EMAIL (with personalization) ===============
router.post('/bulk-send', async (req, res) => {
  const { to, subject, body, leadId } = req.body;
  try {
    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const company = lead.company || 'your company';

    let personalizedBody = body
      .replace(/{{firstName}}/g, firstName)
      .replace(/{{company}}/g, company);

    await sendEmail({ to, subject, html: `<p>${personalizedBody.replace(/\n/g, '<br>')}</p>` });

    // Save or update campaign
    let campaign = await Campaign.findOne({ name: subject });
    if (!campaign) {
      campaign = new Campaign({
        name: subject,
        leads: [leadId],
        sequence: [{ step: 1, type: 'email', subject, body: personalizedBody, sentAt: new Date() }],
        sentAt: new Date(),
      });
    } else {
      campaign.leads.push(leadId);
      campaign.sequence.push({ step: campaign.sequence.length + 1, type: 'email', subject, body: personalizedBody, sentAt: new Date() });
    }
    await campaign.save();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============== WHATSAPP MESSAGE GENERATOR (MULTIPLE OPTIONS) ===============
router.post('/generate-whatsapp-template', async (req, res) => {
  const { niche, offer, signature } = req.body;
  if (!niche || !offer) return res.status(400).json({ error: 'Niche and offer are required' });

  try {
    const apiKey = getConfig().groqApiKey;
    if (!apiKey) return res.status(500).json({ error: 'Groq API key not configured' });

    const prompt = `You are an expert WhatsApp outreach specialist for Pakistani businesses.

Write 3 different WhatsApp messages for a business offering "${offer}" to companies in the "${niche}" industry.

RULES:
- Each message must be short (max 150 characters), friendly, and professional.
- Use "{{firstName}}" as a placeholder for the recipient's name.
- Use "{{company}}" as a placeholder for their company name.
- End each message with the signature: ${signature || ''}
- Make every message ACTIONABLE – include a clear next step (e.g., "reply YES", "visit our site", "call now").
- Avoid spammy words like "free", "discount", "offer" overuse – sound like a genuine business connection.

Label each option clearly with "Option 1:", "Option 2:", "Option 3:".`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 400,
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    const text = response.data.choices[0].message.content;
    const parts = text.split(/Option \d:\s*/i).filter(s => s.trim().length > 10);
    const templates = parts.length >= 3 ? parts.slice(0, 3) : parts.length > 0 ? parts : [text];
    res.json({ templates: templates.map(t => t.trim()) });
  } catch (e) {
    console.error('WhatsApp template error:', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to generate WhatsApp templates' });
  }
});

module.exports = router;
