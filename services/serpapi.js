const axios = require('axios');
const { getConfig } = require('./config');

async function searchCompanies(niche, country, jobTitle) {
  const apiKey = getConfig().serpApiKey;
  // Search for business directories or LinkedIn profiles that can be scraped for company info
  const query = `${niche} companies in ${country} ${jobTitle}`;
  const response = await axios.get('https://serpapi.com/search', {
    params: {
      q: query,
      api_key: apiKey,
      engine: 'google',
      num: 10,
    },
  });
  const results = response.data.organic_results || [];
  return results.map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
  }));
}

module.exports = { searchCompanies };
