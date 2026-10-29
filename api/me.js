const auth = require('./_lib/auth');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ user: auth.getUser(req), signInAvailable: auth.isConfigured() });
};
