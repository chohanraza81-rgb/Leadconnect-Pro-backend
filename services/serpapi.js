const axios = require('axios');
const { getConfig } = require('./config');

async function searchCompanies(niche, country, jobTitle) {
  const apiKey = getConfig().serpApiKey;
  const countryName = country || 'United States';
  const queries = [
    `${niche} companies in ${countryName} contact email`,
    `top ${niche} ${countryName} email address`,
    `${niche} ${countryName} business directory contact`,
  ];

  let allResults = [];
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google', q: query, api_key: apiKey, num: 10, hl: 'en' },
        timeout: 15000,
      });
      const organic = response.data?.organic_results || [];
      organic.forEach(r => { if (r.link) allResults.push({ title: r.title || '', link: r.link, snippet: r.snippet || '' }); });
    } catch (e) {
      console.log(`Search failed for "${query}": ${e.message}`);
    }
  }

  // Deduplicate by domain
  const seen = new Set();
  return allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname.replace('www.', '').toLowerCase();
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });
}

module.exports = { searchCompanies };
