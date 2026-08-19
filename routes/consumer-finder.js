const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Lead = require('../models/Lead');
const { searchBuyerIntent } = require('../services/scraperApiService');

// ---------- Helpers ----------
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

// ---------- Strong Buyer Phrase ----------
function hasBuyerPhrase(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  const buyerPhrases = [
    'where can i buy', 'looking for', 'looking to buy', 'want to buy',
    'need recommendation', 'recommend me', 'suggest me', 'wanted',
    'anyone know', 'can anyone suggest', 'help me find', 'where to buy',
    'which is best', 'should i buy', 'is it worth buying',
    'looking to purchase', 'interested in buying',
    'need help finding', 'looking for recommendations', 'recommend a',
  ];
  return buyerPhrases.some(phrase => text.includes(phrase));
}

// ---------- Platform / Source Check ----------
function isForumOrQA(link) {
  const domain = new URL(link).hostname.toLowerCase();
  return /reddit\.com|quora\.com|facebook\.com|linkedin\.com|twitter\.com|x\.com|forum|stackexchange|groups\.google|answer|olx|classified|marketplace/.test(domain);
}

function isPersonalEmail(email) {
  return /@(gmail|yahoo|outlook|hotmail|protonmail)\./i.test(email);
}

// ---------- Blacklist (business directories, jobs, etc.) ----------
function isBlacklisted(title, snippet) {
  const combined = `${title} ${snippet}`.toLowerCase();
  const blacklist = [
    'buyers', 'importers', 'exporters', 'suppliers', 'wholesale', 'manufacturer',
    'directory', 'b2b', 'tradekey', 'alibaba', 'indiamart', 'exportersindia',
    'buyers and importers', 'sellers', 'business directory', 'company list',
    'top 10', 'top 100', 'best agencies', 'best companies', 'services in',
    'agency in', 'company in', 'firms', 'solutions', 'technologies',
    'price in pakistan', 'price in india', 'price in uae', 'price in usa',
    'latest price', 'available for calling', 'available now',
    'job', 'hiring', 'executive assistant', 'consulting', 'home page',
    'research company', 'market research company', 'report', 'statistics',
    'course', 'degree', 'program', 'training', 'workshop',
  ];
  return blacklist.some(term => combined.includes(term));
}

// ---------- Freshness ----------
function isOldData(snippet, title) {
  const text = `${title} ${snippet}`;
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    const currentYear = new Date().getFullYear();
    return year < currentYear - 1;
  }
  return false;
}

// ---------- Page Scraper ----------
async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    $('script, style, noscript, nav, footer, header').remove();
    const text = $('body').text();
    return { emails: extractEmails(text), phones: extractPhones(text), fullText: text, title: $('title').text() || '' };
  } catch (e) {
    return { emails: [], phones: [], fullText: '', title: '' };
  }
}

// ---------- Main Route ----------
router.post('/', async (req, res) => {
  const { niche, country, productType = 'consumer' } = req.body;
  if (!niche || !country) return res.status(400).json({ error: 'Niche and country required' });

  console.log(`🛒 Consumer Finder (Strict Buyers): ${niche} in ${country}`);

  try {
    const searchResults = await searchBuyerIntent(niche, country);
    console.log(`📊 Buyer intent search returned ${searchResults.length} results`);

    const leads = [];

    for (const result of searchResults) {
      // 1. Skip business directories / jobs / blacklisted
      if (isBlacklisted(result.title, result.snippet)) {
        console.log(`  ⏭️ Skipping blacklisted: ${result.title}`);
        continue;
      }

      // 2. Skip old data
      if (isOldData(result.snippet, result.title)) {
        console.log(`  ⏳ Skipping old: ${result.title}`);
        continue;
      }

      // 3. MUST have buyer phrase
      if (!hasBuyerPhrase(result.title, result.snippet)) {
        console.log(`  ❌ Not buyer: ${result.title}`);
        continue;
      }

      // Only now scrape the page (saves API)
      const page = await scrapePage(result.link);
      const personalEmail = page.emails.find(isPersonalEmail) || '';
      const phone = page.phones[0] || '';
      const intentScore = calculateIntentScore((result.snippet || '') + ' ' + page.fullText, result.query || '');
      const isForum = isForumOrQA(result.link);

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
        leadScore: intentScore + (isForum ? 40 : 10) + (personalEmail ? 20 : 0) + (phone ? 10 : 0),
        status: 'new',
      });
    }

    leads.sort((a, b) => b.leadScore - a.leadScore);
    const saved = await Lead.insertMany(leads);
    console.log(`💾 Saved ${saved.length} true buyer leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Consumer finder error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
