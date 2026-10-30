// Local development server that mirrors Vercel: static files from public/, functions from api/.
// Usage: npm run dev   (reads .env, serves http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const API_DIR = path.join(__dirname, 'api');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Adds the helpers Vercel provides on req/res
function decorate(req, res, url, rawBody) {
  req.query = Object.fromEntries(url.searchParams);
  req.body = rawBody;
  if (rawBody && (req.headers['content-type'] || '').includes('application/json')) {
    try { req.body = JSON.parse(rawBody); } catch { /* handlers treat bad JSON as a string body */ }
  }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
}

async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const file = path.join(API_DIR, `${name}.js`);
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  decorate(req, res, url, Buffer.concat(chunks).toString('utf8'));

  try {
    await require(file)(req, res);
  } catch (err) {
    console.error(`api/${name} crashed:`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason);
});

function handleStatic(req, res, url) {
  // Like Vercel's cleanUrls: /login serves login.html, / serves index.html
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const candidates = [pathname, `${pathname}.html`].map(p => path.join(PUBLIC_DIR, p));
  const file = candidates.find(p => p.startsWith(PUBLIC_DIR) && fs.existsSync(p) && fs.statSync(p).isFile());

  if (!file) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', MIME_TYPES[path.extname(file)] || 'application/octet-stream');
  const stream = fs.createReadStream(file);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Server error');
    }
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return handleStatic(req, res, url);
  } catch (err) {
    console.error('Request parsing error:', err);
    if (!res.headersSent) {
      res.statusCode = 400;
      res.end('Bad Request');
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server Error] Port ${PORT} is already in use by another process.`);
    console.error(`To run on another port, set the PORT environment variable:`);
    console.error(`  PowerShell: $env:PORT=3001; npm run dev`);
    console.error(`  CMD:        set PORT=3001 && npm run dev\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Ganpat University chatbot running at http://localhost:${PORT}`);
});
