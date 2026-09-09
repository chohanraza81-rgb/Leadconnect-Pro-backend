const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchGoogleMaps, scrapeMapWebsite } = require('../services/googleMapsScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, location } = req.body;
  if (!niche || !location) return res.status(400).json({ error: 'Niche and location required' });

  console.log(`📍 Local Insights: ${niche} in ${location}`);

  try {
    const mapResults = await searchGoogleMaps(niche, location);
    console.log(`📊 Google Maps found ${mapResults.length} places`);

    const leads = [];
    let withWebsite = 0, withEmail = 0;

    const tasks = mapResults.map(result =>
      limit(async () => {
        const lead = {
          name: result.title,
          company: result.title,
          phone: result.phone || '',
          country: normalizeCountryCode(location?.split(',')?.pop()?.trim()) || location?.split(',')?.pop()?.trim()?.toUpperCase() || '',
          niche,
          address: result.address || '',
          rating: result.rating || '',
          reviews: result.reviews || '',
          type: result.type || '',
          email: '',
          status: 'new',
        };

        if (result.website) {
          withWebsite++;
          const webData = await scrapeMapWebsite(result.website);
          if (webData.email) {
            lead.email = webData.email;
            withEmail++;
          }
        }
        leads.push(lead);
      })
    );

    await Promise.all(tasks);

    // Deduplicate (same pattern)
    const uniqueBatch = [];
    const seenBatch = new Set();
    for (const l of leads) {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      let key = '';
      if (phone) key = `phone:${phone}`;
      else if (email) key = `email:${email}`;
      else if (company) key = `company:${company}`;
      else key = `name:${l.name || ''}`;
      if (!seenBatch.has(key)) {
        seenBatch.add(key);
        uniqueBatch.push(l);
      }
    }

    const existing = await Lead.find({}, { phone: 1, email: 1, company: 1 }).lean();
    const existingKeys = new Set();
    existing.forEach(l => {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (phone) existingKeys.add(`phone:${phone}`);
      if (email) existingKeys.add(`email:${email}`);
      if (company) existingKeys.add(`company:${company}`);
    });

    const newLeads = uniqueBatch.filter(l => {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (phone && existingKeys.has(`phone:${phone}`)) return false;
      if (email && existingKeys.has(`email:${email}`)) return false;
      if (company && existingKeys.has(`company:${company}`)) return false;
      return true;
    });

    const saved = newLeads.length > 0 ? await Lead.insertMany(newLeads) : [];
    console.log(`💾 Saved ${saved.length} new local leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Local insights error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
