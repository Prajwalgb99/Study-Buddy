import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('p:/study-buddy/server/.env') });

async function testEmbedding() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent("Test");
    console.log("Success", result.embedding.values.length);
  } catch (err) {
    console.error("Error", err.message);
  }
}
testEmbedding();
