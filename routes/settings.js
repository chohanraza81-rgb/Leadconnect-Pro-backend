const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const { updateConfig } = require('../services/config');

router.get('/', async (req, res) => {
  try {
    const settings = await Setting.findOne();
    res.json(settings || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey } = req.body;
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey });
    } else {
      if (gmail !== undefined) settings.gmail = gmail;
      if (appPassword !== undefined) settings.appPassword = appPassword;
      if (serpApiKey !== undefined) settings.serpApiKey = serpApiKey;
      if (groqApiKey !== undefined) settings.groqApiKey = groqApiKey;
      if (brevoApiKey !== undefined) settings.brevoApiKey = brevoApiKey;
      if (scraperApiKey !== undefined) settings.scraperApiKey = scraperApiKey;
    }
    await settings.save();
    updateConfig({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey, scraperApiKey });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
