const auth = require('./_lib/auth');
const { methodNotAllowed } = require('./_lib/body');

module.exports = (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  auth.clearSessionCookie(req, res);
  return res.status(200).json({ ok: true });
};
