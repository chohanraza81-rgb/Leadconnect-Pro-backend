const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/serpapi');
const { scrapeWebsite } = require('../services/emailScraper');
const pLimit = require('p-limit');

const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  
  console.log(`🔍 Finder: ${niche} in ${country} (${jobTitle})`);
  
  try {
    const serpResults = await searchCompanies(niche, country, jobTitle);
    console.log(`📊 SerpApi returned ${serpResults.length} results`);
    
    const leads = [];
    let scraped = 0;
    let skipped = 0;
    let errors = 0;

    const tasks = serpResults.map((result, index) =>
      limit(async () => {
        try {
          const domain = new URL(result.link).hostname.replace('www.', '');
          console.log(`  [${index + 1}/${serpResults.length}] Scraping: ${domain}`);
          
          const website = `https://${domain}`;
          const data = await scrapeWebsite(website);
          
          if (data.email) {
            scraped++;
            console.log(`  ✅ ${domain}: ${data.email}`);
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
            console.log(`  ⏭️ ${domain}: no email found`);
          }
        } catch (e) {
          errors++;
          console.log(`  ❌ Error: ${e.message}`);
        }
      })
    );

    await Promise.all(tasks);
    
    // Deduplicate by email
    const uniqueLeads = [];
    const seenEmails = new Set();
    for (const lead of leads) {
      const key = lead.email.toLowerCase();
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        uniqueLeads.push(lead);
      }
    }
    
    const saved = uniqueLeads.length > 0 ? await Lead.insertMany(uniqueLeads) : [];
    
    console.log(`💾 Saved ${saved.length} leads`);
    
    res.json({
      leads: saved,
      stats: {
        total: serpResults.length,
        scraped,
        skipped,
        errors,
        saved: saved.length,
      }
    });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
