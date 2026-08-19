const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

/**
 * Extract all valid email addresses from a text string.
 * For consumer mode we intentionally keep personal emails (gmail, yahoo, etc.).
 * Only obvious junk/example/sentry addresses are removed.
 */
function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const blocked = [
    'example.com', 'test.com', 'domain.com', 'sentry.io', 'ingest.',
    'yourdomain', 'localhost', '127.0.0.1', 'email.com', 'mail.com',
  ];

  return [...new Set(
    (text.match(emailRegex) || [])
      .map(e => e.trim())
      .filter(e => !blocked.some(b => e.toLowerCase().includes(b)))
  )];
}

/**
 * Extract phone numbers from a text string.
 * Accepts international and local formats.
 */
function extractPhones(text) {
  if (!text) return [];
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;
  const matches = text.match(phoneRegex) || [];
  return [...new Set(matches)]
    .map(p => p.trim())
    .filter(p => {
      const digits = p.replace(/[^0-9+]/g, '');
      return digits.length >= 10 && digits.length <= 15;
    });
}

/**
 * Calculate a buyer-intent score (0–100) based on the text and search query.
 * Higher score = more likely to be actively looking to buy.
 */
function calculateIntentScore(text, query = '') {
  const combined = ((text || '') + ' ' + (query || '')).toLowerCase();
  const intentKeywords = [
    'buy', 'looking for', 'recommend', 'suggest', 'where to', 'need',
    'purchase', 'price', 'best', 'cheap', 'affordable', 'order',
    'contact me', 'dm me', 'anyone know', 'help me find', 'want to buy',
    'searching for', 'interested in', 'looking to purchase', 'quote',
  ];

  let score = 0;
  for (const kw of intentKeywords) {
    if (combined.includes(kw)) score += 5;
  }

  // Strong urgency signals
  if (combined.includes('urgent') || combined.includes('asap') || combined.includes('immediately')) {
    score += 15;
  }

  return Math.min(score, 100);
}

/**
 * Derive a human-readable name from an email address (e.g., john.doe@... → John Doe).
 */
function extractNameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0];
  const parts = local.split(/[._\-]+/)
    .filter(p => p.length > 1 && !/^\d+$/.test(p));

  if (parts.length >= 2) {
    return parts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }
  return '';
}

/**
 * Scrape a webpage and extract emails, phones, full text, and title.
 * Returns empty arrays if the request fails.
 */
async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const $ = cheerio.load(data);
    $('script, style, noscript, nav, footer, header, iframe').remove();
    const bodyText = $('body').text();

    return {
      emails: extractEmails(bodyText),
      phones: extractPhones(bodyText),
      fullText: bodyText,
      title: $('title').text()?.trim() || '',
    };
  } catch (err) {
    return { emails: [], phones: [], fullText: '', title: '' };
  }
}

/**
 * Perform multiple Google searches to find buyer-intent pages.
 * Returns a deduplicated array of search results with the original query.
 */
async function searchBuyerIntent(niche, country) {
  const apiKey = getConfig().serpApiKey;
  if (!apiKey) {
    console.error('SerpApi key missing');
    return [];
  }

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
    `"want to buy ${niche}" ${countryName}`,
    `"looking for ${niche}" ${countryName} contact`,
  ];

  let allResults = [];

  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google',
          q: query,
          api_key: apiKey,
          num: 5,
          hl: 'en',
        },
        timeout: 15000,
      });

      const organic = response.data?.organic_results || [];
      for (const r of organic) {
        if (r.link) {
          allResults.push({ ...r, query });
        }
      }
    } catch (err) {
      console.log(`Search failed for "${query}": ${err.message}`);
    }
  }

  // Remove duplicates by domain
  const seen = new Set();
  return allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname.replace('www.', '').toLowerCase();
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = {
  searchBuyerIntent,
  scrapePage,
  calculateIntentScore,
  extractNameFromEmail,
  extractEmails,
  extractPhones,
};
