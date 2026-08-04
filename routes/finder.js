const router = require('express').Router();
const Lead = require('../models/Lead');
const { searchCompanies } = require('../services/serpapi');
const { scrapeWebsite } = require('../services/emailScraper');
const pLimit = require('p-limit');
const limit = pLimit(3);

router.post('/', async (req, res) => {
  const { niche, country, jobTitle } = req.body;
  try {
    const serpResults = await searchCompanies(niche, country, jobTitle);
    const leads = [];

    const tasks = serpResults.map(result =>
      limit(async () => {
        const domain = new URL(result.link).hostname;
        const website = `https://${domain}`;
        const { name, email, phone } = await scrapeWebsite(website);
        if (email) {
          leads.push({
            name,
            company: result.title.split(' - ')[0] || domain,
            email,
            phone,
            country,
            niche,
          });
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
