const auth = require('./_lib/auth');
const { readJsonBody, methodNotAllowed } = require('./_lib/body');

module.exports = (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  if (!auth.isConfigured()) {
    return res.status(503).json({ error: 'Sign-in is not set up on this server yet.' });
  }

  const body = readJsonBody(req) || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!auth.checkCredentials(username, password)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  auth.setSessionCookie(req, res, username);
  return res.status(200).json({ user: auth.publicUser(username) });
};
