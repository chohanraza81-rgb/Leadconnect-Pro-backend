const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

async function searchGoogle(query, num = 10) {
  const apiKey = getConfig().scraperApiKey;
  if (!apiKey) { console.error('ScraperAPI key missing'); return []; }

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
      if (link.startsWith('/url?q=')) link = decodeURIComponent(link.split('/url?q=')[1].split('&')[0]);
      const snippet = $(el).find('div[data-sncf]').first().text().trim();
      if (title && link && link.startsWith('http')) results.push({ title, link, snippet });
    });
    return results.slice(0, num);
  } catch (e) {
    console.error('ScraperAPI search error:', e.message);
    return [];
  }
}

async function searchCompanies(niche, country, jobTitle) {
  const query = `${niche} companies in ${country} ${jobTitle || ''} contact email`;
  const results = await searchGoogle(query, 10);
  return results.filter(r => !/(youtube|facebook|instagram|linkedin|twitter|pinterest)\.com/i.test(r.link));
}

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
  for (const q of queries) all = all.concat(await searchGoogle(q, 5));
  const seen = new Set();
  return all.filter(r => { try { const d = new URL(r.link).hostname; if (seen.has(d)) return false; seen.add(d); return true; } catch { return false; } });
}

module.exports = { searchCompanies, searchBuyerIntent };
