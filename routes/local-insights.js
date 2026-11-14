const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { searchGoogleMaps } = require('../services/googleMapsScraper');
const { scrapeWebsite } = require('../services/emailScraper'); // Email extractor use karenge
const { normalizeCountryCode } = require('../services/countryNormalizer');
const pLimit = require('p-limit');
const limit = pLimit.default ? pLimit.default(3) : pLimit(3);

router.post('/', async (req, res) => {
  const { niche, location } = req.body;
  if (!niche || !location) return res.status(400).json({ error: 'Niche and location required' });

  console.log(`📍 Local Insights: ${niche} in ${location}`);

  try {
    const mapResults = await searchGoogleMaps(niche, location);
    console.log(`📊 Google Maps found ${mapResults.length} places`);

    const leads = [];
    
    const tasks = mapResults.map(result =>
      limit(async () => {
        let email = '';
        
        // Agar website hai to email nikalne ki koshish karo
        if (result.website) {
          const scraped = await scrapeWebsite(result.website);
          email = scraped.email || '';
        }

        const lead = {
          name: result.title, // Ab "Contact" nahi aayega, real business name aayega
          company: result.company,
          phone: result.phone, // Valid phone number
          country: normalizeCountryCode(location?.split(',')?.pop()?.trim()) || location?.split(',')?.pop()?.trim()?.toUpperCase() || '',
          niche,
          address: result.address,
          rating: result.rating,
          reviews: result.reviews,
          type: result.type,
          email: email,
          status: 'new',
        };

        // Sirf wahi leads save karo jinke pas Email YA Phone ho
        if (lead.email || lead.phone) {
          leads.push(lead);
        }
      })
    );

    await Promise.all(tasks);

    // --- DEDUPLICATION LOGIC ---
    const uniqueBatch = [];
    const seenKeys = new Set();
    
    // 1. Batch ke andar duplicate hatayen
    for (const l of leads) {
      const key = l.phone ? `p:${l.phone}` : l.email ? `e:${l.email}` : `c:${l.company.toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueBatch.push(l);
      }
    }

    // 2. Database ke purane records se compare karen
    const existingLeads = await Lead.find({}, { phone: 1, email: 1, company: 1 }).lean();
    const existingKeys = new Set();
    existingLeads.forEach(l => {
      if (l.phone) existingKeys.add(`p:${l.phone}`);
      if (l.email) existingKeys.add(`e:${l.email}`);
      if (l.company) existingKeys.add(`c:${l.company.toLowerCase()}`);
    });

    const newLeads = uniqueBatch.filter(l => {
      if (l.phone && existingKeys.has(`p:${l.phone}`)) return false;
      if (l.email && existingKeys.has(`e:${l.email}`)) return false;
      if (l.company && existingKeys.has(`c:${l.company.toLowerCase()}`)) return false;
      return true;
    });

    const saved = newLeads.length > 0 ? await Lead.insertMany(newLeads) : [];
    console.log(`💾 Saved ${saved.length} clean local leads`);

    res.json({ leads: saved, total: saved.length });
  } catch (e) {
    console.error('Local insights error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
