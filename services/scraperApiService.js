const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- SerpApi Google Search (Primary for Consumer) ----------
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

// ---------- SerpApi Maps (Business Fallback) ----------
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
  const mapsResults = await searchBusinessWithMaps(niche, country, jobTitle);
  if (mapsResults.length > 0) return mapsResults;

  // Fallback to SerpApi Google Search
  return searchGoogleWithSerpApi(`${niche} companies in ${country} ${jobTitle || ''} contact email`, 6);
}

// ---------- CONSUMER SEARCH – Buyer Intent (SerpApi only) ----------
async function searchBuyerIntent(niche, country) {
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
  // Run in small batches to avoid rate limit
  for (let i = 0; i < queries.length; i += 3) {
    const batch = queries.slice(i, i + 3);
    const results = await Promise.all(batch.map(q => searchGoogleWithSerpApi(q, 4)));
    all = all.concat(results.flat());
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
