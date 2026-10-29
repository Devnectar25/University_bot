const vectorStore = require('./vectorStore');
const llm = require('./llm');

const TOP_K = parseInt(process.env.RAG_TOP_K || '3', 10);
// Maximum cosine distance (1 - similarity) for a snippet to count as relevant
const DISTANCE_THRESHOLD = parseFloat(process.env.RAG_DISTANCE_THRESHOLD || '0.6');

const GREETING_ANSWER =
  'Hello! I am your AI assistant for Ganpat University. ' +
  'I can help you with questions about admissions, fees, courses, ' +
  'faculty, campus facilities, leave policies, and exam schedules. ' +
  'What would you like to know?';

async function retrieve(queryText) {
  try {
    const queryVec = await llm.getQueryEmbedding(queryText);
    const results = vectorStore.query(queryVec, TOP_K).filter(r => r.distance <= DISTANCE_THRESHOLD);
    if (!results.length) return { found: false, context: '', sources: [] };

    const context = results.map(r => {
      const m = r.metadata;
      const header = `[Source: ${m.source || 'Unknown'} | Sheet: ${m.sheet_name || 'N/A'} | Row: ${m.row_id ?? 'N/A'} | Category: ${m.category || 'N/A'}]`;
      return `${header}\n${r.text}\n${'-'.repeat(50)}`;
    }).join('\n');

    const sources = results.map(r => ({
      source: r.metadata.source || 'Unknown',
      sheet_name: r.metadata.sheet_name || 'N/A',
      row_id: r.metadata.row_id ?? 'N/A',
      category: r.metadata.category || 'N/A',
      distance: r.distance
    }));

    return { found: true, context, sources };
  } catch (err) {
    // Retrieval problems fall back to a general answer instead of failing the chat
    console.error('RAG retrieval error:', err);
    return { found: false, context: '', sources: [] };
  }
}

async function answerQuestion(queryText, history = []) {
  // Fast path for pure greetings: no embedding or LLM call needed
  if (llm.isPureGreeting(queryText)) {
    return { answer: GREETING_ANSWER, sources: [], found: true };
  }

  const retrieval = await retrieve(queryText);
  if (!retrieval.found) {
    const answer = await llm.generateGeneralAnswer(queryText, history);
    return { answer, sources: [], found: false };
  }

  const answer = await llm.generateAnswer(queryText, retrieval.context, history);
  return { answer, sources: retrieval.sources, found: true };
}

module.exports = { answerQuestion };
