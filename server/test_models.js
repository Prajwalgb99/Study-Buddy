import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('p:/study-buddy/server/.env') });

const modelsToTest = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemma-3-4b-it',
  'gemma-4-26b-a4b-it',
  'gemini-pro-latest'
];

async function testModel(modelName) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("test");
    console.log(`✅ Success: ${modelName}`);
    return true;
  } catch (err) {
    const isQuota = /429|quota/i.test(err.message);
    if (isQuota) {
      console.log(`❌ Quota Exceeded: ${modelName}`);
    } else {
      console.log(`⚠️ Error: ${modelName} - ${err.message.split('\n')[0]}`);
    }
    return false;
  }
}

async function run() {
  for (const model of modelsToTest) {
    await testModel(model);
  }
  process.exit(0);
}
run();
