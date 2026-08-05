const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/serpapi');
const { scrapeWebsite } = require('../services/emailScraper');
const pLimit = require('p-limit');

const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

function cleanCompany(name) {
  if (!name) return '';
  // Remove common garbage
  return name
    .replace(/Checking your browser/i, '')
    .replace(/\|.*$/, '')
    .replace(/\-.*$/, '')
    .replace(/Home\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  
  try {
    const serpResults = await searchCompanies(niche, country, jobTitle);
    const leads = [];
    let scraped = 0, skipped = 0;

    const tasks = serpResults.map(result =>
      limit(async () => {
        try {
          const domain = new URL(result.link).hostname.replace('www.', '');
          const data = await scrapeWebsite(`https://${domain}`);
          
          if (data.email) {
            scraped++;
            const serpCompany = result.title?.split(/[|\-–]/)[0]?.trim() || '';
            leads.push({
              name: data.name || 'Decision Maker',
              company: cleanCompany(data.company || serpCompany || domain),
              email: data.email,
              phone: data.phone || '',
              country: country?.toUpperCase() || '',
              niche,
              status: 'new',
            });
          } else {
            skipped++;
          }
        } catch {}
      })
    );

    await Promise.all(tasks);
    
    // Deduplicate
    const seen = new Set();
    const unique = leads.filter(l => {
      const key = l.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    const saved = await Lead.insertMany(unique);
    
    res.json({
      leads: saved,
      stats: { total: serpResults.length, scraped, skipped, saved: saved.length }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
