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
            return; // skip bad URLs
          }
          
          const website = `https://${domain}`;
          const scraped = await scrapeWebsite(website);
          
          if (scraped.email && !scraped.email.includes('example.com')) {
            leads.push({
              name: scraped.name || result.title?.split(' - ')[0]?.trim() || 'Business Contact',
              company: scraped.company || result.title?.split(' - ')[0]?.trim() || domain,
              email: scraped.email,
              phone: scraped.phone || '',
              country: country?.toUpperCase() || '',
              niche,
              status: 'new',
            });
          }
        } catch (e) {
          // skip
        }
      })
    );

    await Promise.all(tasks);
    
    // Deduplicate by email
    const uniqueLeads = [];
    const seenEmails = new Set();
    for (const lead of leads) {
      if (!seenEmails.has(lead.email)) {
        seenEmails.add(lead.email);
        uniqueLeads.push(lead);
      }
    }
    
    const saved = await Lead.insertMany(uniqueLeads);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
