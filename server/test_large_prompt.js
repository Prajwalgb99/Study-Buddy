import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test(modelName) {
  try {
    console.log(`Testing large prompt on ${modelName}...`);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    // Create a large fake chunk context
    const largeText = "This is a test chunk. ".repeat(1000); 
    
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: "Hello" }] },
        { role: 'model', parts: [{ text: "Hi" }] }
      ]
    });
    const result = await chat.sendMessageStream(largeText);
    let count = 0;
    for await (const chunk of result.stream) {
      count++;
      if (count === 1) process.stdout.write("Started streaming...");
    }
    console.log(`\nSuccess for ${modelName}!\n`);
  } catch (err) {
    console.error(`Error for ${modelName}:`, err.message);
  }
}

test('gemini-flash-latest');
