const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/scraperApiService'); // or serpapi service
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

// Helper to build dedup keys
const buildKey = (type, value) => `${type}:${value}`;

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🔍 Finder: ${niche} in ${country}`);

  try {
    const searchResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 Search returned ${searchResults.length} results`);

    const leads = [];
    let scraped = 0;

    const tasks = searchResults.map((result) =>
      limit(async () => {
        let email = '', phone = '', name = result.title || 'Contact', company = result.title || '';

        if (result.link && result.link.startsWith('http')) {
          const data = await scrapeWebsite(result.link);
          email = data.email || '';
          phone = data.phone || result.phone || '';
          name = data.name || result.title || 'Contact';
          company = data.company || result.title || '';
        } else {
          phone = result.phone || '';
        }

        if (email || phone) {
          scraped++;
          leads.push({
            name,
            company,
            email,
            phone,
            country: normalizeCountryCode(country) || country?.toUpperCase() || '',
            niche,
            status: 'new',
          });
        }
      })
    );

    await Promise.all(tasks);

    // Deduplicate from leads itself (same batch)
    const uniqueBatch = [];
    const seenBatch = new Set();
    for (const l of leads) {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

      let key = '';
      if (phone) key = buildKey('phone', phone);
      else if (email) key = buildKey('email', email);
      else if (company) key = buildKey('company', company);
      else key = `name:${l.name || ''}`;

      if (!seenBatch.has(key)) {
        seenBatch.add(key);
        uniqueBatch.push(l);
      }
    }

    // Fetch existing leads and build existing keys
    const existing = await Lead.find({}, { phone: 1, email: 1, company: 1 }).lean();
    const existingKeys = new Set();
    existing.forEach(l => {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (phone) existingKeys.add(buildKey('phone', phone));
      if (email) existingKeys.add(buildKey('email', email));
      if (company) existingKeys.add(buildKey('company', company));
    });

    const newLeads = uniqueBatch.filter(l => {
      const phone = (l.phone || '').replace(/[^0-9+]/g, '');
      const email = (l.email || '').toLowerCase().trim();
      const company = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (phone && existingKeys.has(buildKey('phone', phone))) return false;
      if (email && existingKeys.has(buildKey('email', email))) return false;
      if (company && existingKeys.has(buildKey('company', company))) return false;
      return true;
    });

    const saved = newLeads.length > 0 ? await Lead.insertMany(newLeads) : [];
    console.log(`💾 Saved ${saved.length} new leads (duplicates skipped)`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
