const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchBuyerIntent, scrapePage, calculateIntentScore, extractNameFromEmail } = require('../services/consumerScraper');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, country, productType = 'consumer' } = req.body;

  try {
    const searchResults = await searchBuyerIntent(niche, country);
    const leads = [];

    const tasks = searchResults.map((result) =>
      limit(async () => {
        const page = await scrapePage(result.link);
        const email = page.emails[0] || '';
        const phone = page.phones[0] || '';
        if (!email && !phone) return;

        const name = extractNameFromEmail(email) || result.title?.split(/[|\-–]/)[0]?.trim() || 'Buyer';
        const intentScore = calculateIntentScore(page.fullText, result.query);
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
          searchQuery: result.query,
          intentScore,
          snippet: result.snippet || '',
          leadScore,
          status: 'new',
        });
      })
    );

    await Promise.all(tasks);

    // Sort by score descending
    leads.sort((a, b) => b.leadScore - a.leadScore);

    const saved = await Lead.insertMany(leads);
    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
