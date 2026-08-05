const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  gmail: String,
  appPassword: String,
  serpApiKey: String,
  groqApiKey: String,
  resendApiKey: String,   // NEW
});

module.exports = mongoose.model('Setting', settingSchema);
