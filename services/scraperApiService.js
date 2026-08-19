const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- ScraperAPI Google Search ----------
async function searchGoogleWithScraper(query, num = 5) {
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

// ---------- SerpApi Google Search Fallback ----------
async function searchGoogleWithSerpApi(query, num = 5) {
  const serpKey = getConfig().serpApiKey;
  if (!serpKey) return [];

  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: { engine: 'google', q: query, api_key: serpKey, num, hl: 'en' },
      timeout: 15000,
    });
    const organic = response.data?.organic_results || [];
    return organic.filter(r => r.link).map(r => ({
      title: r.title || '',
      link: r.link,
      snippet: r.snippet || '',
    })).slice(0, num);
  } catch (e) {
    return [];
  }
}

// ---------- BUSINESS SEARCH (Maps + ScraperAPI) ----------
async function searchCompanies(niche, country, jobTitle) {
  // Not used in consumer mode, keep as before (we don't modify)
  const serpKey = getConfig().serpApiKey;
  let mapsResults = [];
  if (serpKey) {
    try {
      const query = `${niche} in ${country} ${jobTitle || ''}`;
      const resp = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google_maps', q: query, api_key: serpKey, hl: 'en' },
        timeout: 10000,
      });
      mapsResults = (resp.data?.local_results || []).filter(r => r.title).map(r => ({
        title: r.title,
        link: r.website || r.links?.website || '',
        snippet: r.address || '',
        phone: r.phone || '',
        address: r.address || '',
        rating: r.rating || '',
        reviews: r.reviews || '',
        type: r.type || '',
      }));
    } catch (e) {}
  }
  const scraperResults = await searchGoogleWithScraper(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 6);
  const results = mapsResults.length > 0 ? mapsResults : scraperResults;
  const seen = new Set();
  return results.filter(r => {
    const key = r.link || r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- 🛒 CONSUMER SEARCH – Buyer Focus (platform-specific) ----------
async function searchBuyerIntent(niche, country) {
  // Queries are now platform-specific and use strict buyer language
  const queries = [
    `site:reddit.com "looking for" ${niche} ${country}`,
    `site:reddit.com "where can I buy" ${niche} ${country}`,
    `site:facebook.com/groups "want to buy" ${niche} ${country}`,
    `site:quora.com "recommend" ${niche} ${country}`,
    `site:olx.com "wanted" ${niche} ${country}`,
    `site:craigslist.org "wanted" ${niche} ${country}`,
    `"looking to buy" ${niche} ${country} contact`,
    `"need recommendations for" ${niche} ${country}`,
    `"can anyone suggest" ${niche} ${country}`,
    `"help me find" ${niche} ${country}`,
  ];

  let all = [];
  // Run in small batches to avoid rate limit (3 at a time)
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const results = await Promise.all(batch.map(q => searchGoogleWithScraper(q, 4)));
    all = all.concat(results.flat());
  }

  // If ScraperAPI fails (0 results), try SerpApi Google
  if (all.length === 0) {
    for (const q of queries) {
      const res = await searchGoogleWithSerpApi(q, 4);
      all = all.concat(res);
    }
  }

  // Deduplicate by domain
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
