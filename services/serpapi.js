const axios = require('axios');
const { getConfig } = require('./config');

async function searchCompanies(niche, country, jobTitle) {
  const apiKey = getConfig().serpApiKey;
  
  const countryMap = {
    'US': 'United States', 'USA': 'United States',
    'UK': 'United Kingdom', 'GB': 'United Kingdom',
    'CA': 'Canada', 'AU': 'Australia',
    'DE': 'Germany', 'SG': 'Singapore',
    'SA': 'Saudi Arabia', 'KSA': 'Saudi Arabia',
    'AE': 'UAE', 'UAE': 'UAE', 'Dubai': 'UAE',
    'PK': 'Pakistan', 'IN': 'India',
    'TR': 'Turkey', 'MY': 'Malaysia',
  };
  
  const countryName = countryMap[country?.toUpperCase()] || country;
  
  const queries = [
    `top ${niche} companies in ${countryName} 2024 contact`,
    `${niche} ${countryName} business email phone directory`,
    `best ${niche} agencies ${countryName} contact details`,
  ];
  
  let allResults = [];
  
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: apiKey,
          engine: 'google',
          num: 20,
          hl: 'en',
          gl: country?.toLowerCase() || 'us',
        },
      });
      
      const results = response.data.organic_results || [];
      allResults = allResults.concat(
        results
          .filter(r => {
            const link = (r.link || '').toLowerCase();
            return link && 
              !link.includes('youtube.com') && 
              !link.includes('facebook.com') &&
              !link.includes('instagram.com') &&
              !link.includes('linkedin.com') &&
              !link.includes('twitter.com') &&
              !link.includes('pinterest.com') &&
              !link.includes('reddit.com');
          })
          .map(r => ({
            title: r.title || '',
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
  const unique = allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname.replace('www.', '').toLowerCase();
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch {
      return false;
    }
  });
  
  console.log(`SerpApi found ${unique.length} unique domains`);
  return unique;
}

module.exports = { searchCompanies };
