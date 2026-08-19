const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  gmail: String,
  appPassword: String,
  serpApiKey: String,
  groqApiKey: String,
  brevoApiKey: String,
  scraperApiKey: String,   // Added for ScraperAPI
});

module.exports = mongoose.model('Setting', settingSchema);
