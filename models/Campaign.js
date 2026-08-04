const mongoose = require('mongoose');

const sequenceStepSchema = new mongoose.Schema({
  step: Number,
  type: { type: String, enum: ['email', 'whatsapp'] },
  subject: String,
  body: String,
  sentAt: Date,
});

const campaignSchema = new mongoose.Schema({
  name: String,
  leads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
  sequence: [sequenceStepSchema],
  sentAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);
