const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/serpapi');
const { scrapeWebsite } = require('../services/emailScraper');
const pLimit = require('p-limit');

const limit = pLimit.default ? pLimit.default(2) : pLimit(2);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  try {
    const serpResults = await searchCompanies(niche, country, jobTitle);
    const leads = [];

    const tasks = serpResults.map(result =>
      limit(async () => {
        try {
          let domain;
          try {
            domain = new URL(result.link).hostname.replace('www.', '');
          } catch {
            domain = result.link;
          }
          const website = `https://${domain}`;
          const { name, email, phone, company } = await scrapeWebsite(website);
          
          // Only add if we found a real email
          if (email && !email.includes('example.com') && !email.includes('sentry.io')) {
            leads.push({
              name: name !== 'Contact' ? name : result.title.split(' - ')[0] || name,
              company: company || result.title.split(' - ')[0] || domain,
              email,
              phone,
              country: country?.toUpperCase(),
              niche,
              status: 'new',
            });
          }
        } catch (e) {
          // Skip failed scrapes
        }
      })
    );

    await Promise.all(tasks);
    const saved = await Lead.insertMany(leads);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
