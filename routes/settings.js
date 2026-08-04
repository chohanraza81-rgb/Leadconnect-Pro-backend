const router = require('express').Router();
const Setting = require('../models/Setting');
const { updateConfig } = require('../services/config');

router.get('/', async (req, res) => {
  try {
    let settings = await Setting.findOne();
    res.json(settings || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { gmail, appPassword, serpApiKey, groqApiKey } = req.body;
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting({ gmail, appPassword, serpApiKey, groqApiKey });
    } else {
      if (gmail) settings.gmail = gmail;
      if (appPassword) settings.appPassword = appPassword;
      if (serpApiKey) settings.serpApiKey = serpApiKey;
      if (groqApiKey) settings.groqApiKey = groqApiKey;
    }
    await settings.save();
    updateConfig({ gmail, appPassword, serpApiKey, groqApiKey });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
