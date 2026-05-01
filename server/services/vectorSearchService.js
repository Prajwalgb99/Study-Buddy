// ─── server/services/vectorSearchService.js ──────────────────────────────────
// MongoDB Atlas Vector Search — finds the most semantically similar chunks
// Uses the $vectorSearch aggregation stage (Atlas-only feature)
// ─── server/services/vectorSearchService.js ──────────────────────────────────
// ─── server/services/vectorSearchService.js ──────────────────────────────────
import { GoogleGenerativeAI } from "@google/generative-ai";
import Chunk from '../models/Chunk.js';
import mongoose from 'mongoose';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Changed to gemini-embedding-001 (Stable v1)
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

async function embedQuery(query) {
  try {
    // Force output to 768 to match your MongoDB Atlas Index
    const result = await model.embedContent({
      content: { parts: [{ text: query }] },
      outputDimensionality: 768,
    });
    return result.embedding.values;
  } catch (err) {
    throw new Error(`Embedding failed: ${err.message}`);
  }
}

async function vectorSearch({ queryVector, userId, documentId, topK = 3 }) {


  const filter = {
    $and: [
      {
        $or: [
          { userId: userId.toString() },
          { userId: new mongoose.Types.ObjectId(userId) }
        ]
      },
      {
        $or: [
          { documentId: documentId.toString() },
          { documentId: new mongoose.Types.ObjectId(documentId) }
        ]
      }
    ]
  };

  const pipeline = [
    {
      $vectorSearch: {
        index: process.env.VECTOR_INDEX_NAME || 'vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: topK * 15,
        limit: topK,
        filter,
      },
    },
    { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    // Just list the fields you want (Inclusion-only)
    { $project: { text: 1, metadata: 1, documentId: 1, score: 1 } },
  ];

  return Chunk.aggregate(pipeline);
}

export async function searchNotes({ query, userId, documentId, topK = 3, minScore = 0.5 }) {
  console.log(`  🔍 Searching: "${query.substring(0, 60)}"`);
  try {
    const queryVector = await embedQuery(query);
    const results = await vectorSearch({ queryVector, userId, documentId, topK });
    const relevant = results.filter((r) => r.score >= minScore);
    console.log(`     Found ${relevant.length}/${results.length} relevant chunks`);
    return { chunks: relevant, hasResults: relevant.length > 0 };
  } catch (error) {
    console.error(`     ⚠️ Vector Search skipped due to API Error: ${error.message}`);
    return { chunks: [], hasResults: false };
  }
}