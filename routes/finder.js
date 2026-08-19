const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/serpapi');
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🔍 Finder: ${niche} in ${country} (${jobTitle || 'any'})`);

  try {
    const serpResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 SerpApi returned ${serpResults.length} results`);

    const leads = [];
    let scraped = 0, skipped = 0, errors = 0;

    const tasks = serpResults.map((result) =>
      limit(async () => {
        try {
          const domain = new URL(result.link).hostname.replace('www.', '');
          const website = `https://${domain}`;
          const data = await scrapeWebsite(website);
          if (data.email) {
            scraped++;
            leads.push({
              name: data.name || result.title?.split(/[|\-–]/)[0]?.trim() || 'Contact',
              company: data.company || result.title?.split(/[|\-–]/)[0]?.trim() || domain,
              email: data.email,
              phone: data.phone || '',
              country: normalizeCountryCode(country) || country?.toUpperCase() || '',
              niche,
              status: 'new',
            });
          } else {
            skipped++;
          }
        } catch (e) {
          errors++;
        }
      })
    );

    await Promise.all(tasks);

    // Deduplicate by email
    const uniqueLeads = [];
    const seen = new Set();
    for (const lead of leads) {
      const key = lead.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLeads.push(lead);
      }
    }

    const saved = uniqueLeads.length > 0 ? await Lead.insertMany(uniqueLeads) : [];
    console.log(`💾 Saved ${saved.length} leads`);

    res.json({
      leads: saved,
      stats: { total: serpResults.length, scraped, skipped, errors, saved: saved.length }
    });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
