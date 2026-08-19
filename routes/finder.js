const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/scraperApiService');
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(2) : pLimit(2);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🔍 Finder: ${niche} in ${country}`);

  try {
    const searchResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 Search returned ${searchResults.length} results`);

    const leads = [];
    let savedCount = 0;

    const tasks = searchResults.map((result) =>
      limit(async () => {
        let email = '';
        let phone = result.phone || '';
        let name = result.title || 'Contact';
        let company = result.title || '';
        let address = result.address || result.snippet || '';

        // If website exists, try to scrape for email
        if (result.link && result.link.startsWith('http')) {
          const data = await scrapeWebsite(result.link);
          email = data.email || '';
          if (!phone) phone = data.phone || '';
          name = data.name || result.title || 'Contact';
          company = data.company || result.title || '';
        }

        // Save lead if email OR phone exists (like Local Insights)
        if (email || phone) {
          savedCount++;
          leads.push({
            name,
            company,
            email,
            phone,
            address,
            country: normalizeCountryCode(country) || country?.toUpperCase() || '',
            niche,
            rating: result.rating || '',
            reviews: result.reviews || '',
            type: result.type || '',
            status: 'new',
          });
        }
      })
    );

    await Promise.all(tasks);

    // Deduplicate by email (or phone if no email)
    const unique = [];
    const seen = new Set();
    for (const l of leads) {
      const key = l.email ? l.email.toLowerCase() : l.phone;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(l);
      }
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
