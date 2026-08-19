require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { loadSettings } = require('./services/config');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

loadSettings().then(() => console.log('Settings loaded'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// API Routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/finder', require('./routes/finder'));
app.use('/api/outreach', require('./routes/outreach'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/local-insights', require('./routes/local-insights'));
app.use('/api/consumer-finder', require('./routes/consumer-finder'));

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
