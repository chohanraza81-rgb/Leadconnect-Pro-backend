require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Load settings
const { loadSettings } = require('./services/config');
loadSettings().then(() => console.log('Settings loaded'));

// Routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/finder', require('./routes/finder'));
app.use('/api/outreach', require('./routes/outreach'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/local-insights', require('./routes/local-insights'));

app.get('/', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
