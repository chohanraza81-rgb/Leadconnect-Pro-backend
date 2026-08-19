const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  gmail: String,
  appPassword: String,
  serpApiKey: String,
  groqApiKey: String,
  brevoApiKey: String,
  scraperApiKey: String,   // NEW
});

module.exports = mongoose.model('Setting', settingSchema);
