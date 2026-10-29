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

function load() {
  if (store) return store;

  if (!fs.existsSync(BIN_PATH) || !fs.existsSync(META_PATH)) {
    store = { items: [], vectors: new Float32Array(0), norms: new Float32Array(0), dim: 0 };
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

  const norms = new Float32Array(items.length);
  for (let i = 0; i < items.length; i++) {
    let sum = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) sum += vectors[base + j] * vectors[base + j];
    norms[i] = Math.sqrt(sum) || 1e-9;
  }

  store = { items, vectors, norms, dim };
  return store;
}

function reload() {
  store = null;
  return load();
}

function count() {
  return load().items.length;
}

// Returns the k closest items by cosine distance (1 - cosine similarity), closest first
function query(queryVec, k = 4) {
  const { items, vectors, norms, dim } = load();
  if (!items.length) return [];
  if (queryVec.length !== dim) {
    throw new Error(`Query embedding has ${queryVec.length} dimensions, knowledge base has ${dim}`);
  }

  let qNorm = 0;
  for (let j = 0; j < dim; j++) qNorm += queryVec[j] * queryVec[j];
  qNorm = Math.sqrt(qNorm) || 1e-9;

  const scored = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    let dot = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) dot += vectors[base + j] * queryVec[j];
    scored[i] = { index: i, distance: 1 - dot / (norms[i] * qNorm) };
  }
  scored.sort((a, b) => a.distance - b.distance);

  return scored.slice(0, k).map(({ index, distance }) => ({
    id: items[index].id,
    text: items[index].text,
    metadata: items[index].metadata || {},
    distance
  }));
}

module.exports = { load, reload, count, query };
