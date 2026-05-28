import 'dotenv/config';
import mongoose from 'mongoose';
import { searchNotes } from './services/vectorSearchService.js';
import Chunk from './models/Chunk.js';

async function runQuery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Pick a random document id and user id from the DB to test
    const chunk = await Chunk.findOne();
    if (!chunk) {
      console.log('No chunks to test with');
      process.exit(1);
    }
    
    console.log(`Testing query for userId: ${chunk.userId}, documentId: ${chunk.documentId}`);
    
    const startTime = Date.now();
    const result = await searchNotes({
      query: "What is this document about?",
      userId: chunk.userId,
      documentId: chunk.documentId,
      topK: 3
    });
    const endTime = Date.now();
    
    console.log(`Time taken: ${endTime - startTime} ms`);
    if (result.chunks.length > 0) {
      console.log(`Top Score: ${result.chunks[0].score}`);
      console.log(`Scores: ${result.chunks.map(c => c.score).join(', ')}`);
    } else {
      console.log('No chunks returned.');
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runQuery();
