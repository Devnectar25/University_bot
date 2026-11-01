const fs = require('fs');
const path = require('path');
const { readJsonBody, methodNotAllowed } = require('./_lib/body');

const LOG_FILE = path.join(__dirname, '..', 'data', 'feedback_logs.jsonl');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const body = readJsonBody(req);
  if (!body) return res.status(400).json({ error: 'Request body must be valid JSON.' });

  const feedbackType = body.type || body.feedback || 'general';
  if (!['like', 'dislike', 'gap', 'general'].includes(feedbackType)) {
    return res.status(400).json({ error: 'Invalid feedback type.' });
  }

  const logEntry = {
    id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type: feedbackType,
    query: typeof body.query === 'string' ? body.query.slice(0, 1000) : '',
    answer: typeof body.answer === 'string' ? body.answer.slice(0, 2000) : '',
    comment: typeof body.comment === 'string' ? body.comment.slice(0, 500) : '',
    language: body.language || 'en',
    sources: Array.isArray(body.sources) ? body.sources.slice(0, 5) : [],
    timestamp: new Date().toISOString()
  };

  try {
    const dataDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf8');
    return res.status(200).json({ status: 'ok', logged: true, id: logEntry.id });
  } catch (err) {
    console.error('Failed to log feedback:', err);
    return res.status(500).json({ error: 'Failed to record feedback.' });
  }
};

