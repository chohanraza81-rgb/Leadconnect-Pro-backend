// backend/models/Lead.js
const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    // 🔒 Owner — har lead kisi ek user ka hai
    userId: {
      type: String,
      required: true,
      index: true,        // 👈 query performance ke liye zaroori
    },

    name: { type: String, default: 'Contact' },
    company: String,
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    country: String,
    niche: String,
    status: {
      type: String,
      enum: ['new', 'contacted', 'replied', 'qualified', 'converted'],
      default: 'new',
    },
    whatsappClicks: { type: Number, default: 0 },
    whatsappClickedAt: [Date],
    address: { type: String, default: '' },
    rating: { type: String, default: '' },
    reviews: { type: String, default: '' },
    type: { type: String, default: '' },
    leadType: {
      type: String,
      enum: ['business', 'consumer'],
      default: 'business',
    },
    source: { type: String, default: '' },
    searchQuery: { type: String, default: '' },
    intentScore: { type: Number, default: 0 },
    snippet: { type: String, default: '' },
    leadScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// 🔥 Compound index — userId + createdAt queries fast
leadSchema.index({ userId: 1, createdAt: -1 });

// 🔥 Compound index — userId + niche/country filters ke liye
leadSchema.index({ userId: 1, niche: 1 });
leadSchema.index({ userId: 1, country: 1 });

module.exports = mongoose.model('Lead', leadSchema);
