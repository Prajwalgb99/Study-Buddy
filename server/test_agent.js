import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runStudyAgent } from './agents/studyAgent.js';
dotenv.config();

async function testAgent() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Testing agent with query...");
    // Let's use a query that will DEFINITELY return chunks if there are any in the DB, 
    // or we can mock the searchNotes function, but since we're connected to their DB, we'll just run it.
    const result = await runStudyAgent({
      question: "What is this document about?",
      userId: "662a1b2c3d4e5f6a7b8c9d0e", // Fake ID or we can just pass null if vectorSearch handles it
      documentId: null,
      history: [],
      onChunk: (text) => process.stdout.write(text),
      onMetadata: (m) => console.log("\nMetadata:", m)
    });
    console.log("\nSuccess!");
    process.exit(0);
  } catch (err) {
    console.error("\nError caught:", err);
    process.exit(1);
  }
}
testAgent();
