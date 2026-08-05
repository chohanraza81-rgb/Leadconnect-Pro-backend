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
    'AE': 'UAE', 'UAE': 'UAE',
    'PK': 'Pakistan', 'IN': 'India',
    'TR': 'Turkey', 'MY': 'Malaysia',
  };
  
  const countryName = countryMap[country?.toUpperCase()] || country || 'United States';
  
  // Only use simple, clean queries that work
  const queries = [
    `${niche} companies in ${countryName} contact email`,
    `best ${niche} ${countryName} email address`,
  ];
  
  let allResults = [];
  
  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google',
          q: query,
          api_key: apiKey,
          num: 20,
          hl: 'en',
          gl: (country?.toLowerCase() === 'us' ? 'us' : 'us'),
        },
        timeout: 15000,
      });
      
      const results = response.data?.organic_results || [];
      
      for (const r of results) {
        if (!r.link) continue;
        const link = r.link.toLowerCase();
        // Skip social media and known non-business sites
        if (link.includes('youtube.com') || 
            link.includes('facebook.com') ||
            link.includes('instagram.com') ||
            link.includes('linkedin.com') ||
            link.includes('twitter.com') ||
            link.includes('pinterest.com') ||
            link.includes('reddit.com') ||
            link.includes('wikipedia.org') ||
            link.includes('clutch.co') ||
            link.includes('goodfirms.co') ||
            link.includes('trustpilot.com')) continue;
        
        allResults.push({
          title: r.title || '',
          link: r.link,
          snippet: r.snippet || '',
        });
      }
    } catch (e) {
      const status = e.response?.status;
      console.log(`SerpApi query "${query}" failed with ${status}`);
      // Continue to next query
    }
  }
  
  // Remove duplicates
  const seen = new Set();
  const unique = [];
  
  for (const r of allResults) {
    try {
      const domain = new URL(r.link).hostname.replace('www.', '').toLowerCase();
      if (!seen.has(domain)) {
        seen.add(domain);
        unique.push(r);
      }
    } catch {
      // skip bad URLs
    }
  }
  
  console.log(`SerpApi found ${unique.length} unique domains`);
  return unique;
}

module.exports = { searchCompanies };
