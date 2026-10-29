const crypto = require('crypto');

// Admin sign-in with credentials from environment variables:
//   ADMIN_USERNAME, ADMIN_PASSWORD, AUTH_SECRET (long random string)
//   ADMIN_NAME, ADMIN_EMAIL (optional, shown in the sidebar)
// The session is a signed cookie, so no database is needed.
const COOKIE_NAME = 'guni_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function isConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && process.env.AUTH_SECRET);
}

function hmac(value) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET).update(value).digest('base64url');
}

// Constant-time comparison that also works for strings of different lengths
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkCredentials(username, password) {
  if (!isConfigured()) return false;
  const userOk = safeEqual(username, process.env.ADMIN_USERNAME);
  const passOk = safeEqual(password, process.env.ADMIN_PASSWORD);
  return userOk && passOk;
}

function createToken(username) {
  const payload = { u: username, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function publicUser(username) {
  return {
    username,
    name: process.env.ADMIN_NAME || username,
    email: process.env.ADMIN_EMAIL || ''
  };
}

function getUser(req) {
  if (!isConfigured()) return null;
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;

  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(body))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    if (payload.u !== process.env.ADMIN_USERNAME) return null;
    return publicUser(payload.u);
  } catch {
    return null;
  }
}

function cookieAttributes(req, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setSessionCookie(req, res, username) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createToken(username)}; ${cookieAttributes(req, SESSION_SECONDS)}`);
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(req, 0)}`);
}

module.exports = {
  isConfigured,
  checkCredentials,
  getUser,
  publicUser,
  setSessionCookie,
  clearSessionCookie
};
