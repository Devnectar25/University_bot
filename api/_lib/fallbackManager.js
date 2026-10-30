// LLM Fallback Manager with Automatic Failover, Circuit-Breaker & Key Rotation
// Supports OpenRouter (primary & free fallbacks) and Google Gemini REST API

const LANG_CONFIG = {
  en: { name: 'English', code: 'en' },
  hi: { name: 'Hindi (हिन्दी)', code: 'hi' },
  gu: { name: 'Gujarati (ગુજરાતી)', code: 'gu' }
};

// In-memory circuit-breaker state: Map<candidateId, { failures, cooldownUntil, cooldownSec, lastStatus, lastError }>
const circuitState = new Map();

// Helper to mask sensitive keys in logs (e.g. sk-or-v1-...3db6)
function maskKey(key) {
  if (!key || typeof key !== 'string') return 'none';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

// ── 1. API KEY DISCOVERY & ROTATION ──────────────────────────────────────────

function getOpenRouterKeys() {
  const keys = [];
  if (process.env.OPENROUTER_API_KEY) keys.push(process.env.OPENROUTER_API_KEY.trim());
  if (process.env.OPENROUTER_API_KEYS) {
    process.env.OPENROUTER_API_KEYS.split(',').forEach(k => k.trim() && keys.push(k.trim()));
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (/^OPENROUTER_API_KEY_\w+$/i.test(k) && typeof v === 'string' && v.trim()) {
      keys.push(v.trim());
    }
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function getGeminiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY.trim());
  if (process.env.GOOGLE_API_KEY) keys.push(process.env.GOOGLE_API_KEY.trim());
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(',').forEach(k => k.trim() && keys.push(k.trim()));
  }
  if (process.env.GOOGLE_API_KEYS) {
    process.env.GOOGLE_API_KEYS.split(',').forEach(k => k.trim() && keys.push(k.trim()));
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(GEMINI|GOOGLE)_API_KEY_\w+$/i.test(k) && typeof v === 'string' && v.trim()) {
      keys.push(v.trim());
    }
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

// ── 2. MODEL CONFIGURATION ───────────────────────────────────────────────────

function getOpenRouterModels() {
  if (process.env.OPENROUTER_MODELS) {
    const list = process.env.OPENROUTER_MODELS.split(',').map(m => m.trim()).filter(Boolean);
    if (list.length) return list;
  }
  const primary = (process.env.LLM_MODEL || 'google/gemini-2.5-flash').trim();
  const freeFallbacks = [
    'openrouter/free',
    'google/gemma-4-26b-a4b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free'
  ];
  return Array.from(new Set([primary, ...freeFallbacks]));
}

function getGeminiModels() {
  if (process.env.GEMINI_MODELS) {
    const list = process.env.GEMINI_MODELS.split(',').map(m => m.trim()).filter(Boolean);
    if (list.length) return list;
  }
  const primary = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const fallbacks = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
  return Array.from(new Set([primary, ...fallbacks]));
}

// ── 3. CANDIDATE CHAIN BUILDER ───────────────────────────────────────────────

function buildCandidateList() {
  const orKeys = getOpenRouterKeys();
  const geminiKeys = getGeminiKeys();
  const orModels = getOpenRouterModels();
  const geminiModels = getGeminiModels();

  const candidates = [];

  // Tier 1: Primary OpenRouter model with all available OpenRouter keys
  if (orKeys.length && orModels.length) {
    const primaryOrModel = orModels[0];
    orKeys.forEach((key, idx) => {
      candidates.push({
        id: `openrouter:${primaryOrModel}:key_${idx}`,
        provider: 'openrouter',
        model: primaryOrModel,
        apiKey: key,
        keyMask: maskKey(key),
        tier: 1,
        description: `OpenRouter (${primaryOrModel}) [Key ${idx + 1}/${orKeys.length} ${maskKey(key)}]`
      });
    });
  }

  // Tier 2: Google Gemini API (independent external provider failover)
  if (geminiKeys.length && geminiModels.length) {
    const primaryGeminiModel = geminiModels[0];
    geminiKeys.forEach((key, idx) => {
      candidates.push({
        id: `gemini:${primaryGeminiModel}:key_${idx}`,
        provider: 'gemini',
        model: primaryGeminiModel,
        apiKey: key,
        keyMask: maskKey(key),
        tier: 2,
        description: `Google Gemini API (${primaryGeminiModel}) [Key ${idx + 1}/${geminiKeys.length} ${maskKey(key)}]`
      });
    });
  }

  // Tier 3: OpenRouter Free Models fallback
  if (orKeys.length && orModels.length > 1) {
    for (let i = 1; i < orModels.length; i++) {
      const model = orModels[i];
      orKeys.forEach((key, idx) => {
        candidates.push({
          id: `openrouter:${model}:key_${idx}`,
          provider: 'openrouter',
          model,
          apiKey: key,
          keyMask: maskKey(key),
          tier: 3,
          description: `OpenRouter Free (${model}) [Key ${idx + 1}/${orKeys.length} ${maskKey(key)}]`
        });
      });
    }
  }

  // Tier 4: Google Gemini Secondary Models (if configured)
  if (geminiKeys.length && geminiModels.length > 1) {
    for (let i = 1; i < geminiModels.length; i++) {
      const model = geminiModels[i];
      geminiKeys.forEach((key, idx) => {
        candidates.push({
          id: `gemini:${model}:key_${idx}`,
          provider: 'gemini',
          model,
          apiKey: key,
          keyMask: maskKey(key),
          tier: 4,
          description: `Google Gemini Alternate (${model}) [Key ${idx + 1}/${geminiKeys.length} ${maskKey(key)}]`
        });
      });
    }
  }

  return candidates;
}

// ── 4. CIRCUIT-BREAKER & COOLDOWN LOGIC ───────────────────────────────────────

function isCandidateAvailable(candidateId) {
  const state = circuitState.get(candidateId);
  if (!state) return true; // Healthy / closed
  if (Date.now() >= state.cooldownUntil) {
    // Cooldown expired: move to half-open state for a trial
    return true;
  }
  return false; // In open state: cooling down
}

function recordSuccess(candidateId) {
  circuitState.delete(candidateId);
}

function recordFailure(candidateId, status, errorMsg) {
  let cooldownMs = 45000; // default 45s for 5xx or timeout
  if (status === 429) {
    cooldownMs = 60000; // 60s for rate limit
  } else if (status === 402) {
    cooldownMs = 300000; // 5 mins for credit exhaustion
  } else if (status === 400 || status === 404) {
    cooldownMs = 600000; // 10 mins for deprecated/not found model
  }

  const existing = circuitState.get(candidateId) || { failures: 0 };
  circuitState.set(candidateId, {
    failures: existing.failures + 1,
    cooldownUntil: Date.now() + cooldownMs,
    cooldownSec: Math.round(cooldownMs / 1000),
    lastStatus: status,
    lastError: errorMsg
  });
}

function resetCircuitBreaker() {
  circuitState.clear();
}

function getCircuitStatus() {
  const now = Date.now();
  const summary = {};
  for (const [id, state] of circuitState.entries()) {
    summary[id] = {
      failures: state.failures,
      coolingDown: now < state.cooldownUntil,
      remainingSec: Math.max(0, Math.round((state.cooldownUntil - now) / 1000)),
      lastStatus: state.lastStatus,
      lastError: state.lastError
    };
  }
  return summary;
}

// ── 5. PROVIDER API ADAPTERS ─────────────────────────────────────────────────

// Adapter for OpenRouter (OpenAI-compatible)
async function callOpenRouter(candidate, messages, temperature, maxTokens, timeoutMs, label) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${candidate.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
      'X-Title': 'Ganpat University Chatbot'
    },
    body: JSON.stringify({
      model: candidate.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning: { enabled: false }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let parsedMessage = '';
    try {
      const parsed = JSON.parse(errText);
      parsedMessage = parsed.error?.message || '';
    } catch { }

    const err = new Error(
      `OpenRouter ${label} failed (${res.status}): ${parsedMessage || errText || res.statusText}`
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned empty message content');
  }
  return content.trim();
}

// Adapter for Google Gemini REST API (v1beta generateContent)
async function callGoogleGemini(candidate, messages, temperature, maxTokens, timeoutMs, label) {
  // Convert OpenAI-style messages to Gemini REST format
  let systemInstruction = '';
  const contents = [];

  for (const msg of messages || []) {
    if (!msg || typeof msg.content !== 'string') continue;
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      // Merge consecutive identical roles to comply with Gemini requirements
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n\n' + msg.content;
      } else {
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      }
    }
  }

  // Gemini requires at least one user content item
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  } else if (contents[0].role === 'model') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: Number(temperature ?? 0.2),
      maxOutputTokens: Number(maxTokens || 350)
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate.model)}:generateContent?key=${encodeURIComponent(candidate.apiKey)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let parsedMessage = '';
    try {
      const parsed = JSON.parse(errText);
      parsedMessage = parsed.error?.message || '';
    } catch { }

    const err = new Error(
      `Google Gemini ${label} failed (${res.status}): ${parsedMessage || errText || res.statusText}`
    );
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const candidateObj = data.candidates && data.candidates[0];

  if (!candidateObj) {
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error(`Google Gemini blocked prompt: ${data.promptFeedback.blockReason}`);
    }
    throw new Error('Google Gemini returned no candidates');
  }

  if (candidateObj.finishReason === 'SAFETY' || candidateObj.finishReason === 'RECITATION') {
    throw new Error(`Google Gemini candidate blocked: finishReason = ${candidateObj.finishReason}`);
  }

  const part = candidateObj.content && candidateObj.content.parts && candidateObj.content.parts[0];
  const content = part && part.text;
  if (!content || typeof content !== 'string') {
    throw new Error('Google Gemini returned empty candidate text');
  }
  return content.trim();
}

// ── 6. MAIN FALLBACK EXECUTION ENGINE ─────────────────────────────────────────

async function generateChatCompletion({
  messages,
  temperature = 0.2,
  maxTokens = 350,
  timeoutMs = 25000,
  language = 'en',
  label = 'chat completion'
}) {
  const candidates = buildCandidateList();
  if (!candidates.length) {
    console.error('[LLM Config Error] No OpenRouter or Gemini API keys found in environment.');
    throw new Error('No LLM API keys configured. Please configure OPENROUTER_API_KEY or GEMINI_API_KEY.');
  }

  // Filter candidates: prioritize candidates not currently on cooldown
  const available = candidates.filter(c => isCandidateAvailable(c.id));
  const queue = available.length > 0 ? available : candidates; // If all are cooling down, try queue in priority

  let lastError = null;

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    const startTime = Date.now();

    try {
      console.log(`[LLM Attempt ${i + 1}/${queue.length}] Invoking ${candidate.description}...`);

      let text = '';
      if (candidate.provider === 'openrouter') {
        text = await callOpenRouter(candidate, messages, temperature, maxTokens, timeoutMs, label);
      } else if (candidate.provider === 'gemini') {
        text = await callGoogleGemini(candidate, messages, temperature, maxTokens, timeoutMs, label);
      }

      if (!text || typeof text !== 'string' || !text.trim()) {
        throw new Error('Empty response string returned');
      }

      const elapsed = Date.now() - startTime;
      recordSuccess(candidate.id);
      console.log(`[LLM Success] Generated ${label} via ${candidate.description} in ${elapsed}ms`);

      return {
        text: text.trim(),
        provider: candidate.provider,
        model: candidate.model,
        candidateId: candidate.id,
        attempts: i + 1
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const status = err.status || (err.name === 'TimeoutError' || err.name === 'AbortError' ? 408 : 500);

      recordFailure(candidate.id, status, err.message);

      console.warn(
        `[LLM Fallback] ${candidate.description} failed after ${elapsed}ms ` +
        `[HTTP ${status}]: ${err.message}. ` +
        (i < queue.length - 1 ? `Failing over to candidate ${i + 2}...` : `All candidates in chain exhausted.`)
      );

      lastError = err;
    }
  }

  console.error(`[LLM Failover Exhausted] All ${queue.length} configured LLM candidates failed.`);

  // Return a graceful, user-friendly fallback message without exposing stack traces or API keys
  const friendlyRefusals = {
    en: "I apologize, but our AI campus assistant is currently experiencing high query volumes or momentary network delays. Please try asking again in a few moments, or visit the official [Ganpat University Website](https://www.ganpatuniversity.ac.in).",
    hi: "क्षमा करें, वर्तमान में हमारे एआई कैंपस सहायक पर अधिक ट्रैफिक या तकनीकी समस्या है। कृपया कुछ पलों बाद पुनः प्रयास करें या [गणपत यूनिवर्सिटी की आधिकारिक वेबसाइट](https://www.ganpatuniversity.ac.in) देखें।",
    gu: "દિલગીર છીએ, હાલમાં અમારા AI કેમ્પસ સહાયક પર વધુ ટ્રાફિક અથવા નેટવર્ક સમસ્યા છે. કૃપા કરીને થોડીવાર પછી ફરીથી પ્રયાસ કરો અથવા [ગણપત યુનિવર્સિટીની સત્તાવાર વેબસાઇટ](https://www.ganpatuniversity.ac.in) ની મુલાકાત લો."
  };

  return {
    text: friendlyRefusals[language] || friendlyRefusals.en,
    provider: 'fallback-safety',
    model: 'none',
    error: lastError ? lastError.message : 'All LLM providers failed',
    attempts: queue.length
  };
}

module.exports = {
  generateChatCompletion,
  buildCandidateList,
  getOpenRouterKeys,
  getGeminiKeys,
  getCircuitStatus,
  resetCircuitBreaker
};

