const axios = require('axios');
const cheerio = require('cheerio');
const { getConfig } = require('./config');

async function searchGoogleMaps(niche, location) {
  const apiKey = getConfig().serpApiKey;
  const query = `${niche} in ${location}`;
  
  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google_maps',
        q: query,
        api_key: apiKey,
        hl: 'en',
        type: 'search',
      },
      timeout: 15000,
    });

    const results = response.data?.local_results || [];
    if (results.length === 0) {
      console.log(`⚠️ Google Maps returned 0 results for "${query}"`);
    }
    
    return results.map(r => ({
      title: r.title || '',
      address: r.address || '',
      phone: r.phone || '',
      website: r.website || '',
      rating: r.rating || '',
      reviews: r.reviews || '',
      type: r.type || '',
      gps_coordinates: r.gps_coordinates || {},
    }));
  } catch (e) {
    console.error('Google Maps error:', e.response?.status, e.message);
    return [];
  }
}

async function scrapeMapWebsite(url) {
  if (!url) return { email: '', additionalEmails: [] };
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(data);
    $('script, style, noscript, iframe, nav, footer, header').remove();

    const bodyText = $('body').text();
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = [...new Set(bodyText.match(emailRegex) || [])]
      .filter(e => !e.includes('example.com') && !e.includes('sentry.io'))
      .filter(e => !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e));

    $('a[href^="mailto:"]').each((_, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (!emails.includes(mail) && !mail.includes('example.com')) emails.push(mail);
    });

    return { email: emails[0] || '', additionalEmails: [...new Set(emails)].slice(0, 3) };
  } catch {
    return { email: '', additionalEmails: [] };
  }
}

module.exports = { searchGoogleMaps, scrapeMapWebsite };
