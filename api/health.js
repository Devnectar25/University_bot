const vectorStore = require('./_lib/vectorStore');

module.exports = (req, res) => {
  let documents = null;
  try { documents = vectorStore.count(); } catch (err) { console.error('Vector store load error:', err); }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    knowledge_base_documents: documents,
    openrouter_configured: Boolean(process.env.OPENROUTER_API_KEY)
  });
};
