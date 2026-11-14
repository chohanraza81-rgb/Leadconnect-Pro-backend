const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/scraperApiService');
const { scrapeWebsite } = require('../services/emailScraper');
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

// Helper to normalize string for duplicate check
const normalizeStr = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

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

    // 1. Deduplicate within the current batch
    const uniqueBatch = [];
    const seenBatch = new Set();
    for (const l of leads) {
      const phoneKey = (l.phone || '').replace(/[^0-9+]/g, '');
      const emailKey = (l.email || '').toLowerCase().trim();
      const companyKey = normalizeStr(l.company);
      
      let key = phoneKey ? `p:${phoneKey}` : emailKey ? `e:${emailKey}` : `c:${companyKey}`;
      
      if (!seenBatch.has(key)) {
        seenBatch.add(key);
        uniqueBatch.push(l);
      }
    }

    // 2. Deduplicate against existing database records
    const existingLeads = await Lead.find({}, { phone: 1, email: 1, company: 1 }).lean();
    const existingKeys = new Set();
    existingLeads.forEach(l => {
      if (l.phone) existingKeys.add(`p:${l.phone.replace(/[^0-9+]/g, '')}`);
      if (l.email) existingKeys.add(`e:${l.email.toLowerCase().trim()}`);
      if (l.company) existingKeys.add(`c:${normalizeStr(l.company)}`);
    });

    const newLeads = uniqueBatch.filter(l => {
      const phoneKey = (l.phone || '').replace(/[^0-9+]/g, '');
      const emailKey = (l.email || '').toLowerCase().trim();
      const companyKey = normalizeStr(l.company);

      if (phoneKey && existingKeys.has(`p:${phoneKey}`)) return false;
      if (emailKey && existingKeys.has(`e:${emailKey}`)) return false;
      if (companyKey && existingKeys.has(`c:${companyKey}`)) return false;
      return true;
    });

    const saved = newLeads.length > 0 ? await Lead.insertMany(newLeads) : [];
    console.log(`💾 Saved ${saved.length} new leads (Filtered out ${leads.length - saved.length} duplicates)`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
