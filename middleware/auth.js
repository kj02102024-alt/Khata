function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Login required', errorHi: 'पहले लॉगिन करें' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Login required', errorHi: 'पहले लॉगिन करें' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only', errorHi: 'केवल एडमिन' });
  }
  next();
}

function requireShopkeeper(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Login required', errorHi: 'पहले लॉगिन करें' });
  }
  if (req.session.user.role !== 'shopkeeper' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', errorHi: 'अनुमति नहीं' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireShopkeeper };
