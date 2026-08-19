const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ScraperAPI Google Search with shorter timeout
async function searchGoogleWithScraper(query, num = 5) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) {
    console.log('ScraperAPI key missing');
    return [];
  }

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;
  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 10000, // 10 seconds max
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

// SerpApi Google Maps for Business Fallback
async function searchBusinessWithMaps(niche, country, jobTitle) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) return [];

  try {
    const query = `${niche} in ${country} ${jobTitle || ''}`;
    const response = await axios.get('https://serpapi.com/search', {
      params: { engine: 'google_maps', q: query, api_key: serpKey, hl: 'en' },
      timeout: 10000,
    });
    const localResults = response.data?.local_results || [];
    return localResults.filter(r => r.title).map(r => ({
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

// MAIN BUSINESS SEARCH: Maps first, then ScraperAPI
async function searchCompanies(niche, country, jobTitle) {
  const mapsResults = await searchBusinessWithMaps(niche, country, jobTitle);
  if (mapsResults.length > 0) return mapsResults;

  const scraperResults = await searchGoogleWithScraper(
    `${niche} companies in ${country} ${jobTitle || ''} contact email`,
    5
  );
  return scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link));
}

// MAIN CONSUMER SEARCH: Only 3 queries, run in parallel
async function searchBuyerIntent(niche, country) {
  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
  ];

  // Run all queries in parallel
  const resultsArrays = await Promise.all(queries.map(q => searchGoogleWithScraper(q, 5)));
  let all = resultsArrays.flat();

  // Deduplicate by domain
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
