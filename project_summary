# Project Study Guide: Study Buddy (Agentic RAG Assistant)

This document is a comprehensive technical summary of **Study Buddy**, a MERN stack application integrated with Google Gemini to create an Agentic Retrieval-Augmented Generation (RAG) assistant for student notes. Use this guide to prepare for your interview and to plan future enhancements.

---

## 1. System Architecture Diagram

```mermaid
graph TD
    %% Upload Pipeline
    subgraph "Ingestion Pipeline (Upload)"
        A[User Uploads PDF] --> B[Express Notes Route]
        B -->|Async Background| C[pdf-parse: Text Extraction]
        C --> D[Chunker: 600-char, 80-char overlap]
        D --> E[Gemini API: gemini-embedding-001]
        E -->|768-dim Vectors| F[(MongoDB Atlas: Chunks Collection)]
    end

    %% Query Pipeline
    subgraph "Retrieval & Generation (Query)"
        G[User Types Question] --> H[Express Chat Route]
        H --> I[Intent Classifier: Tool Selection]
        H --> J[Embed Query: gemini-embedding-001]
        J --> K[MongoDB Atlas: $vectorSearch]
        F -->|Top-3 Matches| K
        K --> L[Study Agent: Context Grounding]
        L --> M[Gemini 2.5 Flash Lite: Inference]
        M -->|Token Stream SSE| N[React Frontend: Server-Sent Events]
        N --> O[Chat UI & Source Attributions]
    end
```

---

## 2. Tech Stack Overview

| Component | Technology | Role / Explanation |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS | High-performance SPA with modern responsive UI/UX and real-time streaming displays. |
| **Backend** | Node.js, Express | REST API and Server-Sent Events (SSE) streaming server. |
| **Database** | MongoDB Atlas | Stores user documents, metadata, chat history, and vector embeddings. |
| **Vector Search**| MongoDB Atlas Vector Search | Built-in Approximate Nearest Neighbor (ANN) index utilizing Cosine Similarity. |
| **Embedding API**| Gemini `gemini-embedding-001` | Generates dense 768-dimensional vectors from text chunks. |
| **LLM Inference** | Gemini `gemini-2.5-flash-lite` | Multi-turn reasoning, intent classification, and streaming generation. |
| **Libraries** | `pdf-parse`, `multer`, `jsonwebtoken`, `bcryptjs` | PDF raw text parsing, file uploading, user authorization, and password hashing. |

---

## 3. Deep-Dive: How Ingestion Works

The core of the RAG system lies in transforming raw files into searchable vectors. The ingestion pipeline runs asynchronously in the background so that the upload API can return an immediate response.

### Step-by-Step Flow:
1. **File Upload**: The client uploads a PDF using `multipart/form-data` handled by `multer`. The server validates the format and saves it to an uploads folder.
2. **Database Registration**: The server immediately creates a `Document` record in MongoDB with `status: 'processing'` and returns a `202 Accepted` status code.
3. **Background Parsing**: An asynchronous self-executing function reads the uploaded file buffer, parses it using `pdf-parse`, and extracts the raw text.
4. **Text Chunking**:
   - The raw text is cleaned of null characters and excessive whitespace.
   - It is sliced into overlapping chunks using the `splitIntoChunks` utility:
     - **Chunk Size**: `600` characters.
     - **Overlap**: `80` characters (ensures concepts aren't cut in half at boundaries).
5. **Embedding & Rate Limit Handling**:
   - For each chunk, the server calls `gemini-embedding-001` with `outputDimensionality: 768`.
   - To comply with Gemini's **15 Requests-Per-Minute (RPM)** free-tier rate limit, the system introduces a **4.2-second sleep delay** between chunk requests.
   - It uses **Exponential Backoff** retries for network or quota errors (status 429).
6. **Database Write**: Each chunk is immediately saved in the `chunks` collection along with the 768-dimensional `embedding` array, parent `documentId`, `userId`, and page metadata.
7. **Status Update**: Upon completion, the parent `Document` status transitions to `'ready'`, caching page, character, and chunk counts.

---

## 4. Deep-Dive: Vector Search & Agentic Loop

When a user asks a question in the chat interface, the query undergoes intent classification, retrieval, grounding, and streaming execution.

### Step-by-Step Flow:
1. **Intent Classification**:
   - `studyAgent.js` first matches the question against regex rules to classify intent:
     - `/test me|quiz|mcq.../` &rarr; `generate_quiz`
     - `/summar|overview|tldr.../` &rarr; `summarize_document`
     - `/explain|what is|define.../` &rarr; `explain_concept`
     - Default &rarr; `search_notes`
2. **Query Embedding**:
   - The user's question is embedded into a 768-dimensional query vector using `gemini-embedding-001`.
3. **MongoDB Atlas `$vectorSearch`**:
   - Performs Approximate Nearest Neighbor (ANN) search inside the MongoDB aggregation pipeline:
     - **Path**: `embedding` (runs search against the 768 floats).
     - **Filter**: Security-scoped search constrained to the active `userId` and `documentId`.
     - **Similarity**: Cosine Similarity.
     - **Candidates**: Evaluates `topK * 15` candidates (HNSW graph pathing).
     - **Score Threshold**: Discards chunks with a similarity score below `0.5` (filters noise).
4. **Context Grounding & System Prompting**:
   - The retrieved chunks are formatted into a structured block:
     ```
     [SOURCE 1] Lecture_Notes.pdf | Chunk 3/10 | Match: 84%
     <extracted chunk text>
     ```
   - A strict **System Prompt** is built instructing Gemini:
     - Answer *ONLY* using the retrieved chunks.
     - If the information isn't present, respond: *"I couldn't find this in your notes."*
     - Never make up facts (anti-hallucination guardrail).
     - Dynamically append the specific task (e.g., generate a 5-question MCQ, write bulleted summaries, or explain a concept).
5. **Streaming SSE Response**:
   - The server initiates a Server-Sent Events (SSE) connection by configuring HTTP headers:
     - `Content-Type: text/event-stream`
     - `Connection: keep-alive`
     - `Cache-Control: no-cache`
   - Gemini's `sendMessageStream` is invoked to retrieve tokens incrementally.
   - The server pushes two event payloads:
     1. `metadata`: The source documents, match scores, and tools utilized (pushed immediately so the UI lists sources before generation finishes).
     2. `chunk`: Real-time text tokens pushed as they arrive from Gemini.
   - A keep-alive heartbeat ping (`: ping`) is sent every 15 seconds to prevent gateway timeouts.
6. **Chat History Persistence**:
   - When the stream ends, the exchange is appended to the user's `ChatHistory` collection for context continuity.

---

## 5. Front-End Hook: `useChat.js`

The frontend manages the connection seamlessly using a custom React hook:
- **`sendMessage(question)`**:
  - Automatically generates client-side UUIDs for messages.
  - Updates state immediately to show the user's message and a loading/typing indicator.
  - Initiates a standard `fetch` call to the stream route.
  - Uses a **`ReadableStream` reader** to parse the binary chunk packets incoming from the browser socket.
  - Splits packets by `\n\n` (SSE boundary), parses events, and updates React states:
    - `chunk` events append text directly to the active response message.
    - `metadata` events populate references in the sidebar.
- **`AbortController` Integration**: Allows students to cancel an in-progress generation instantly by clicking "Stop Generating", stopping network traffic immediately.

---

## 6. Key Interview Talking Points

If asked about this project in an interview, be sure to highlight these sophisticated engineering decisions:

*   **Asynchronous Non-Blocking Processing**: The server does not block the client upload thread during ingestion. The API returns status code `202 Accepted` immediately, offloading the parsing and embedding steps to a background handler while the UI polls for status.
*   **Memory-Efficient Ingestion Pipeline**: Instead of batch-embedding the entire PDF and storing all embeddings in RAM at once, the pipeline process is customized to stream *one chunk at a time*. Each chunk is embedded, immediately inserted into MongoDB, and garbage-collected, preventing memory exhaustion on small server instances.
*   **MongoDB Atlas Native Vector Search**: There is no need for a separate vector database (like Pinecone or Chroma). Using Atlas native `$vectorSearch` avoids complex synchronization architectures, allowing transaction-safe filters (indexing by `userId` and `documentId` fields in the pre-filter stage) in a single database.
*   **Robust Rate Limiting**: The system implements general rate limiters (100 requests per 15 minutes) and specialized chat limiters (20 AI messages per minute) to guard the API against DDOS attacks and API quota abuse.
*   **Anti-Hallucination & System Prompt Grounding**: By instructing Gemini to answer ONLY from the context chunks and mapping sources directly to answers, the system ensures grounded responses and reliable attributions.

---

## 7. Strategic Improvements to Suggest in an Interview

Show that you understand production-grade AI system limitations by discussing these potential enhancements:

### 1. Hybrid Search (Vector + Keyword BM25)
> [!NOTE]
> **Problem**: Vector search is excellent for matching concepts, but struggles with specific numbers, acronyms, code identifiers, or exact names (e.g., searching for "EC2" might return "virtual machines" but miss specific mentions of the letters "EC2").
> **Solution**: Integrate MongoDB Atlas Search `$search` (Lucene-based full-text keyword matching) and combine the search results using Reciprocal Rank Fusion (RRF) with the `$vectorSearch` results.

### 2. OCR (Optical Character Recognition) Integration
> [!IMPORTANT]
> **Problem**: If a student uploads a scanned copy of textbook pages or a handwritten lecture slide, `pdf-parse` extracts an empty string, causing ingestion to fail.
> **Solution**: Integrate an OCR library like `tesseract.js` or a Cloud OCR engine in the background extraction pipeline. If `pdf-parse` yields less than a threshold character count, fallback to extracting pages as images and running OCR.

### 3. Distributed Queueing (BullMQ + Redis)
> [!WARNING]
> **Problem**: Currently, background ingestion uses an unmanaged Express IIFE. If the server crashes mid-ingestion, the state is permanently stuck at "processing," and the job is lost.
> **Solution**: Introduce a task queue (like Redis-backed `BullMQ`). When an upload occurs, a job is pushed to the queue. Separate worker processes pick up the jobs, providing automatic retries, concurrency limits, and persistence.

### 4. Advanced Chunking (Semantic & Parent-Child Chunks)
> [!TIP]
> **Problem**: Slicing text at static character boundaries (600 characters) can break sentences in half, damaging the semantics of the text.
> **Solution**:
> - **Semantic Chunking**: Parse text into sentences and merge sentences based on cosine similarity of their embedding values, splitting only when a topic change is detected.
> - **Parent-Child Chunking**: Store small chunks (100 chars) for high-precision retrieval matching, but link them to a larger parent chunk (1000 chars) containing surrounding context, which is what gets sent to the LLM.

### 5. Cohere / Gemini Re-ranking
> [!NOTE]
> **Problem**: The top-3 chunks returned by vector search are not always sorted in the optimal order for the LLM, or may contain redundant text.
> **Solution**: Retrieve a larger subset of chunks (e.g., Top-15) and pass them through a lightweight reranker model (like Cohere Rerank or a Gemini instruction) to select the absolute best 3 context passages.
