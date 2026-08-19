const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchBuyerIntent } = require('../services/scraperApiService');  // CHANGED
const { scrapePage, calculateIntentScore, extractNameFromEmail } = require('../services/consumerScraper');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, country, productType = 'consumer' } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🛒 Consumer Finder (ScraperAPI): ${niche} in ${country}`);

  try {
    const searchResults = await searchBuyerIntent(niche, country);
    console.log(`📊 Buyer intent search returned ${searchResults.length} results`);

    const leads = [];

    const tasks = searchResults.map((result) =>
      limit(async () => {
        const page = await scrapePage(result.link);
        const email = page.emails[0] || '';
        const phone = page.phones[0] || '';
        if (!email && !phone) return;

        const name = extractNameFromEmail(email) || result.title?.split(/[|\-–]/)[0]?.trim() || 'Buyer';
        const intentScore = calculateIntentScore(page.fullText, result.query || result.snippet);
        const isBusinessEmail = /@(gmail|yahoo|outlook|hotmail)\./i.test(email) ? 0 : 5;
        const hasPhone = phone ? 5 : 0;
        const leadScore = intentScore + isBusinessEmail + hasPhone;

        leads.push({
          name,
          company: result.title?.split(/[|\-–]/)[0]?.trim() || '',
          email,
          phone,
          country: country?.toUpperCase() || '',
          niche,
          leadType: productType,
          source: result.link,
          searchQuery: result.query || '',
          intentScore,
          snippet: result.snippet || '',
          leadScore,
          status: 'new',
        });
      })
    );

    await Promise.all(tasks);
    leads.sort((a, b) => b.leadScore - a.leadScore);
    const saved = await Lead.insertMany(leads);
    console.log(`💾 Saved ${saved.length} consumer leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Consumer finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
