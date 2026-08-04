const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: { type: String, default: 'Contact' },
  company: String,
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  country: String,
  niche: String,
  status: {
    type: String,
    enum: ['new', 'contacted', 'replied', 'converted'],
    default: 'new'
  },
  whatsappClicks: { type: Number, default: 0 },
  whatsappClickedAt: [Date],
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
