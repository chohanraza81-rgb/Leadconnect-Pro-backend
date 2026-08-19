const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ScraperAPI Google Search
async function searchGoogleWithScraper(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) return [];
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;
  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 15000,
    });
    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];
    $('a[href^="/url?q="]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let link = decodeURIComponent(href.split('/url?q=')[1]?.split('&')[0] || '');
      const title = $(el).closest('div').find('h3').first().text().trim() || $(el).text().trim();
      const snippet = $(el).closest('div').find('div[data-sncf]').first().text().trim() || '';
      if (title && link.startsWith('http')) results.push({ title, link, snippet });
    });
    if (results.length === 0) {
      $('h3').each((_, el) => {
        const title = $(el).text().trim();
        const linkEl = $(el).closest('a').attr('href') || '';
        let link = linkEl.startsWith('/url?q=') ? decodeURIComponent(linkEl.split('/url?q=')[1].split('&')[0]) : linkEl;
        if (title && link.startsWith('http')) results.push({ title, link, snippet: '' });
      });
    }
    return results.slice(0, num);
  } catch (e) {
    return [];
  }
}

// SerpApi Google Maps (quantity + local leads with phone/address)
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
  } catch (e) { return []; }
}

// MAIN BUSINESS SEARCH: Maps + ScraperAPI in parallel
async function searchCompanies(niche, country, jobTitle) {
  const [mapsResults, scraperResults] = await Promise.all([
    searchBusinessWithMaps(niche, country, jobTitle),
    searchGoogleWithScraper(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 8),
  ]);
  const combined = [...mapsResults, ...scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link))];
  // Deduplicate by link
  const seen = new Set();
  return combined.filter(r => {
    const key = r.link || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// MAIN CONSUMER SEARCH: Forum + Q&A + Maps (for completeness)
async function searchBuyerIntent(niche, country) {
  const queries = [
    `site:reddit.com "looking for" ${niche} ${country}`,
    `site:quora.com "recommend" ${niche} ${country}`,
    `"need recommendations for" ${niche} ${country}`,
    `"looking to buy" ${niche} ${country}`,
    `"where to buy" ${niche} ${country} forum`,
    `"anyone know" ${niche} ${country}`,
    `"can anyone suggest" ${niche} ${country}`,
  ];

  const [scraperResults, mapsResults] = await Promise.all([
    Promise.all(queries.map(q => searchGoogleWithScraper(q, 5))).then(arr => arr.flat()),
    searchBusinessWithMaps(niche, country, ''),
  ]);

  const all = [...scraperResults, ...mapsResults.map(r => ({ ...r, query: 'maps', snippet: r.snippet || '' }))];
  const seen = new Set();
  return all.filter(r => {
    const domain = new URL(r.link).hostname;
    if (seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

module.exports = { searchCompanies, searchBuyerIntent };
