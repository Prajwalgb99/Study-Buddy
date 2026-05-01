# Study Buddy — Agentic RAG Study Assistant

A full-stack MERN application that lets students upload PDF notes and chat with an AI
that answers questions based **only** on their uploaded content — no hallucinations, with full source attribution.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | MongoDB Atlas + Vector Search |
| AI / LLM | Google Gemini 1.5 Flash |
| Embeddings | Gemini `embedding-001` (768 dims) |
| Vector Search | MongoDB Atlas `$vectorSearch` |

---

## Quick Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd study-buddy
npm run install:all
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/study-buddy
GEMINI_API_KEY=your_key_from_aistudio.google.com
JWT_SECRET=any_random_32_char_string
```

### 3. Create the MongoDB Vector Search Index

This is the **most important step** — without it, search won't work.

1. Go to **MongoDB Atlas** → your cluster → **Atlas Search** tab
2. Click **Create Search Index**
3. Select **Atlas Vector Search** → **JSON Editor**
4. Set:
   - **Index name**: `vector_index`
   - **Database**: `study-buddy`
   - **Collection**: `chunks`
5. Paste this JSON definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    },
    {
      "type": "filter",
      "path": "documentId"
    }
  ]
}
```

6. Click **Create Search Index** and wait ~2 minutes for it to build.

### 4. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:5000

---

## How It Works

```
PDF Upload
    │
    ▼
[pdf-parse]  Extract raw text from PDF
    │
    ▼
[Chunker]    Split into 800-char chunks, 100-char overlap
    │
    ▼
[Gemini]     embedding-001 → 768-dim vector per chunk
    │
    ▼
[MongoDB]    Store chunk text + embedding + metadata
    │
    │  (later, on user question)
    ▼
[Gemini]     Embed the user's question → query vector
    │
    ▼
[$vectorSearch]  Find top-3 most similar chunks (cosine)
    │
    ▼
[Study Agent]    Build grounded system prompt from chunks
    │
    ▼
[Gemini Flash]   Generate answer (streaming via SSE)
    │
    ▼
[React UI]       Stream tokens into chat bubble token-by-token
                 Show source attribution panel
```

---

## Project Structure

```
study-buddy/
├── server/
│   ├── server.js                  Express app entry point
│   ├── config/db.js               MongoDB connection
│   ├── models/
│   │   ├── Document.js            PDF metadata
│   │   ├── Chunk.js               Text chunks + embeddings
│   │   └── User.js                Users + ChatHistory
│   ├── services/
│   │   ├── ingestionService.js    PDF → chunks → embeddings → MongoDB
│   │   └── vectorSearchService.js $vectorSearch query
│   ├── agents/studyAgent.js       Agentic loop + Gemini streaming
│   ├── middleware/auth.js         JWT auth
│   └── routes/
│       ├── notes.js               PDF upload/list/delete
│       ├── chat.js                SSE streaming chat
│       └── auth.js                Register/login
└── client/
    └── src/
        ├── App.jsx
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── DashboardPage.jsx  Upload + document list
        │   └── ChatPage.jsx       Streaming chat UI
        ├── hooks/useChat.js       SSE stream management
        └── utils/api.js           Axios + Auth context
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/notes/upload` | Upload PDF (multipart) |
| GET  | `/api/notes` | List user's documents |
| GET  | `/api/notes/:id` | Get one document (poll for status) |
| DELETE | `/api/notes/:id` | Delete document + chunks |
| POST | `/api/chat/stream` | SSE streaming chat |
| GET  | `/api/chat/history/:sessionId` | Get chat history |
| DELETE | `/api/chat/history/:sessionId` | Clear history |

---

## Key Interview Talking Points

- **RAG Pipeline**: PDF → pdf-parse → 800/100 char chunking → Gemini embedding-001 → MongoDB Vector Search
- **$vectorSearch**: MongoDB's native ANN (HNSW) for cosine similarity search with pre-filters
- **Agentic Design**: Intent classifier → tool selection → context builder → grounded prompt
- **Source Grounding**: System prompt instructs Gemini to answer ONLY from retrieved chunks
- **SSE Streaming**: `fetch()` + `ReadableStream` for token-by-token response delivery
- **Security**: JWT, bcrypt, helmet, CORS, rate limiting on chat endpoint
