const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- ScraperAPI Google Search with Freshness Filter ----------
async function searchGoogleWithScraper(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) return [];

  // Add tbs=qdr:m for results from past 6 months (freshness)
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en&tbs=qdr:m`;

  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 20000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    // Parse Google results – handles current HTML structure
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
    console.error('ScraperAPI error:', e.message);
    return [];
  }
}

// ---------- SerpApi Maps Fallback (Business Mode) ----------
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

// ---------- MAIN BUSINESS SEARCH ----------
async function searchCompanies(niche, country, jobTitle) {
  const [mapsResults, scraperResults] = await Promise.all([
    searchBusinessWithMaps(niche, country, jobTitle),
    searchGoogleWithScraper(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 8),
  ]);
  const combined = [...mapsResults, ...scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link))];
  const seen = new Set();
  return combined.filter(r => {
    const key = r.link || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- 🍓 CONSUMER SEARCH – Fresh Buyer Intent ----------
async function searchBuyerIntent(niche, country) {
  const queries = [
    `"wanted" ${niche} ${country} contact`,
    `"looking to buy" ${niche} ${country} contact`,
    `"need ${niche}" ${country} "contact me"`,
    `"want to buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country} forum`,
    `"looking for ${niche}" ${country} contact`,
    `site:facebook.com "want to buy" ${niche} ${country}`,
    `site:reddit.com "looking for" ${niche} ${country}`,
    `site:quora.com "recommend" ${niche} ${country}`,
    `site:olx.com "wanted" ${niche} ${country}`,
    `site:craigslist.org "wanted" ${niche} ${country}`,
  ];

  let all = [];
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(q => searchGoogleWithScraper(q, 5)));
    all = all.concat(batchResults.flat());
  }

  const seen = new Set();
  return all.filter(r => {
    try {
      const domain = new URL(r.link).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });
}

module.exports = { searchCompanies, searchBuyerIntent };
