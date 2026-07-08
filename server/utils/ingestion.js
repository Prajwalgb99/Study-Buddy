// ─── server/utils/ingestion.js ─────────────────────────────────────────────
// THE CORE RAG PIPELINE: PDF → Text → Chunks → Embeddings → MongoDB
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

import { GoogleGenerativeAI } from "@google/generative-ai";
import Chunk from '../models/Chunk.js';
import Document from '../models/Document.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedOne(text, retries = 4) {
  for (let i = 1; i <= retries; i++) {
    try {
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
      if (i < total - 1) await sleep(4200); // 4.2s delay to stay under limit
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
