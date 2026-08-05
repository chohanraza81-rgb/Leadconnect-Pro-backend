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
    let scraped = 0;
    let skipped = 0;

    const tasks = serpResults.map(result =>
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
              country: country?.toUpperCase() || '',
              niche,
              status: 'new',
            });
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      })
    );

    await Promise.all(tasks);
    
    // Deduplicate by email
    const uniqueLeads = [];
    const seenEmails = new Set();
    for (const lead of leads) {
      if (!seenEmails.has(lead.email.toLowerCase())) {
        seenEmails.add(lead.email.toLowerCase());
        uniqueLeads.push(lead);
      }
    }
    
    const saved = uniqueLeads.length > 0 ? await Lead.insertMany(uniqueLeads) : [];
    
    res.json({
      leads: saved,
      stats: { total: serpResults.length, scraped, skipped, saved: saved.length }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
