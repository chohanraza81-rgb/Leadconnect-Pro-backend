const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const { updateConfig } = require('../services/config');

router.get('/', async (req, res) => {
  try { res.json(await Setting.findOne() || {}); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', async (req, res) => {
  try {
    const { gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey } = req.body;
    let s = await Setting.findOne();
    if (!s) s = new Setting({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey });
    else {
      if (gmail !== undefined) s.gmail = gmail;
      if (appPassword !== undefined) s.appPassword = appPassword;
      if (serpApiKey !== undefined) s.serpApiKey = serpApiKey;
      if (groqApiKey !== undefined) s.groqApiKey = groqApiKey;
      if (brevoApiKey !== undefined) s.brevoApiKey = brevoApiKey;
      if (scraperApiKey !== undefined) s.scraperApiKey = scraperApiKey;
    }
    await s.save();
    updateConfig({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
