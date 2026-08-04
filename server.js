require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { loadSettings } = require('./services/config');

const app = express();
app.use(cors());
app.use(express.json());

loadSettings().then(() => console.log('Settings loaded'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/finder', require('./routes/finder'));
app.use('/api/outreach', require('./routes/outreach'));
app.use('/api/settings', require('./routes/settings'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
