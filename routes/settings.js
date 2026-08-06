router.put('/', async (req, res) => {
  try {
    const { gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey } = req.body;
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey });
    } else {
      if (gmail !== undefined) settings.gmail = gmail;
      if (appPassword !== undefined) settings.appPassword = appPassword;
      if (serpApiKey !== undefined) settings.serpApiKey = serpApiKey;
      if (groqApiKey !== undefined) settings.groqApiKey = groqApiKey;
      if (brevoApiKey !== undefined) settings.brevoApiKey = brevoApiKey;
    }
    await settings.save();
    updateConfig({ gmail, appPassword, serpApiKey, groqApiKey, brevoApiKey });
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
