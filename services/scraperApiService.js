const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- ScraperAPI Google Search ----------
async function searchGoogleWithScraper(query, num = 8) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) return [];

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;

  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 15000,
    });

    if (response.status === 403) {
      console.warn('ScraperAPI 403, falling back to SerpApi');
      return [];
    }

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
    console.error('ScraperAPI error:', e.message);
    return [];
  }
}

// ---------- SerpApi Google Search (Fallback) ----------
async function searchGoogleWithSerpApi(query, num = 8) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) return [];

  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google',
        q: query,
        api_key: serpKey,
        num: num,
        hl: 'en',
      },
      timeout: 15000,
    });
    const organic = response.data?.organic_results || [];
    return organic
      .filter(r => r.link)
      .map(r => ({
        title: r.title || '',
        link: r.link,
        snippet: r.snippet || '',
      }))
      .slice(0, num);
  } catch (e) {
    console.error('SerpApi Google error:', e.message);
    return [];
  }
}

// ---------- SerpApi Maps Fallback (Business) ----------
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
    searchGoogleWithScraper(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 6),
  ]);

  let results = scraperResults;
  if (results.length === 0) {
    // Fallback to SerpApi Google Search
    results = await searchGoogleWithSerpApi(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 6);
  }

  const combined = [...mapsResults, ...results.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link))];
  const seen = new Set();
  return combined.filter(r => {
    const key = r.link || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- CONSUMER SEARCH – Buyer Intent with Fallback ----------
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

  // Try ScraperAPI first
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(q => searchGoogleWithScraper(q, 4)));
    all = all.concat(batchResults.flat());
  }

  // If ScraperAPI returned nothing (403/0), use SerpApi Google Search
  if (all.length === 0) {
    console.log('ScraperAPI returned 0 results, using SerpApi Google fallback');
    for (const q of queries) {
      const res = await searchGoogleWithSerpApi(q, 4);
      all = all.concat(res);
    }
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
