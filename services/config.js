const Setting = require('../models/Setting');

let config = {
  gmail: process.env.MY_GMAIL || '',
  appPassword: process.env.MY_APP_PASSWORD || '',
  serpApiKey: process.env.SERPAPI_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  scraperApiKey: process.env.SCRAPER_API_KEY || '',
};

async function loadSettings() {
  try {
    const settings = await Setting.findOne();
    if (settings) {
      if (settings.gmail) config.gmail = settings.gmail;
      if (settings.appPassword) config.appPassword = settings.appPassword;
      if (settings.serpApiKey) config.serpApiKey = settings.serpApiKey;
      if (settings.groqApiKey) config.groqApiKey = settings.groqApiKey;
      if (settings.brevoApiKey) config.brevoApiKey = settings.brevoApiKey;
      if (settings.scraperApiKey) config.scraperApiKey = settings.scraperApiKey;
    }
  } catch (e) {
    console.warn('Could not load settings from DB, using .env');
  }
}

function getConfig() {
  return { ...config };
}

function updateConfig(newValues) {
  config = { ...config, ...newValues };
}

module.exports = { loadSettings, getConfig, updateConfig };
