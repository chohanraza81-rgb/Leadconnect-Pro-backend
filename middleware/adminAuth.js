// backend/middleware/adminAuth.js
module.exports = function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_SETTINGS_PASSWORD;

  if (!expected) {
    return res.status(500).json({
      error: 'Admin password not configured on server',
    });
  }

  if (!provided || provided !== expected) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};
