// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { clerkMiddleware } = require('@clerk/express');

const { loadSettings } = require('./services/config');
const attachUser = require('./middleware/attachUser');
const adminAuth = require('./middleware/adminAuth');

const app = express();
app.set('trust proxy', 1);

// ═══════════ CORS ═══════════
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password'],
    credentials: false,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ═══════════ MongoDB + Settings ═══════════
loadSettings().then(() => console.log('Settings loaded'));

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err));

// ═══════════ Clerk ═══════════
// Har request par auth state parse karta hai
app.use(clerkMiddleware());

// ═══════════ PUBLIC ROUTES ═══════════
app.get('/', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// ═══════════ PROTECTED ROUTES ═══════════
// Settings — Clerk auth + admin password
app.use(
  '/api/settings',
  attachUser,
  adminAuth,
  require('./routes/settings')
);

// Baqi routes — Clerk auth zaroori
app.use('/api/upload', attachUser, require('./routes/upload'));
app.use('/api/dashboard', attachUser, require('./routes/dashboard'));
app.use('/api/leads', attachUser, require('./routes/leads'));
app.use('/api/finder', attachUser, require('./routes/finder'));
app.use('/api/local-insights', attachUser, require('./routes/local-insights'));
app.use('/api/consumer-finder', attachUser, require('./routes/consumer-finder'));

// ❌ REMOVED: /api/outreach (frontend se bhi hata diya gaya hai)

// ═══════════ ERROR HANDLER ═══════════
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
