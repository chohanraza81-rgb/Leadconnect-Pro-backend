const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/scraperApiService'); // Using ScraperAPI + fallback
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(2) : pLimit(2);

// TEMPORARY TEST ROUTE – remove after debugging
router.get('/test-scraper', async (req, res) => {
  const query = req.query.query || 'Digital Marketing companies in US contact email';
  const results = await searchCompanies('Digital Marketing', 'US', 'CEO');
  res.json({ count: results.length, firstFew: results.slice(0, 3) });
});

// Main POST route
router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  if (!niche || !country) {
    return res.status(400).json({ error: 'Niche and country required' });
  }

  console.log(`🔍 Finder (ScraperAPI+fallback): ${niche} in ${country} (${jobTitle || 'any'})`);

  try {
    const searchResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 Search returned ${searchResults.length} results`);

    const leads = [];
    let scraped = 0;
    let skipped = 0;

    const tasks = searchResults.map((result) =>
      limit(async () => {
        let email = '';
        let phone = '';
        let name = result.title || 'Contact';
        let company = result.title || '';

        // If result has a link, scrape website for email/phone
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
        } else {
          skipped++;
        }
      })
    );

    await Promise.all(tasks);

    // Deduplicate by email
    const uniqueLeads = [];
    const seen = new Set();
    for (const l of leads) {
      const key = l.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLeads.push(l);
      }
    }

    const saved = uniqueLeads.length > 0 ? await Lead.insertMany(uniqueLeads) : [];
    console.log(`💾 Saved ${saved.length} leads (scraped: ${scraped}, skipped: ${skipped})`);

    res.json({
      leads: saved,
      total: saved.length,
      stats: { found: searchResults.length, scraped, skipped, saved: saved.length }
    });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
