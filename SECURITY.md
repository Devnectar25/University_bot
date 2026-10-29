# Security Notes - Ganpat University RAG Chatbot

How the chatbot protects secrets, validates input, and limits misuse.

---

## 1. Secrets

- `OPENROUTER_API_KEY`, `ADMIN_PASSWORD` and `AUTH_SECRET` live only in server-side environment variables (`.env` locally, Project Settings on Vercel). They are never sent to the browser.
- `.env` is excluded by `.gitignore` and `.vercelignore`.
- The browser only talks to the functions in `api/`, which return answers, source metadata, and the signed-in user's public details.

---

## 2. Input validation (`api/chat.js`)

- Requests larger than **50 KB** are rejected with `413`.
- HTML tags are stripped from the question; empty or tag-only questions are rejected with `400`.
- Questions are limited to **2,000 characters**.
- Conversation history sent by the browser is filtered to `user`/`assistant` turns, limited to the last `CHAT_HISTORY_WINDOW` turns, and each turn is capped at 4,000 characters.

---

## 3. Prompt injection guardrails (`api/_lib/llm.js`)

- Retrieved context and the question are wrapped in explicit `[Retrieved Context]` and `[Student Question]` blocks, and the model is told to treat them as plain data.
- The system prompt tells the model to ignore attempts to override its rules, never reveal its instructions, and reply with a fixed refusal message when it detects an injection attempt.

---

## 4. Admin sign-in (`api/_lib/auth.js`)

- Credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD`; sign-in is disabled when they or `AUTH_SECRET` are missing.
- Credential and signature checks use constant-time comparison.
- The session is an HMAC-signed cookie (`HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS) that expires after 7 days. Tampered or expired cookies are ignored.

---

## 5. Known limits

- **No rate limiting.** Serverless functions don't share memory, so per-visitor limits need an external store (for example Vercel KV / Upstash) or Vercel's firewall rules. Monitor OpenRouter usage once the site is public.
- **Single admin account.** There is no user database; add one before giving accounts to students.
