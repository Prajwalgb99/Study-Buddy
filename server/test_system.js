import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test(modelName) {
  try {
    console.log(`Testing systemInstruction on ${modelName}...`);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const chunks = [{text: "Hello world", score: 0.9, metadata: {documentName: "test", chunkIndex: 0, totalChunks: 1}}];
    const systemPrompt = `RULES:\n1. Use context.\n\nCONTEXT:\n${chunks[0].text}`;
    
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: systemPrompt 
    });
    
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: "Hello" }] },
        { role: 'model', parts: [{ text: "Hi" }] }
      ]
    });
    const result = await chat.sendMessageStream("Test message");
    let count = 0;
    for await (const chunk of result.stream) {
      count++;
      if (count === 1) process.stdout.write("Started streaming...");
    }
    console.log(`\nSuccess for ${modelName}!\n`);
  } catch (err) {
    console.error(`Error for ${modelName}:`, err);
  }
}

test('gemini-flash-latest');
