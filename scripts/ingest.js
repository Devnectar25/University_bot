// Rebuilds the knowledge base from an Excel file.
// Usage: npm run ingest -- path/to/file.xlsx
// Writes data/vector_cache.bin and data/vector_meta.json; redeploy afterwards to publish them.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { embedTexts } = require('../api/_lib/llm');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MAX_CHARS = 800;
const OVERLAP = 150;

function normalize(val) {
  return val === undefined || val === null ? '' : String(val).trim();
}

// Each row becomes one document: "Question: ...\nAnswer: ..." when those columns exist,
// otherwise every non-empty column as "Column: value" lines
function parseWorkbook(filePath) {
  const fileName = path.basename(filePath);
  const workbook = XLSX.readFile(filePath);
  const docs = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
    if (!rows.length) continue;

    for (const rawRow of rows) {
      const row = {};
      for (const [key, val] of Object.entries(rawRow)) row[String(key).trim()] = val;
      // Excel row number (header is row 1); sheet_to_json skips blank rows, so use its own counter
      const rowId = rawRow.__rowNum__ + 1;
      const hasQA = 'Question' in row && 'Answer' in row;

      if (hasQA) {
        const question = normalize(row.Question);
        const answer = normalize(row.Answer);
        if (!question && !answer) continue;
        const category = normalize(row.Category) || normalize(row['Category/Department']);
        const department = normalize(row.Department);
        docs.push({
          text: `Question: ${question}\nAnswer: ${answer}`,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: category || sheetName,
            department: department || 'N/A'
          }
        });
      } else {
        const text = Object.entries(row)
          .filter(([, val]) => normalize(val))
          .map(([col, val]) => `${col}: ${normalize(val)}`)
          .join('\n');
        if (!text.trim()) continue;
        docs.push({
          text,
          metadata: { source: fileName, sheet_name: sheetName, row_id: rowId, category: sheetName, department: 'N/A' }
        });
      }
    }
  }
  return docs;
}

// Splits long documents into overlapping chunks, avoiding cuts in the middle of words
function chunkDocument(doc) {
  const { text, metadata } = doc;
  if (text.length <= MAX_CHARS) {
    return [{ text, metadata: { ...metadata, chunk_index: 0, total_chunks: 1, char_length: text.length } }];
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + MAX_CHARS;
    let chunkText = text.slice(start, end);
    if (end < text.length && chunkText.includes(' ')) {
      const lastSpace = chunkText.lastIndexOf(' ');
      if (lastSpace > MAX_CHARS * 0.6) {
        end = start + lastSpace + 1;
        chunkText = text.slice(start, end);
      }
    }
    chunks.push({ text: chunkText.trim(), metadata: { ...metadata, chunk_index: chunks.length } });
    if (end >= text.length) break;
    start = end - OVERLAP;
  }
  for (const c of chunks) {
    c.metadata.total_chunks = chunks.length;
    c.metadata.char_length = c.text.length;
  }
  return chunks;
}

function chunkId(meta) {
  const source = String(meta.source || 'unknown').replace(/ /g, '_');
  const sheet = String(meta.sheet_name || 'sheet').replace(/ /g, '_');
  return `doc_${source}_${sheet}_row_${meta.row_id}_chunk_${meta.chunk_index}`;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run ingest -- path/to/file.xlsx');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const docs = parseWorkbook(filePath);
  const chunks = docs.flatMap(chunkDocument);
  if (!chunks.length) {
    console.error('No rows with content were found in the workbook.');
    process.exit(1);
  }
  console.log(`Parsed ${docs.length} rows into ${chunks.length} chunks. Creating embeddings...`);

  const embeddings = await embedTexts(chunks.map(c => c.text));
  const dim = embeddings[0].length;
  const vectors = new Float32Array(chunks.length * dim);
  embeddings.forEach((emb, i) => vectors.set(emb, i * dim));

  const meta = {
    mtime: Date.now(),
    count: chunks.length,
    items: chunks.map(c => ({ id: chunkId(c.metadata), text: c.text, metadata: c.metadata }))
  };

  // Write to temp files first so a failure never leaves a half-written knowledge base
  const binPath = path.join(DATA_DIR, 'vector_cache.bin');
  const metaPath = path.join(DATA_DIR, 'vector_meta.json');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(binPath + '.tmp', Buffer.from(vectors.buffer));
  fs.writeFileSync(metaPath + '.tmp', JSON.stringify(meta));
  fs.renameSync(binPath + '.tmp', binPath);
  fs.renameSync(metaPath + '.tmp', metaPath);

  console.log(`Done. Knowledge base now has ${chunks.length} entries (${dim} dimensions).`);
  console.log('Redeploy to Vercel to publish the new knowledge base.');
}

main().catch(err => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
