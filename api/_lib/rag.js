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
  mr: 'नमस्कार! मी गणपत युनिव्हर्सिटीचा (GUNI) अधिकृत एआय कॅम्पस सहाय्यक आहे. ' +
      'मी प्रवेश, फी, अभ्यासक्रम, वसतिगृह, वाहतूक, प्लेसमेंट आणि कॅम्पस ' +
      'सुविधांशी संबंधित प्रश्नांमध्ये आपल्याला मदत करू शकतो. ' +
      'आपल्याला गणपत युनिव्हर्सिटीबद्दल काय जाणून घ्यायचे आहे?'
};

const OUT_OF_SCOPE_ANSWERS = {
  en: 'I am the official AI assistant for Ganpat University. ' +
      'I can only answer questions related to Ganpat University based on official university records. ' +
      'I do not have information regarding this query in my knowledge base. ' +
      'Please visit the official Ganpat University website (https://www.ganpatuniversity.ac.in) or contact the campus administration for assistance.',
  hi: 'मैं गणपत यूनिवर्सिटी का आधिकारिक एआई सहायक हूँ। ' +
      'मैं केवल आधिकारिक रिकॉर्ड के आधार पर गणपत यूनिवर्सिटी से संबंधित प्रश्नों के उत्तर दे सकता हूँ। ' +
      'मेरे ज्ञानकोष में इस विषय की जानकारी उपलब्ध नहीं है। ' +
      'आधिकारिक जानकारी के लिए कृपया गणपत यूनिवर्सिटी की आधिकारिक वेबसाइट (https://www.ganpatuniversity.ac.in) देखें या विश्वविद्यालय प्रशासन से संपर्क करें।',
  mr: 'मी गणपत युनिव्हर्सिटीचा अधिकृत एआय सहाय्यक आहे. ' +
      'मी केवळ अधिकृत माहितीच्या आधारे गणपत युनिव्हर्सिटीशी संबंधित प्रश्नांची उत्तरे देऊ शकतो. ' +
      'माझ्या ज्ञानकोशात या विषयाबद्दल माहिती उपलब्ध नाही. ' +
      'अधिकृत माहितीसाठी कृपया गणपत युनिव्हर्सिटीच्या अधिकृत संकेतस्थळाला (https://www.ganpatuniversity.ac.in) भेट द्या किंवा विद्यापीठ प्रशासनाशी संपर्क साधा.'
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
