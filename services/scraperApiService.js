const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

/**
 * Search Google using ScraperAPI proxy.
 * @param {string} query - Search query
 * @param {number} num - Number of results to fetch
 * @returns {Promise<Array<{title:string, link:string, snippet:string}>>}
 */
async function searchGoogle(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) {
    console.error('ScraperAPI key missing');
    return [];
  }

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;

  try {
    const response = await axios.get('https://api.scraperapi.com/', {
      params: {
        api_key: apiKey,
        url: url,
      },
      timeout: 30000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    // Parse Google search results
    $('div.g, div[data-sokoban-container]').each((_, el) => {
      const titleEl = $(el).find('h3').first();
      const linkEl = $(el).find('a').first();
      const snippetEl = $(el).find('div[data-sncf]').first();

      const title = titleEl.text().trim();
      let link = linkEl.attr('href') || '';
      // Google redirects start with /url?q=
      if (link.startsWith('/url?q=')) {
        link = decodeURIComponent(link.split('/url?q=')[1].split('&')[0]);
      }
      const snippet = snippetEl.text().trim();

      if (title && link && link.startsWith('http')) {
        results.push({ title, link, snippet });
      }
    });

    console.log(`🔎 ScraperAPI Google search returned ${results.length} results`);
    return results.slice(0, num);
  } catch (err) {
    console.error('ScraperAPI search error:', err.message);
    return [];
  }
}

/**
 * Business lead search – uses Google search via ScraperAPI.
 */
async function searchCompanies(niche, country, jobTitle) {
  const query = `${niche} companies in ${country} ${jobTitle || ''} contact email`;
  const results = await searchGoogle(query, 10);

  // Filter out obvious non-business links
  return results.filter(r =>
    !r.link.includes('youtube.com') &&
    !r.link.includes('facebook.com') &&
    !r.link.includes('instagram.com') &&
    !r.link.includes('linkedin.com') &&
    !r.link.includes('twitter.com') &&
    !r.link.includes('pinterest.com')
  );
}

/**
 * Consumer lead search – buyer intent queries via ScraperAPI.
 */
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

  let allResults = [];
  for (const q of queries) {
    const res = await searchGoogle(q, 5);
    allResults = allResults.concat(res);
  }

  // Deduplicate by domain
  const seen = new Set();
  return allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });
}

module.exports = { searchCompanies, searchBuyerIntent };
