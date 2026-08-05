const axios = require('axios');
const { getConfig } = require('./config');

async function searchCompanies(niche, country, jobTitle) {
  const apiKey = getConfig().serpApiKey;
  
  // Search for company directories and business listings
  const queries = [
    `top ${niche} companies in ${country} contact email`,
    `${niche} ${country} ${jobTitle} email phone`,
    `best ${niche} agencies ${country} contact information`,
  ];
  
  let allResults = [];
  
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: apiKey,
          engine: 'google',
          num: 15,
          gl: country?.toLowerCase() || 'us',
          hl: 'en',
        },
      });
      
      const results = response.data.organic_results || [];
      allResults = allResults.concat(
        results
          .filter(r => r.link && !r.link.includes('youtube.com') && !r.link.includes('facebook.com'))
          .map(r => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet || '',
          }))
      );
    } catch (e) {
      console.error('SerpApi error:', e.message);
    }
  }
  
  // Remove duplicates by domain
  const seen = new Set();
  return allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { searchCompanies };
