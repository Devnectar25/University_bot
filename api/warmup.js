const vectorStore = require('./_lib/vectorStore');

// Called by the page on load so the knowledge base is in memory before the first question
module.exports = (req, res) => {
  try {
    vectorStore.load();
    res.status(200).json({ status: 'ready', cached: true });
  } catch (err) {
    console.warn('Warmup notice:', err);
    res.status(200).json({ status: 'ready', error: err.message });
  }
};
