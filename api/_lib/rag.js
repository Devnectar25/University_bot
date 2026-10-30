const vectorStore = require('./vectorStore');
const llm = require('./llm');

const TOP_K = parseInt(process.env.RAG_TOP_K || '4', 10);
// Maximum cosine distance (1 - similarity) for a snippet to count as relevant
const DISTANCE_THRESHOLD = parseFloat(process.env.RAG_DISTANCE_THRESHOLD || '0.58');

const GREETING_ANSWERS = {
  en: 'Hello! I am your AI campus assistant for Ganpat University. ' +
      'I can help you with questions about admissions, fees, courses, ' +
      'hostels, transport, placements, faculty, and campus facilities. ' +
      'What would you like to know about Ganpat University?',
  hi: 'नमस्ते! मैं गणपत यूनिवर्सिटी (GUNI) का आधिकारिक एआई कैंपस सहायक हूँ। ' +
      'मैं प्रवेश, फीस, पाठ्यक्रम, हॉस्टल, परिवहन, प्लेसमेंट और कैंपस सुविधाओं ' +
      'से संबंधित प्रश्नों में आपकी सहायता कर सकता हूँ। ' +
      'आप गणपत यूनिवर्सिटी के बारे में क्या जानना चाहते हैं?',
  gu: 'નમસ્તે! હું ગણપત યુનિવર્સિટી (GUNI) નો સત્તાવાર AI કેમ્પસ સહાયક છું. ' +
      'હું તમને પ્રવેશ, ફી, અભ્યાસક્રમો, હોસ્ટેલ, પરિવહન, પ્લેસમેન્ટ અને કેમ્પસ ' +
      'સુવિધાઓ સંબંધિત પ્રશ્નોમાં મદદ કરી શકું છું. ' +
      'તમે ગણપત યુનિવર્સિટી વિશે શું જાણવા માગો છો?'
};

const OUT_OF_SCOPE_ANSWERS = {
  en: 'I am the official AI assistant for Ganpat University. ' +
      'I can only answer questions related to Ganpat University based on official university records. ' +
      'I do not have information regarding this query in my knowledge base. ' +
      'Please visit the official [Ganpat University Website](https://www.ganpatuniversity.ac.in) or contact the campus administration for assistance.',
  hi: 'मैं गणपत यूनिवर्सिटी का आधिकारिक एआई सहायक हूँ। ' +
      'मैं केवल आधिकारिक रिकॉर्ड के आधार पर गणपत यूनिवर्सिटी से संबंधित प्रश्नों के उत्तर दे सकता हूँ। ' +
      'मेरे ज्ञानकोष में इस विषय की जानकारी उपलब्ध नहीं है। ' +
      'आधिकारिक जानकारी के लिए कृपया [गणपत यूनिवर्सिटी की आधिकारिक वेबसाइट](https://www.ganpatuniversity.ac.in) देखें या विश्वविद्यालय प्रशासन से संपर्क करें।',
  gu: 'હું ગણપત યુનિવર્સિટીનો સત્તાવાર AI સહાયક છું. ' +
      'હું માત્ર સત્તાવાર રેકોર્ડના આધારે ગણપત યુનિવર્સિટી સંબંધિત પ્રશ્નોના જ જવાબ આપી શકું છું. ' +
      'મારા જ્ઞાનકોશમાં આ વિષય વિશે માહિતી ઉપલબ્ધ નથી. ' +
      'સત્તાવાર માહિતી માટે કૃપા કરીને [ગણપત યુનિવર્સિટીની સત્તાવાર વેબસાઇટ](https://www.ganpatuniversity.ac.in) ની મુલાકાત લો અથવા યુનિવર્સિટી વહીવટીતંત્રનો સંપર્ક કરો.'
};

async function retrieve(queryText, lang = 'en') {
  try {
    // If query is in Hindi or Marathi, translate search terms to English for optimal vector matching
    const searchKeywords = lang !== 'en'
      ? await llm.translateQueryToEnglish(queryText)
      : queryText;

    const queryVec = await llm.getQueryEmbedding(searchKeywords);
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

async function answerQuestion(queryText, history = [], preferredLang = 'auto') {
  const lang = llm.detectLanguage(queryText, preferredLang);

  // Fast path for pure greetings in English, Hindi, or Marathi
  if (llm.isPureGreeting(queryText, lang)) {
    return {
      answer: GREETING_ANSWERS[lang] || GREETING_ANSWERS.en,
      sources: [],
      found: true,
      language: lang
    };
  }

  const retrieval = await retrieve(queryText, lang);
  if (!retrieval.found) {
    // Strictly block out-of-the-box or non-university questions
    return {
      answer: OUT_OF_SCOPE_ANSWERS[lang] || OUT_OF_SCOPE_ANSWERS.en,
      sources: [],
      found: false,
      language: lang
    };
  }

  const answer = await llm.generateAnswer(queryText, retrieval.context, history, lang);
  return { answer, sources: retrieval.sources, found: true, language: lang };
}

module.exports = { answerQuestion, retrieve };
