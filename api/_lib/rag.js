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

const CAMPUS_INTENT_REGEX = /\b(stream|streams|course|courses|program|programs|degree|degrees|branch|branches|specialization|specializations|btech|mtech|mca|bca|bba|mba|phd|diploma|pharmacy|engineering|management|science|commerce|arts|design|architecture|nursing|physiotherapy|agriculture|marine|maritime|polytechnic|institute|institutes|faculty|faculties|department|departments|school|schools|college|colleges|admission|admissions|apply|application|form|registration|eligibility|criteria|cutoff|merit|acpc|seat|seats|intake|fee|fees|tuition|scholarship|scholarships|financial aid|hostel|hostels|room|rooms|mess|food|dining|canteen|cafeteria|bus|buses|transport|transportation|route|routes|library|sports|gym|wifi|hospital|clinic|medical|atm|bank|auditorium|infrastructure|campus|gate|address|location|map|reach|directions|located|situated|placement|placements|package|packages|salary|salaries|company|companies|recruit|recruiter|recruiters|recruitment|internship|internships|training|cdc|teacher|teachers|prof|professor|professors|hod|dean|principal|director|president|chancellor|vc|vice chancellor|staff|contact|email|phone|number|helpline|office|timing|timings|hours|exam|exams|examination|examinations|date sheet|timetable|hall ticket|admit card|result|results|grade|grades|marks|syllabus|curriculum|calendar|holiday|holidays|vacation|attendance|event|events|fest|fests|cultural|technical|club|clubs|nss|ncc|alumni|naac|nirf|rank|ranking|rankings|accreditation|affiliation|approved|aicte|ugc|pci|coa|bpharm|mpharm|llb|law|lab|labs|laboratory|laboratories|workshop|workshops|facility|facilities|amenity|amenities|founder|founded|established|establishment|motto|vision|mission|history|trust|patron|ganpatbhai|shree)\b/i;

const UNIVERSITY_SCOPE_REGEX = /\b(ganpat|guni|university|campus|mehsana|kherva)\b/i;
const EXPLICIT_TOPIC_REGEX = /\b(hostel|hostels|transport|transportation|bus|buses|library|sports|gym|canteen|mess|placement|placements|ranking|rankings|naac|nirf|scholarship|scholarships|btech|mtech|bca|mca|bba|mba|phd|diploma|pharmacy|nursing|physiotherapy|agriculture|marine|maritime|architecture|design|campus|location|reach|wifi|hospital|atm|bank)\b/i;
const PRONOUN_FOLLOWUP_REGEX = /\b(it|its|this|that|they|their|these|those|there|same|here|cost|fee|fees|duration|eligibility|process|admission|timing|timings|structure|syllabus|cutoff|seats?)\b/i;

/**
 * Augments user queries with university context and multi-turn conversational topics.
 * Ensures short, conversational, or follow-up questions retrieve high-confidence embeddings
 * while preserving the original query text for prompt display and LLM answering.
 */
function augmentSearchQuery(queryText, history = []) {
  if (!queryText || typeof queryText !== 'string') return queryText;
  const trimmed = queryText.trim();
  const lower = trimmed.toLowerCase();
  const hasUni = UNIVERSITY_SCOPE_REGEX.test(lower);
  const hasCampusIntent = CAMPUS_INTENT_REGEX.test(lower);
  const hasHistory = Array.isArray(history) && history.length > 0;

  // Extract previous topic if this is a genuine follow-up query (and not a topic switch)
  let previousTopic = '';
  if (hasHistory) {
    const hasPronoun = PRONOUN_FOLLOWUP_REGEX.test(lower);
    const hasExplicitTopic = EXPLICIT_TOPIC_REGEX.test(lower);
    // If the query introduces a new explicit topic without pronouns, it is a topic switch
    const isTopicSwitch = hasExplicitTopic && !hasPronoun;
    const isFollowUp = !isTopicSwitch && (hasPronoun || lower.split(/\s+/).length <= 4);

    if (isFollowUp) {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user' && history[i].content) {
          const rawPrev = history[i].content.replace(/[?!.]/g, '').trim();
          const cleanPrev = rawPrev
            .replace(/\b(hi|hello|hey|namaste|please|tell me about|can you tell me|what is|what are|how about|give me details about|information on|info about)\b/gi, '')
            .trim();
          if (cleanPrev.length >= 2 && cleanPrev.length <= 80) {
            previousTopic = cleanPrev;
            break;
          }
        }
      }
    }
  }

  let augmented = trimmed;
  if (previousTopic && !lower.includes(previousTopic.toLowerCase())) {
    augmented += ` ${previousTopic}`;
  }

  // Add university context if missing and the query has academic intent or active conversation
  if (!hasUni && (hasCampusIntent || hasHistory)) {
    augmented += ' Ganpat University';
  }

  return augmented;
}

async function retrieve(queryText, lang = 'en', history = []) {
  try {
    // If query is in Hindi or Gujarati, translate search terms to English for optimal vector matching
    const baseKeywords = lang !== 'en'
      ? await llm.translateQueryToEnglish(queryText)
      : queryText;

    // Augment search keywords with university scope & conversation history for vector matching
    const searchKeywords = augmentSearchQuery(baseKeywords, history);

    let queryVec = await llm.getQueryEmbedding(searchKeywords);
    let results = vectorStore.query(queryVec, TOP_K).filter(r => r.distance <= DISTANCE_THRESHOLD);

    // Typo & spelling mistake fallback: If no relevant results found, attempt query normalization
    if (!results.length) {
      const corrected = await llm.normalizeOrCorrectQuery(baseKeywords);
      if (corrected && corrected.toLowerCase() !== baseKeywords.toLowerCase()) {
        const fallbackKeywords = augmentSearchQuery(corrected, history);
        const fallbackVec = await llm.getQueryEmbedding(fallbackKeywords);
        const fallbackResults = vectorStore.query(fallbackVec, TOP_K).filter(r => r.distance <= DISTANCE_THRESHOLD);
        if (fallbackResults.length) {
          results = fallbackResults;
        }
      }
    }

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

  // Fast path for pure greetings in English, Hindi, or Gujarati
  if (llm.isPureGreeting(queryText, lang)) {
    return {
      answer: GREETING_ANSWERS[lang] || GREETING_ANSWERS.en,
      sources: [],
      found: true,
      language: lang
    };
  }

  const retrieval = await retrieve(queryText, lang, history);
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
