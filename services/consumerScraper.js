const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const blocked = ['example.com', 'test.com', 'domain.com', 'sentry.io', 'ingest.'];
  return [...new Set((text.match(emailRegex) || []).filter(e => !blocked.some(b => e.includes(b))))];
}

function extractPhones(text) {
  if (!text) return [];
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
  return [...new Set(text.match(phoneRegex) || [])].filter(p => p.replace(/[^0-9]/g, '').length >= 10);
}

function calculateIntentScore(text, query = '') {
  const combined = ((text || '') + ' ' + (query || '')).toLowerCase();
  const intentKeywords = ['buy', 'looking for', 'recommend', 'suggest', 'where to', 'need', 'purchase', 'price', 'best', 'cheap', 'affordable', 'order', 'contact me', 'dm me', 'anyone know', 'help me find', 'want to buy'];
  let score = 0;
  for (const kw of intentKeywords) if (combined.includes(kw)) score += 5;
  if (combined.includes('urgent') || combined.includes('asap') || combined.includes('immediately')) score += 15;
  return Math.min(score, 100);
}

function extractNameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0];
  const parts = local.split(/[._\-]+/).filter(p => p.length > 1 && !/^\d+$/.test(p));
  if (parts.length >= 2) return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  return '';
}

async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    const $ = cheerio.load(data);
    $('script, style, noscript, nav, footer, header').remove();
    const bodyText = $('body').text();
    return { emails: extractEmails(bodyText), phones: extractPhones(bodyText), fullText: bodyText, title: $('title').text() || '' };
  } catch (e) {
    return { emails: [], phones: [], fullText: '', title: '' };
  }
}

async function searchBuyerIntent(niche, country) {
  const apiKey = getConfig().serpApiKey;
  if (!apiKey) return [];
  const countryName = country?.trim() || 'Pakistan';
  const queries = [
    `"looking to buy" ${niche} ${countryName}`,
    `"where can I buy" ${niche} ${countryName}`,
    `"recommend me" ${niche} ${countryName}`,
    `"best ${niche} for" ${countryName}`,
    `"need ${niche}" ${countryName}`,
    `"purchase ${niche}" ${countryName}`,
    `"anyone know where to buy ${niche}" ${countryName}`,
    `"suggest ${niche} ${countryName}`,
  ];
  let allResults = [];
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google', q: query, api_key: apiKey, num: 5, hl: 'en' },
        timeout: 15000,
      });
      const organic = response.data?.organic_results || [];
      for (const r of organic) if (r.link) allResults.push({ ...r, query });
    } catch (e) {}
  }
  const seen = new Set();
  return allResults.filter(r => {
    try { const d = new URL(r.link).hostname; if (seen.has(d)) return false; seen.add(d); return true; } catch { return false; }
  });
}

module.exports = { searchBuyerIntent, scrapePage, calculateIntentScore, extractNameFromEmail };
