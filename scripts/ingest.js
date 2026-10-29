// Rebuilds the knowledge base from Excel files in docs/ or specified files/directories.
// Usage:
//   npm run ingest                     (auto-scans all .xlsx/.xls in docs/)
//   npm run ingest -- docs/guni_qa_dataset.xlsx
//   npm run ingest -- docs/
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { embedTexts } = require('../api/_lib/llm');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DOCS_DIR = path.join(ROOT_DIR, 'docs');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MAX_CHARS = 900;
const OVERLAP = 150;

function normalize(val) {
  return val === undefined || val === null ? '' : String(val).trim();
}

function findKey(row, ...candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

// Parses an individual workbook into standardized document objects
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
      const rowId = (rawRow.__rowNum__ !== undefined ? rawRow.__rowNum__ + 1 : docs.length + 1);

      const questionVal = findKey(row, 'Question', 'Query', 'Prompt');
      const answerVal = findKey(row, 'Answer', 'Response');
      const contentTextVal = findKey(row, 'Content Text', 'Content_Text', 'Content');

      if (questionVal !== undefined && answerVal !== undefined) {
        // Q&A document format (e.g. guni_qa_dataset.xlsx)
        const question = normalize(questionVal);
        const answer = normalize(answerVal);
        if (!question && !answer) continue;

        const category = normalize(findKey(row, 'Category', 'Category/Department')) || sheetName;
        const pageTitle = normalize(findKey(row, 'Source Page', 'Source_Page', 'Page Title', 'Page_Title'));
        const url = normalize(findKey(row, 'Source URL', 'Source_URL', 'Page URL', 'Page_URL', 'URL'));
        const department = normalize(findKey(row, 'Department')) || 'N/A';

        let text = `Question: ${question}\nAnswer: ${answer}`;
        if (category && category !== 'Sheet1') text += `\nCategory: ${category}`;
        if (pageTitle) text += `\nSource Page: ${pageTitle}`;
        if (url) text += `\nURL: ${url}`;

        docs.push({
          doc_type: 'qa',
          headerPrefix: `Question: ${question}\n`,
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: category || 'General',
            page_title: pageTitle || 'N/A',
            section: '',
            url: url || '',
            department,
            doc_type: 'qa'
          }
        });
      } else if (contentTextVal !== undefined) {
        // Raw scraped web page format (e.g. guni_raw_scraped_data.xlsx)
        const content = normalize(contentTextVal);
        if (!content) continue;

        const pageTitle = normalize(findKey(row, 'Page Title', 'Page_Title', 'Title')) || sheetName;
        const section = normalize(findKey(row, 'Section Heading', 'Section_Heading', 'Heading'));
        const url = normalize(findKey(row, 'Page URL', 'Page_URL', 'URL'));

        let text = `University Page: ${pageTitle}`;
        if (section) text += `\nSection: ${section}`;
        if (url) text += `\nURL: ${url}`;
        text += `\nContent: ${content}`;

        const headerPrefix = `University Page: ${pageTitle}${section ? ' - ' + section : ''}\n`;

        docs.push({
          doc_type: 'scraped_page',
          headerPrefix,
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: pageTitle,
            page_title: pageTitle,
            section: section || '',
            url: url || '',
            department: 'N/A',
            doc_type: 'scraped_page'
          }
        });
      } else {
        // Generic tabular format
        const text = Object.entries(row)
          .filter(([col, val]) => normalize(val) && col.toLowerCase() !== 'content length' && col !== '__rowNum__')
          .map(([col, val]) => `${col}: ${normalize(val)}`)
          .join('\n');
        if (!text.trim()) continue;

        docs.push({
          doc_type: 'generic',
          headerPrefix: '',
          text,
          metadata: {
            source: fileName,
            sheet_name: sheetName,
            row_id: rowId,
            category: sheetName,
            page_title: sheetName,
            section: '',
            url: '',
            department: 'N/A',
            doc_type: 'generic'
          }
        });
      }
    }
  }
  return docs;
}

// Splits long documents into overlapping chunks, maintaining header context across chunks
function chunkDocument(doc) {
  const { text, metadata, headerPrefix = '' } = doc;
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

    // Preserve the contextual header if chunk starts mid-text
    const fullText = (start > 0 && headerPrefix && !chunkText.startsWith(headerPrefix))
      ? (headerPrefix + chunkText.trim())
      : chunkText.trim();

    chunks.push({ text: fullText, metadata: { ...metadata, chunk_index: chunks.length } });
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
  const source = String(meta.source || 'unknown').replace(/[\s.]+/g, '_');
  const sheet = String(meta.sheet_name || 'sheet').replace(/[\s.]+/g, '_');
  return `doc_${source}_${sheet}_row_${meta.row_id}_chunk_${meta.chunk_index}`;
}

// Collect all Excel files from arguments or default docs folder
function resolveTargetFiles(args) {
  const targets = args.length ? args : [DEFAULT_DOCS_DIR];
  const filePaths = [];

  for (const target of targets) {
    const resolved = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
    if (!fs.existsSync(resolved)) {
      console.warn(`[Warning] Path does not exist: ${resolved}`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(resolved)
        .filter(f => !f.startsWith('~$') && (f.endsWith('.xlsx') || f.endsWith('.xls')))
        .map(f => path.join(resolved, f));
      filePaths.push(...files);
    } else if (stat.isFile() && (resolved.endsWith('.xlsx') || resolved.endsWith('.xls'))) {
      filePaths.push(resolved);
    }
  }

  return [...new Set(filePaths)];
}

async function main() {
  const args = process.argv.slice(2);
  const files = resolveTargetFiles(args);

  if (!files.length) {
    console.error('No Excel files found to ingest. Place .xlsx files in docs/ or provide path.');
    process.exit(1);
  }

  console.log(`Found ${files.length} Excel file(s) for ingestion:`);
  files.forEach(f => console.log(`  - ${path.basename(f)} (${f})`));

  const allDocs = [];
  for (const file of files) {
    const docs = parseWorkbook(file);
    console.log(`  Parsed ${docs.length} entries from ${path.basename(file)}`);
    allDocs.push(...docs);
  }

  const chunks = allDocs.flatMap(chunkDocument);
  if (!chunks.length) {
    console.error('No valid content found across the Excel files.');
    process.exit(1);
  }

  console.log(`Total parsed entries: ${allDocs.length} -> Generated ${chunks.length} chunks.`);
  console.log(`Generating embeddings via OpenRouter in batches...`);

  const embeddings = await embedTexts(chunks.map(c => c.text));
  const dim = embeddings[0].length;
  const vectors = new Float32Array(chunks.length * dim);
  embeddings.forEach((emb, i) => vectors.set(emb, i * dim));

  const meta = {
    mtime: Date.now(),
    count: chunks.length,
    sources: files.map(f => path.basename(f)),
    items: chunks.map(c => ({ id: chunkId(c.metadata), text: c.text, metadata: c.metadata }))
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const binPath = path.join(DATA_DIR, 'vector_cache.bin');
  const metaPath = path.join(DATA_DIR, 'vector_meta.json');

  fs.writeFileSync(binPath + '.tmp', Buffer.from(vectors.buffer));
  fs.writeFileSync(metaPath + '.tmp', JSON.stringify(meta, null, 2));
  fs.renameSync(binPath + '.tmp', binPath);
  fs.renameSync(metaPath + '.tmp', metaPath);

  const binSizeMb = (fs.statSync(binPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\nSuccessfully built Ganpat University Knowledge Base:`);
  console.log(`  - Chunks: ${chunks.length}`);
  console.log(`  - Dimensions: ${dim}`);
  console.log(`  - Vector cache: ${binPath} (${binSizeMb} MB)`);
  console.log(`  - Metadata: ${metaPath}`);
}

main().catch(err => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
