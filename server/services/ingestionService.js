// ─── server/services/ingestionService.js ─────────────────────────────────────
// THE CORE RAG PIPELINE: PDF → Text → Chunks → Embeddings → MongoDB
//
// Flow:
//   1. Parse PDF bytes into raw text using pdf-parse
//   2. Split text into 800-char chunks with 100-char overlap
//   3. Call Gemini embedding API for each chunk
//   4. Bulk-insert all chunks with embeddings into MongoDB
// ──────────────────────────────────────────────────────────────────────────────
// CHANGE TO:
// ─── server/services/ingestionService.js ─────────────────────────────────────
// MEMORY-EFFICIENT VERSION
// Processes ONE chunk at a time — never holds all embeddings in RAM at once
// Each chunk is embedded then immediately saved to MongoDB and discarded
// ──────────────────────────────────────────────────────────────────────────────
// ─── server/services/ingestionService.js ─────────────────────────────────────
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

import { GoogleGenerativeAI } from "@google/generative-ai";
import Chunk from '../models/Chunk.js';
import Document from '../models/Document.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Changed to gemini-embedding-001 (Stable v1)
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedOne(text, retries = 4) {
  for (let i = 1; i <= retries; i++) {
    try {
      // Force output to 768 to match your MongoDB Atlas Index
      const result = await model.embedContent({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      });
      return result.embedding.values;
    } catch (err) {
      if (i < retries) {
        const isQuota = /429|quota/i.test(err.message);
        const delay = isQuota ? Math.pow(2, i) * 3000 : Math.pow(2, i) * 1000;
        console.log(`      Retry ${i}/${retries} in ${delay / 1000}s`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

export function splitIntoChunks(text, chunkSize = 600, overlap = 80) {
  const chunks = [];
  const cleaned = text
    .replace(/\x00/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned.length) return chunks;

  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunkText = cleaned.substring(start, end).trim();
    if (chunkText.length > 30) {
      chunks.push({ text: chunkText, startChar: start, endChar: end });
    }
    const next = end - overlap;
    start = next <= start ? end : next;
    if (end >= cleaned.length) break;
  }
  return chunks;
}

export async function ingestPDF({ fileBuffer, documentId, userId, docName, subject = 'General' }) {
  console.log(`\n📄 Ingesting: ${docName}`);
  const t0 = Date.now();

  try {
    console.log('   [1/3] Parsing...');
    const pdfData = await pdfParse(fileBuffer);
    const { text: raw, numpages } = pdfData;
    console.log(`       ${numpages} pages, ${raw.length.toLocaleString()} chars`);

    console.log('   [2/3] Chunking...');
    const chunks = splitIntoChunks(raw, 600, 80);
    const total = chunks.length;
    console.log(`       ${total} chunks`);
    if (!total) throw new Error('No text extracted — PDF may be image/scanned.');

    console.log(`   [3/3] Embedding + saving ${total} chunks...`);
    let saved = 0;

    for (let i = 0; i < total; i++) {
      try {
        const embedding = await embedOne(chunks[i].text);
        await Chunk.create({
          documentId,
          userId,
          text: chunks[i].text,
          embedding,
          metadata: {
            chunkIndex: i,
            totalChunks: total,
            documentName: docName,
            subject,
            startChar: chunks[i].startChar,
            endChar: chunks[i].endChar,
          },
        });
        saved++;
        process.stdout.write(`\r       ${saved}/${total} saved...`);
      } catch (err) {
        console.error(`\n       chunk ${i + 1} failed: ${err.message?.substring(0, 120)}`);
      }
      if (i < total - 1) await sleep(4200); // 4.2s delay ensures we stay under 15 RPM limit
    }

    await Document.findByIdAndUpdate(documentId, {
      status: 'ready',
      pageCount: numpages,
      chunkCount: saved,
      charCount: raw.length,
    });

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Done in ${secs}s — ${saved}/${total} chunks saved\n`);
    return { pageCount: numpages, chunkCount: saved };
  } catch (error) {
    console.error(`\n❌ Ingestion failed: ${error.message}`);
    await Document.findByIdAndUpdate(documentId, { status: 'error' });
    throw error;
  }
}