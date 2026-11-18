// backend/models/UserUsage.js
const mongoose = require('mongoose');

const userUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    searchesToday: {
      type: Number,
      default: 0,
    },
    lastSearchDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
    },
    plan: {
      type: String,
      default: 'free', // future: 'pro', 'premium'
    },
    searchLimit: {
      type: Number,
      default: 3,
    },
    totalSearches: {
      type: Number,
      default: 0, // lifetime counter (analytics ke liye)
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserUsage', userUsageSchema);
