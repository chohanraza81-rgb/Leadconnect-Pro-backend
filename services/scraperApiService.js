const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- SCRAPERAPI Google Search (used for Consumer Mode) ----------
async function searchGoogleWithScraper(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) {
    console.log('ScraperAPI key missing');
    return [];
  }

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;
  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 30000,
    });
    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    $('div.g, div[data-sokoban-container]').each((_, el) => {
      const title = $(el).find('h3').first().text().trim();
      let link = $(el).find('a').first().attr('href') || '';
      if (link.startsWith('/url?q=')) {
        link = decodeURIComponent(link.split('/url?q=')[1].split('&')[0]);
      }
      const snippet = $(el).find('div[data-sncf]').first().text().trim();
      if (title && link && link.startsWith('http')) {
        results.push({ title, link, snippet });
      }
    });

    return results.slice(0, num);
  } catch (e) {
    console.error('ScraperAPI error:', e.message);
    return [];
  }
}

// ---------- SerpApi Google Maps (Business Mode) ----------
async function searchBusinessWithMaps(niche, country, jobTitle) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) {
    console.log('SerpApi key missing for Maps');
    return [];
  }

  try {
    const query = `${niche} in ${country} ${jobTitle || ''}`;
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google_maps',
        q: query,
        api_key: serpKey,
        hl: 'en',
      },
      timeout: 15000,
    });

    const localResults = response.data?.local_results || [];
    console.log(`📊 Maps returned ${localResults.length} businesses`);

    return localResults
      .filter(r => r.title)
      .map(r => ({
        title: r.title,
        link: r.website || r.links?.website || '',
        snippet: r.address || '',
        phone: r.phone || '',
        address: r.address || '',
        rating: r.rating || '',
        reviews: r.reviews || '',
        type: r.type || '',
      }));
  } catch (e) {
    console.error('Maps error:', e.message);
    return [];
  }
}

// ---------- MAIN BUSINESS SEARCH (Maps first, ScraperAPI fallback) ----------
async function searchCompanies(niche, country, jobTitle) {
  // Try Maps first (reliable, includes phone)
  const mapsResults = await searchBusinessWithMaps(niche, country, jobTitle);
  if (mapsResults.length > 0) {
    console.log(`✅ Maps returned ${mapsResults.length} businesses`);
    return mapsResults;
  }

  // Fallback to ScraperAPI Google Search
  console.log('⚠️ Maps 0 results, falling back to ScraperAPI');
  const scraperResults = await searchGoogleWithScraper(
    `${niche} companies in ${country} ${jobTitle || ''} contact email`,
    10
  );
  return scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link));
}

// ---------- MAIN CONSUMER SEARCH (ScraperAPI Google Search) ----------
async function searchBuyerIntent(niche, country) {
  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"best ${niche} for" ${country}`,
    `"need ${niche}" ${country}`,
    `"purchase ${niche}" ${country}`,
    `"anyone know where to buy ${niche}" ${country}`,
    `"suggest ${niche} ${country}`,
  ];

  let all = [];
  for (const q of queries) {
    const res = await searchGoogleWithScraper(q, 5);
    all = all.concat(res);
  }

  const seen = new Set();
  return all.filter(r => {
    try {
      const d = new URL(r.link).hostname;
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    } catch { return false; }
  });
}

module.exports = { searchCompanies, searchBuyerIntent };
