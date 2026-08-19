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

function isForumOrQA(link) {
  const domain = new URL(link).hostname.toLowerCase();
  return /reddit\.com|quora\.com|facebook\.com|linkedin\.com|twitter\.com|x\.com|forum|stackexchange|groups\.google|answer|olx|classified|marketplace/.test(domain);
}

function isPersonalEmail(email) {
  return /@(gmail|yahoo|outlook|hotmail|protonmail)\./i.test(email);
}

// ✅ NEW: Check if lead is a business directory or trade listing
function isBusinessDirectory(title, snippet) {
  const combined = `${title} ${snippet}`.toLowerCase();
  const blacklist = [
    'buyers', 'importers', 'exporters', 'suppliers', 'wholesale', 'manufacturer',
    'directory', 'b2b', 'tradekey', 'alibaba', 'indiamart', 'exportersindia',
    'buyers and importers', 'sellers', 'business directory', 'company list',
    'top 10', 'top 100', 'best agencies', 'best companies', 'services in',
    'agency in', 'company in', 'firms', 'solutions', 'technologies',
  ];
  return blacklist.some(term => combined.includes(term));
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

  console.log(`🛒 Consumer Finder (No Business Directories): ${niche} in ${country}`);

  try {
    const searchResults = await searchBuyerIntent(niche, country);
    console.log(`📊 Buyer intent search returned ${searchResults.length} results`);

    const leads = [];

    for (const result of searchResults) {
      // ✅ Skip business directories immediately
      if (isBusinessDirectory(result.title, result.snippet)) {
        console.log(`  ⏭️ Skipping business directory: ${result.title}`);
        continue;
      }

      const page = await scrapePage(result.link);
      const personalEmail = page.emails.find(isPersonalEmail) || '';
      const phone = page.phones[0] || '';
      const intentScore = calculateIntentScore((result.snippet || '') + ' ' + page.fullText, result.query || '');
      const sourceQuality = isForumOrQA(result.link) ? 40 : 10;
      const contactScore = (personalEmail ? 20 : 0) + (phone ? 10 : 0);
      const leadScore = intentScore + sourceQuality + contactScore;

      const isForum = isForumOrQA(result.link);
      const passForum = isForum && intentScore >= 20;
      const passEmail = !!personalEmail && intentScore >= 40;
      const passPhone = !!phone && intentScore >= 50;

      if (!passForum && !passEmail && !passPhone) continue;

      leads.push({
        name: result.title?.split(/[|\-–]/)[0]?.trim() || 'Potential Buyer',
        company: result.title || '',
        email: personalEmail,
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

    leads.sort((a, b) => b.leadScore - a.leadScore);
    const saved = await Lead.insertMany(leads);
    console.log(`💾 Saved ${saved.length} pure buyer leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Consumer finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
