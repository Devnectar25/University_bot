const fs = require('fs');
const path = require('path');
const rag = require('./_lib/rag');
const rateLimiter = require('./_lib/rateLimiter');
const { readJsonBody, methodNotAllowed } = require('./_lib/body');

const MAX_BODY_BYTES = 50 * 1024;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_CHARS = 4000;
const HISTORY_TURNS = parseInt(process.env.CHAT_HISTORY_WINDOW || '5', 10);
const LOG_FILE = path.join(__dirname, '..', 'data', 'feedback_logs.jsonl');

function logGapSilently(query, language) {
  try {
    const entry = {
      id: 'gap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type: 'gap',
      query,
      answer: 'Out-of-scope / Not in official records',
      language,
      timestamp: new Date().toISOString()
    };
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {}
}

// The browser keeps the conversation and sends its recent turns with each question,
// because serverless functions don't remember anything between requests.
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-HISTORY_TURNS * 2)
    .map(t => ({ role: t.role, content: t.content.slice(0, MAX_HISTORY_CHARS) }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  // Rate Limiting Protection (30 requests/min per IP)
  const rate = rateLimiter.checkRateLimit(req);
  if (!rate.allowed) {
    res.setHeader('Retry-After', rate.retryAfter);
    return res.status(429).json({
      error: `Too many requests. Please wait ${rate.retryAfter} seconds before asking another question.`
    });
  }

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ error: 'Request body must be valid JSON.' });
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Request payload too large (max 50KB allowed).' });
  }

  // Strip HTML tags to prevent tag/XSS injection
  const message = typeof body.message === 'string' ? body.message.replace(/<[^>]*>/g, '').trim() : '';
  if (!message) {
    return res.status(400).json({ error: 'Message cannot be empty or contain only HTML tags/whitespaces.' });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters).` });
  }

  const language = typeof body.language === 'string' ? body.language.toLowerCase().trim() : 'auto';

  try {
    const result = await rag.answerQuestion(message, cleanHistory(body.history), language);

    // If query was not found in knowledge base, log it for dataset enrichment
    if (!result.found) {
      logGapSilently(message, result.language || language);
    }

    return res.status(200).json({
      answer: result.answer,
      sources: result.sources,
      language: result.language,
      found: result.found,
      cached: Boolean(result.cached)
    });
  } catch (err) {
    console.error('Error generating chat answer:', err);
    return res.status(500).json({ error: 'The AI service encountered an error. Please try again in a few moments.' });
  }
};
