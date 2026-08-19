const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

// ---------- ScraperAPI Google Search with NEW PARSER ----------
async function searchGoogleWithScraper(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) {
    console.error('ScraperAPI key missing');
    return [];
  }

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;

  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: { api_key: apiKey, url },
      timeout: 20000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    // NEW: Find all Google redirect links (works with current HTML)
    $('a[href^="/url?q="]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let link = decodeURIComponent(href.split('/url?q=')[1]?.split('&')[0] || '');

      // Title: nearest h3 or anchor text
      const title =
        $(el).closest('div').find('h3').first().text().trim() ||
        $(el).text().trim();

      // Snippet: search nearby block
      const snippet =
        $(el).closest('div').find('div[data-sncf]').first().text().trim() ||
        $(el).closest('div').text().trim().substring(0, 200);

      if (title && link.startsWith('http')) {
        results.push({ title, link, snippet });
      }
    });

    // Fallback: if no redirect links, try <h3> parents
    if (results.length === 0) {
      $('h3').each((_, el) => {
        const title = $(el).text().trim();
        const linkEl = $(el).closest('a').attr('href') || '';
        let link = '';
        if (linkEl.startsWith('/url?q=')) {
          link = decodeURIComponent(linkEl.split('/url?q=')[1]?.split('&')[0] || '');
        } else if (linkEl.startsWith('http')) {
          link = linkEl;
        }
        if (title && link) results.push({ title, link, snippet: '' });
      });
    }

    console.log(`🔎 Parser found ${results.length} results`);
    return results.slice(0, num);
  } catch (e) {
    console.error('ScraperAPI error:', e.message);
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
  } catch (e) {
    return [];
  }
}

// ---------- MAIN BUSINESS SEARCH ----------
async function searchCompanies(niche, country, jobTitle) {
  const mapsResults = await searchBusinessWithMaps(niche, country, jobTitle);
  if (mapsResults.length > 0) return mapsResults;

  const scraperResults = await searchGoogleWithScraper(
    `${niche} companies in ${country} ${jobTitle || ''} contact email`,
    10
  );
  return scraperResults.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link));
}

// ---------- MAIN CONSUMER SEARCH ----------
async function searchBuyerIntent(niche, country) {
  const queries = [
    `"looking to buy" ${niche} ${country}`,
    `"where can I buy" ${niche} ${country}`,
    `"recommend me" ${niche} ${country}`,
    `"best ${niche} for" ${country}`,
    `"need ${niche}" ${country}`,
  ];

  // Run in parallel for speed
  const resultArrays = await Promise.all(queries.map(q => searchGoogleWithScraper(q, 5)));
  let all = resultArrays.flat();

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
