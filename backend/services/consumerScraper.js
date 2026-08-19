const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

function extractEmails(text) {
  const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const blocked = ['example.com', 'test.com', 'sentry.io', 'ingest.', 'gmail.com', 'yahoo.com'];
  return [...new Set((text.match(regex) || []).filter(e => !blocked.some(b => e.includes(b))))];
}

function extractPhones(text) {
  const regex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
  return [...new Set(text.match(regex) || [])].filter(p => p.replace(/[^0-9]/g, '').length >= 10);
}

function calculateIntentScore(text, query) {
  const intentKeywords = [
    'buy', 'looking for', 'recommend', 'suggest', 'where to', 'need', 'purchase',
    'price', 'best', 'cheap', 'affordable', 'order', 'contact me', 'dm me'
  ];
  let score = 0;
  const lower = text.toLowerCase();
  for (const kw of intentKeywords) {
    if (lower.includes(kw)) score += 5;
  }
  if (lower.includes('urgent') || lower.includes('asap')) score += 10;
  return Math.min(score, 100);
}

function extractNameFromEmail(email) {
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/).filter(p => p.length > 1 && !/\d/.test(p));
  if (parts.length >= 2) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  return '';
}

async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(data);
    $('script, style, nav, footer, header').remove();
    const text = $('body').text();
    return {
      emails: extractEmails(text),
      phones: extractPhones(text),
      fullText: text,
      title: $('title').text() || '',
    };
  } catch (e) {
    return { emails: [], phones: [], fullText: '', title: '' };
  }
}

async function searchBuyerIntent(niche, country) {
  const apiKey = getConfig().serpApiKey;
  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"best ${niche} for" ${country}`,
    `"need ${niche}" ${country}`,
    `"purchase ${niche}" ${country}`,
    `"anyone know where to buy ${niche}" ${country}`,
    `"suggest ${niche} ${country}"`,
  ];

  let results = [];
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: apiKey,
          engine: 'google',
          num: 5,
          hl: 'en',
        },
      });
      const organic = response.data.organic_results || [];
      for (const r of organic) {
        results.push({ ...r, query });
      }
    } catch (e) {
      console.log('Search failed:', query);
    }
  }

  // Deduplicate by link
  const seen = new Set();
  return results.filter(r => {
    try { const d = new URL(r.link).hostname; if (seen.has(d)) return false; seen.add(d); return true; } catch { return false; }
  });
}

module.exports = { searchBuyerIntent, scrapePage, calculateIntentScore, extractNameFromEmail };
