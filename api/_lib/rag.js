const vectorStore = require('./vectorStore');
const llm = require('./llm');

const TOP_K = parseInt(process.env.RAG_TOP_K || '4', 10);
// Maximum cosine distance (1 - similarity) for a snippet to count as relevant
const DISTANCE_THRESHOLD = parseFloat(process.env.RAG_DISTANCE_THRESHOLD || '0.58');

const GREETING_ANSWER =
  'Hello! I am your AI campus assistant for Ganpat University. ' +
  'I can help you with questions about admissions, fees, courses, ' +
  'hostels, transport, placements, faculty, and campus facilities. ' +
  'What would you like to know about Ganpat University?';

const OUT_OF_SCOPE_ANSWER =
  'I am the official AI assistant for Ganpat University. ' +
  'I can only answer questions related to Ganpat University based on official university records. ' +
  'I do not have information regarding this query in my knowledge base. ' +
  'Please visit the official Ganpat University website (https://www.ganpatuniversity.ac.in) or contact the campus administration for assistance.';

async function retrieve(queryText) {
  try {
    const queryVec = await llm.getQueryEmbedding(queryText);
    const results = vectorStore.query(queryVec, TOP_K).filter(r => r.distance <= DISTANCE_THRESHOLD);
    if (!results.length) return { found: false, context: '', sources: [] };

    const context = results.map((r, idx) => {
      const m = r.metadata || {};
      const title = m.page_title || m.sheet_name || 'Ganpat University Record';
      const section = m.section ? ` | Section: ${m.section}` : '';
      const url = m.url ? ` | URL: ${m.url}` : '';
      const category = m.category ? ` | Category: ${m.category}` : '';
      const header = `[Context ${idx + 1} | Source: ${m.source || 'Unknown'} | ${title}${section}${category}${url}]`;
      return `${header}\n${r.text}\n${'-'.repeat(50)}`;
    }).join('\n\n');

    const sources = results.map(r => ({
      source: r.metadata.source || 'Unknown',
      sheet_name: r.metadata.sheet_name || 'N/A',
      row_id: r.metadata.row_id ?? 'N/A',
      category: r.metadata.category || 'N/A',
      page_title: r.metadata.page_title || '',
      url: r.metadata.url || '',
      distance: Number(r.distance.toFixed(4))
    }));

    return { found: true, context, sources };
  } catch (err) {
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
    // Strictly block out-of-the-box or non-university questions
    return { answer: OUT_OF_SCOPE_ANSWER, sources: [], found: false };
  }

  const answer = await llm.generateAnswer(queryText, retrieval.context, history);
  return { answer, sources: retrieval.sources, found: true };
}

module.exports = { answerQuestion, retrieve };
