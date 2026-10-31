// In-memory sliding-window rate limiter per client IP
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10); // 30 req/min

const clients = new Map();

// Periodic cleanup of stale client records
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of clients.entries()) {
    if (now - data.startTime > WINDOW_MS * 2) {
      clients.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  let record = clients.get(ip);
  if (!record || now - record.startTime > WINDOW_MS) {
    if (clients.size > 2000) clients.clear();
    record = { startTime: now, count: 1 };
    clients.set(ip, record);
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}

module.exports = { checkRateLimit, getClientIp };

