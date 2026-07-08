// ─── server/utils/studyAgent.js ─────────────────────────────────────────────
// The Agentic Brain of Study-Buddy
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchNotes }         from './vectorSearch.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function classifyIntent(question) {
  const q = question.toLowerCase();
  if (/test me|quiz|mcq|multiple choice|practice questions?/.test(q)) return 'generate_quiz';
  if (/summar|overview|brief|tldr|key points|main (points|ideas)/.test(q))  return 'summarize_document';
  if (/explain|what is|what are|define|how does|describe/.test(q))           return 'explain_concept';
  return 'search_notes';
}

function buildSystemPrompt(chunks, tool) {
  const base = `You are Study Buddy, an AI academic assistant.
RULES:
1. Answer using the CONTEXT CHUNKS below.
2. If the answer is not in the context, say: "I couldn't find this in your notes."
3. Never make up information. Cite the source chunk numbers when presenting facts.
4. Be precise, detailed, and format your output exactly according to the user's instructions (e.g., number of questions, length of response, specific style).`;

  const context = chunks.length > 0
    ? '\n\nCONTEXT FROM YOUR NOTES:\n' +
      chunks.map((c, i) =>
        `[SOURCE ${i+1}] ${c.metadata.documentName} | Chunk ${c.metadata.chunkIndex+1}/${c.metadata.totalChunks} | Match: ${(c.score*100).toFixed(0)}%\n${c.text}`
      ).join('\n\n---\n\n')
    : '\n\nNO CONTEXT FOUND. Tell the user no relevant information was found in their notes.';

  const taskMap = {
    generate_quiz:      '\n\nTASK: Generate multiple-choice questions (MCQs) using the context. Generate exactly the number of questions requested by the user, or default to 5 if not specified. Format each: Q) question  A) B) C) D)  Answer: X — reason (cite the source).',
    summarize_document: '\n\nTASK: Summarize the key points in detailed bullet points.',
    explain_concept:    '\n\nTASK: Explain the concept thoroughly using the provided context.',
    search_notes:       '\n\nTASK: Answer the student question thoroughly using the context. Be as detailed and lengthwise precise as the user requests.',
  };

  return base + context + (taskMap[tool] || taskMap.search_notes);
}

export async function runStudyAgent({ question, userId, documentId, history = [], onChunk, onMetadata }) {
  console.log(`\n🤖 Agent: "${question.substring(0,80)}"`);

  const toolUsed = classifyIntent(question);
  console.log(`   Tool: ${toolUsed}`);

  const { chunks, hasResults } = await searchNotes({
    query: question, userId, documentId, topK: 5, minScore: 0.5,
  });

  const systemPrompt = buildSystemPrompt(chunks, toolUsed);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash', 
    systemInstruction: systemPrompt,
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });

  // Limit history to 0 (no history) to absolutely minimize input tokens
  const geminiHistory = [];

  const chat   = model.startChat({ history: geminiHistory });
  const stream = await chat.sendMessageStream(question);

  let fullResponse = '';
  for await (const chunk of stream.stream) {
    const text = chunk.text();
    fullResponse += text;
    if (onChunk && text) onChunk(text);
  }

  const sources = chunks.map((c) => ({
    documentName: c.metadata.documentName,
    subject:      c.metadata.subject,
    chunkIndex:   c.metadata.chunkIndex,
    totalChunks:  c.metadata.totalChunks,
    score:        parseFloat(c.score.toFixed(3)),
    excerpt:      c.text.substring(0, 150) + '…',
  }));

  if (onMetadata) onMetadata({ sources, toolUsed, hasResults });
  return { fullResponse, sources, toolUsed, hasResults };
}
