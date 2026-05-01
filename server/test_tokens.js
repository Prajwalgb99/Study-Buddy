import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('p:/study-buddy/server/.env') });

async function testTokens(size) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const prompt = "A".repeat(size);
    const result = await model.generateContent(prompt);
    console.log(`Success for size ${size}`);
  } catch (err) {
    console.error(`Error for size ${size}:`, err.message.substring(0, 200));
  }
}

async function run() {
  await testTokens(100);
  await testTokens(1000);
  await testTokens(5000);
  process.exit(0);
}
run();
