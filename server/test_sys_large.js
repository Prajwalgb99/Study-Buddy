import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function testSystemLarge() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const largeSystem = "This is a context chunk. ".repeat(1000);
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: largeSystem
    });
    const chat = model.startChat({ history: [] });
    const result = await chat.sendMessageStream("Hello");
    let count = 0;
    for await (const chunk of result.stream) {
      if (count === 0) console.log("Stream started");
      count++;
    }
    console.log("Success with large system instruction");
  } catch(e) {
    console.error("Error:", e.message);
  }
}
testSystemLarge();
