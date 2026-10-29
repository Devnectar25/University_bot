# Ganpat University AI Chatbot

AI campus assistant for **Ganpat University**. A static chat page plus a Node.js serverless API, built to deploy on **Vercel**. Answers are grounded in the college knowledge base (RAG) and fall back to general AI knowledge when the knowledge base has nothing relevant.

---

## Quick start (local)

Requires **Node.js 20.6+** and an **OpenRouter API key**.

```bash
npm install            # only installs the Excel reader used by the ingest script
cp .env.example .env   # then put your OPENROUTER_API_KEY in .env
npm run dev            # http://localhost:3000
```

`npm run dev` runs `dev-server.js`, which serves `public/` and runs the `api/` functions the same way Vercel does.

---

## Deploy to Vercel

1. Push this folder to a GitHub repository and import it in Vercel (or run `npx vercel` from this folder).
2. Framework preset: **Other**. No build command is needed; `vercel.json` already sets the output folder to `public`.
3. Under **Settings → Environment Variables**, add:
   - `OPENROUTER_API_KEY` (required)
   - `LLM_MODEL` (optional, default `google/gemini-2.5-flash`)
   - `CHAT_HISTORY_WINDOW` (optional, default `5`)
   - For admin sign-in (optional): `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_SECRET`, and optionally `ADMIN_NAME`, `ADMIN_EMAIL`
4. Deploy. Check `https://<your-app>.vercel.app/api/health`; it should report `knowledge_base_documents: 2699` and `openrouter_configured: true`.

`.vercelignore` keeps `.env`, `node_modules` and the source spreadsheets out of the upload.

---

## Updating the knowledge base

Vercel can't save files at runtime, so re-indexing runs on your computer:

```bash
npm run ingest -- path/to/knowledge_base.xlsx
```

This rebuilds `data/vector_cache.bin` and `data/vector_meta.json`. Commit and redeploy to publish them. Sheets with `Question` and `Answer` columns become Q&A entries; other sheets use every non-empty column.

---

## Project layout

```
public/
  index.html        Chat page (history, edit question, voice input, sign-in card)
  login.html        Admin sign-in page
api/                Vercel serverless functions
  chat.js           POST { message, history } -> { answer, sources }
  health.js         GET status and knowledge-base size
  warmup.js         GET, loads the knowledge base into memory
  login.js / logout.js / me.js   Admin sign-in with a signed cookie
  _lib/             Shared code (not exposed as endpoints)
    vectorStore.js  Loads data/vector_* and runs cosine-similarity search
    llm.js          OpenRouter embeddings and chat calls, prompts and guardrails
    rag.js          Retrieval (top 3, distance <= 0.6) and answer orchestration
    auth.js         Credential check and signed session cookie
data/
  vector_cache.bin  Embeddings (float32, 1536 dimensions)
  vector_meta.json  Text and metadata for each embedding
scripts/ingest.js   Excel -> knowledge base
dev-server.js       Local server mirroring Vercel
vercel.json         Vercel config
```

Conversation history is stored in the browser and sent with each question, because serverless functions don't keep memory between requests.

