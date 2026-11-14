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
    
    // Clean and Validate Data
    return results.map(r => {
      let cleanName = r.title || '';
      // Agar naam "Contact" ya bohat chota hai, to company ka naam use karo
      if (cleanName.toLowerCase() === 'contact' || cleanName.length < 3) {
        cleanName = r.company || r.title || 'Business';
      }

      let cleanPhone = r.phone || '';
      // Phone number validation: Sirf valid phone numbers rakho (kam az kam 10 digits)
      const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        cleanPhone = ''; // Agar fake/lamba number hai to khali kar do
      }

      return {
        title: cleanName,
        company: cleanName,
        address: r.address || '',
        phone: cleanPhone,
        website: r.website || '',
        rating: r.rating || '',
        reviews: r.reviews || '',
        type: r.type || '',
      };
    });
  } catch (e) {
    console.error('Google Maps error:', e.message);
    return [];
  }
}

module.exports = { searchGoogleMaps };
