const rag = require('./_lib/rag');
const { readJsonBody, methodNotAllowed } = require('./_lib/body');

const MAX_BODY_BYTES = 50 * 1024;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_CHARS = 4000;
const HISTORY_TURNS = parseInt(process.env.CHAT_HISTORY_WINDOW || '5', 10);

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
    return res.status(200).json({
      answer: result.answer,
      sources: result.sources,
      language: result.language
    });
  } catch (err) {
    console.error('Error generating chat answer:', err);
    return res.status(500).json({ error: 'The AI service encountered an error. Please try again in a few moments.' });
  }
};
