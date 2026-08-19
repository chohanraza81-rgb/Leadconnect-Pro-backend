const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: { type: String, default: 'Contact' },
  company: String,
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  country: String,
  niche: String,
  status: { type: String, enum: ['new', 'contacted', 'replied', 'qualified', 'converted'], default: 'new' },
  whatsappClicks: { type: Number, default: 0 },
  whatsappClickedAt: [Date],
  address: { type: String, default: '' },
  rating: { type: String, default: '' },
  reviews: { type: String, default: '' },
  type: { type: String, default: '' },
  leadType: { type: String, enum: ['business', 'consumer'], default: 'business' },
  source: { type: String, default: '' },
  searchQuery: { type: String, default: '' },
  intentScore: { type: Number, default: 0 },
  snippet: { type: String, default: '' },
  leadScore: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
