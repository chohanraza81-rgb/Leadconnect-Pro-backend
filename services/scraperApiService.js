const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- SCRAPERAPI Google Search ----------
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

// ---------- FALLBACK: SerpApi Google Maps (Business) ----------
async function searchBusinessWithMaps(niche, country, jobTitle) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) {
    console.log('SerpApi key missing for fallback');
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
    console.log(`📊 SerpApi Maps fallback returned ${localResults.length} businesses`);
    return localResults
      .filter(r => r.title)
      .map(r => ({
        title: r.title,
        link: r.website || r.links?.website || '',
        snippet: r.address || '',
      }));
  } catch (e) {
    console.error('SerpApi Maps fallback error:', e.message);
    return [];
  }
}

// ---------- FALLBACK: SerpApi Google Search (Consumer) ----------
async function searchConsumerWithSerpApi(niche, country) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) return [];

  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"best ${niche} for" ${country}`,
  ];
  let all = [];
  for (const q of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google', q, api_key: serpKey, num: 3, hl: 'en' },
        timeout: 15000,
      });
      const organic = response.data?.organic_results || [];
      organic.forEach(r => { if (r.link) all.push({ title: r.title || '', link: r.link, snippet: r.snippet || '' }); });
    } catch (e) {}
  }
  return all;
}

// ---------- MAIN BUSINESS SEARCH (ScraperAPI → Maps fallback) ----------
async function searchCompanies(niche, country, jobTitle) {
  const scraperResults = await searchGoogleWithScraper(
    `${niche} companies in ${country} ${jobTitle || ''} contact email`,
    10
  );
  if (scraperResults.length > 0) {
    console.log(`✅ ScraperAPI returned ${scraperResults.length} results`);
    return scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link));
  }

  console.log('⚠️ ScraperAPI 0 results, falling back to SerpApi Maps');
  const mapsResults = await searchBusinessWithMaps(niche, country, jobTitle);
  return mapsResults;
}

// ---------- MAIN CONSUMER SEARCH (ScraperAPI → SerpApi Google fallback) ----------
async function searchBuyerIntent(niche, country) {
  let all = [];
  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"best ${niche} for" ${country}`,
    `"need ${niche}" ${country}`,
    `"purchase ${niche}" ${country}`,
  ];

  for (const q of queries) {
    const res = await searchGoogleWithScraper(q, 3);
    all = all.concat(res);
  }

  if (all.length === 0) {
    console.log('⚠️ ScraperAPI consumer search 0 results, falling back to SerpApi Google');
    all = await searchConsumerWithSerpApi(niche, country);
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
