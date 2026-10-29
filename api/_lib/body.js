// Vercel parses JSON bodies into req.body; fall back to parsing a string body ourselves
function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return {};
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return res.status(405).json({ error: 'Method not allowed.' });
}

module.exports = { readJsonBody, methodNotAllowed };
