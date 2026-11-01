const fs = require('fs');
const path = require('path');

// Knowledge base built by scripts/ingest.js:
//   vector_cache.bin  - all embeddings as consecutive float32 values (count x dim)
//   vector_meta.json  - { mtime, count, items: [{ id, text, metadata }] } in the same order
const DATA_DIR = path.join(process.cwd(), 'data');
const BIN_PATH = path.join(DATA_DIR, 'vector_cache.bin');
const META_PATH = path.join(DATA_DIR, 'vector_meta.json');

// Loaded once per server instance and reused across requests
let store = null;

// Inverted index tokenizer for exact keywords, acronyms and terms
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F\u0A80-\u0AFF]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function buildBm25Index(items) {
  const N = items.length;
  const docLengths = new Array(N);
  const termDocFreq = new Map();
  const termDocTf = new Map();

  let totalLength = 0;
  for (let i = 0; i < N; i++) {
    const raw = `${items[i].metadata?.page_title || ''} ${items[i].metadata?.section || ''} ${items[i].metadata?.category || ''} ${items[i].text}`;
    const tokens = tokenize(raw);
    docLengths[i] = tokens.length;
    totalLength += tokens.length;

    const seenInDoc = new Set();
    for (const t of tokens) {
      if (!termDocTf.has(t)) termDocTf.set(t, new Map());
      const tfMap = termDocTf.get(t);
      tfMap.set(i, (tfMap.get(i) || 0) + 1);

      if (!seenInDoc.has(t)) {
        seenInDoc.add(t);
        termDocFreq.set(t, (termDocFreq.get(t) || 0) + 1);
      }
    }
  }

  const avgdl = totalLength / (N || 1);
  return { docLengths, avgdl, termDocFreq, termDocTf, N };
}

function load() {
  if (store) return store;

  if (!fs.existsSync(BIN_PATH) || !fs.existsSync(META_PATH)) {
    store = { items: [], vectors: new Float32Array(0), norms: new Float32Array(0), dim: 0, bm25Index: null };
    return store;
  }

  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const items = meta.items || [];
  const buf = fs.readFileSync(BIN_PATH);

  // Copy into an aligned buffer; Float32Array needs a 4-byte aligned offset
  const vectors = new Float32Array(buf.length / 4);
  new Uint8Array(vectors.buffer).set(buf);

  const dim = items.length ? vectors.length / items.length : 0;
  if (items.length && !Number.isInteger(dim)) {
    throw new Error(`vector_cache.bin does not match vector_meta.json (${vectors.length} values for ${items.length} items)`);
  }

  // Pre-normalize all document vectors to unit length so cosine distance is exactly 1 - dotProduct
  for (let i = 0; i < items.length; i++) {
    let sum = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) sum += vectors[base + j] * vectors[base + j];
    const invNorm = 1 / (Math.sqrt(sum) || 1e-9);
    for (let j = 0; j < dim; j++) vectors[base + j] *= invNorm;
  }

  const bm25Index = buildBm25Index(items);
  store = { items, vectors, dim, bm25Index };
  return store;
}

function reload() {
  store = null;
  return load();
}

function count() {
  return load().items.length;
}

// Hybrid Search: Combines Dense Vector Cosine Similarity with BM25 Keyword Scoring via RRF
function query(queryVec, k = 4, queryText = '') {
  const { items, vectors, dim, bm25Index } = load();
  if (!items.length) return [];
  if (queryVec.length !== dim) {
    throw new Error(`Query embedding has ${queryVec.length} dimensions, knowledge base has ${dim}`);
  }

  // Pre-normalize query vector once
  let qSum = 0;
  for (let j = 0; j < dim; j++) qSum += queryVec[j] * queryVec[j];
  const invQNorm = 1 / (Math.sqrt(qSum) || 1e-9);
  const qUnit = new Float32Array(dim);
  for (let j = 0; j < dim; j++) qUnit[j] = queryVec[j] * invQNorm;

  const scored = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    let dot = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) dot += vectors[base + j] * qUnit[j];
    scored[i] = {
      index: i,
      distance: 1 - dot,
      bm25Score: 0,
      rrfScore: 0
    };
  }

  // If queryText provided and BM25 index ready, perform Reciprocal Rank Fusion (RRF)
  if (queryText && typeof queryText === 'string' && bm25Index) {
    const queryTokens = tokenize(queryText);
    const { docLengths, avgdl, termDocFreq, termDocTf, N } = bm25Index;
    const k1 = 1.2;
    const b = 0.75;

    for (const token of queryTokens) {
      const df = termDocFreq.get(token) || 0;
      if (!df) continue;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const tfMap = termDocTf.get(token);
      if (!tfMap) continue;

      for (const [docIdx, tf] of tfMap.entries()) {
        const len = docLengths[docIdx];
        const normTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (len / avgdl)));
        scored[docIdx].bm25Score += idf * normTf;
      }
    }

    // Rank by vector distance (dense rank: 0 to N-1)
    scored.sort((a, b) => a.distance - b.distance);
    for (let rank = 0; rank < scored.length; rank++) {
      scored[rank].vectorRank = rank;
    }

    // Rank by BM25 score descending (sparse rank: 0 to N-1)
    scored.sort((a, b) => b.bm25Score - a.bm25Score);
    for (let rank = 0; rank < scored.length; rank++) {
      scored[rank].bm25Rank = rank;
    }

    // Reciprocal Rank Fusion with dense weight 0.65, sparse weight 0.35
    const alpha = 0.65;
    for (let i = 0; i < scored.length; i++) {
      const vecRRF = 1 / (60 + scored[i].vectorRank);
      const bm25RRF = scored[i].bm25Score > 0 ? (1 / (60 + scored[i].bm25Rank)) : 0;
      scored[i].rrfScore = (alpha * vecRRF) + ((1 - alpha) * bm25RRF);

      // High keyword overlap gives a confidence bonus to distance
      if (scored[i].bm25Score > 2.0) {
        scored[i].distance = Math.max(0, scored[i].distance - Math.min(0.12, scored[i].bm25Score * 0.015));
      }
    }

    // Sort by final fused RRF score
    scored.sort((a, b) => b.rrfScore - a.rrfScore);
  } else {
    // Pure dense vector distance
    scored.sort((a, b) => a.distance - b.distance);
  }

  return scored.slice(0, k).map(({ index, distance }) => ({
    id: items[index].id,
    text: items[index].text,
    metadata: items[index].metadata || {},
    distance
  }));
}

module.exports = { load, reload, count, query };
