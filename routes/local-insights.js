const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchGoogleMaps, scrapeMapWebsite } = require('../services/googleMapsScraper');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, location } = req.body;
  
  if (!niche || !location) {
    return res.status(400).json({ error: 'Niche and location required' });
  }

  console.log(`📍 Local Insights: ${niche} in ${location}`);

  try {
    const mapResults = await searchGoogleMaps(niche, location);
    console.log(`📊 Google Maps found ${mapResults.length} places`);
    
    const leads = [];
    let withWebsite = 0;
    let withEmail = 0;

    const tasks = mapResults.map(result =>
      limit(async () => {
        const lead = {
          name: result.title,
          company: result.title,
          phone: result.phone || '',
          country: location?.split(',')?.pop()?.trim()?.toUpperCase() || '',
          niche,
          address: result.address || '',
          rating: result.rating || '',
          reviews: result.reviews || '',
          type: result.type || '',
          email: '',
          status: 'new',
        };

        if (result.website) {
          withWebsite++;
          const webData = await scrapeMapWebsite(result.website);
          if (webData.email) {
            lead.email = webData.email;
            withEmail++;
          }
        }

        leads.push(lead);
      })
    );

    await Promise.all(tasks);
    
    const saved = leads.length > 0 ? await Lead.insertMany(leads) : [];
    
    console.log(`💾 Saved ${saved.length} local leads`);
    
    res.json({
      leads: saved,
      stats: {
        total: mapResults.length,
        withWebsite,
        withEmail,
        saved: saved.length,
      }
    });
  } catch (e) {
    console.error('Local Insights error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
