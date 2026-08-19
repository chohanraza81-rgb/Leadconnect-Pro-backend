const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Lead = require('../models/Lead');
const { searchBuyerIntent } = require('../services/scraperApiService');

function extractEmails(text) {
  const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return [...new Set(text.match(regex) || [])];
}

function extractPhones(text) {
  const regex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
  return [...new Set(text.match(regex) || [])].filter(p => p.replace(/[^0-9]/g, '').length >= 10);
}

function calculateIntentScore(text, query = '') {
  const combined = ((text || '') + ' ' + (query || '')).toLowerCase();
  const intentKeywords = [
    'buy', 'looking for', 'recommend', 'suggest', 'where to', 'need',
    'purchase', 'price', 'best', 'cheap', 'affordable', 'order',
    'contact me', 'dm me', 'anyone know', 'help me find', 'want to buy',
    'urgent', 'asap', 'immediately'
  ];
  let score = 0;
  for (const kw of intentKeywords) if (combined.includes(kw)) score += 5;
  if (combined.includes('urgent') || combined.includes('asap') || combined.includes('immediately')) score += 15;
  return Math.min(score, 100);
}

function getSourceQuality(link) {
  const domain = new URL(link).hostname.toLowerCase();
  // High quality sources = forums, Q&A, social platforms
  if (/reddit\.com|quora\.com|facebook\.com|forum|stackexchange|answer|groups\.google/.test(domain)) return 40;
  if (/linkedin\.com|twitter\.com|x\.com|instagram\.com/.test(domain)) return 25;
  // Blogs/articles are lower quality unless they have contact info
  return 10;
}

async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    $('script, style, noscript, nav, footer, header').remove();
    const text = $('body').text();
    return { emails: extractEmails(text), phones: extractPhones(text), fullText: text, title: $('title').text() || '' };
  } catch (e) { return { emails: [], phones: [], fullText: '', title: '' }; }
}

router.post('/', async (req, res) => {
  const { niche, country, productType = 'consumer' } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🛒 Consumer Finder (Quality Mode): ${niche} in ${country}`);

  try {
    const searchResults = await searchBuyerIntent(niche, country);
    console.log(`📊 Buyer intent search returned ${searchResults.length} results`);

    const leads = [];

    for (const result of searchResults) {
      const page = await scrapePage(result.link);
      const email = page.emails[0] || '';
      const phone = page.phones[0] || '';

      // Calculate scores
      const intentScore = calculateIntentScore((result.snippet || '') + ' ' + page.fullText, result.query || '');
      const sourceQuality = getSourceQuality(result.link);
      const contactScore = (email ? 20 : 0) + (phone ? 15 : 0);
      const leadScore = intentScore + sourceQuality + contactScore;

      // ✅ SAVE ONLY QUALITY LEADS:
      // Score ≥ 35 (forum + intent) OR has email/phone (even if article)
      if (leadScore < 35 && !email && !phone) continue;

      leads.push({
        name: result.title?.split(/[|\-–]/)[0]?.trim() || 'Potential Buyer',
        company: result.title || '',
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
    }

    // Sort by score (highest first)
    leads.sort((a, b) => b.leadScore - a.leadScore);

    const saved = await Lead.insertMany(leads);
    console.log(`💾 Saved ${saved.length} quality consumer leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Consumer finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
