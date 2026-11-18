// backend/middleware/attachUser.js
const { getAuth } = require('@clerk/express');

module.exports = function attachUser(req, res, next) {
  const { isAuthenticated, userId } = getAuth(req);

  if (!isAuthenticated || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.userId = userId;
  next();
};
