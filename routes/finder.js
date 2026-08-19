const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/scraperApiService');  // CHANGED
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(2) : pLimit(2);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🔍 Finder (ScraperAPI): ${niche} in ${country}`);

  try {
    const searchResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 ScraperAPI returned ${searchResults.length} results`);

    const leads = [];
    let scraped = 0;

    const tasks = searchResults.map((result) =>
      limit(async () => {
        let email = '';
        let phone = '';
        let name = result.title || 'Contact';
        let company = result.title || '';

        if (result.link && result.link.startsWith('http')) {
          const data = await scrapeWebsite(result.link);
          email = data.email || '';
          phone = data.phone || '';
          name = data.name || result.title || 'Contact';
          company = data.company || result.title || '';
        }

        if (email) {
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

    const unique = [];
    const seen = new Set();
    for (const l of leads) {
      const key = l.email.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(l); }
    }

    const saved = unique.length > 0 ? await Lead.insertMany(unique) : [];
    console.log(`💾 Saved ${saved.length} leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
