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
    const { gmail, appPassword, serpApiKey, groqApiKey, resendApiKey } = req.body;
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting({ gmail, appPassword, serpApiKey, groqApiKey, resendApiKey });
    } else {
      if (gmail !== undefined) settings.gmail = gmail;
      if (appPassword !== undefined) settings.appPassword = appPassword;
      if (serpApiKey !== undefined) settings.serpApiKey = serpApiKey;
      if (groqApiKey !== undefined) settings.groqApiKey = groqApiKey;
      if (resendApiKey !== undefined) settings.resendApiKey = resendApiKey;
    }
    await settings.save();
    updateConfig({ gmail, appPassword, serpApiKey, groqApiKey, resendApiKey });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
