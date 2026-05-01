import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import Chunk from './models/Chunk.js';
import { runStudyAgent } from './agents/studyAgent.js';

dotenv.config({ path: path.resolve('p:/study-buddy/server/.env') });

async function testAgent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find any chunk in the database
    const chunk = await Chunk.findOne();
    if (!chunk) {
      console.log("No chunks found in DB. Cannot test.");
      process.exit(0);
    }
    
    const userId = chunk.userId;
    const documentId = chunk.documentId;
    
    console.log(`Testing agent with userId: ${userId}, documentId: ${documentId}`);
    
    // Test the agent
    const result = await runStudyAgent({
      question: "Summarize this document",
      userId,
      documentId,
      history: [],
      onChunk: (text) => process.stdout.write(text),
      onMetadata: (m) => console.log("\nMetadata:", m)
    });
    
    console.log("\nSuccess!");
    process.exit(0);
  } catch (err) {
    console.error("\nError caught in test:", err);
    process.exit(1);
  }
}
testAgent();
