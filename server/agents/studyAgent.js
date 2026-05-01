// ─── server/agents/studyAgent.js ─────────────────────────────────────────────
// The Agentic Brain of Study-Buddy
//
// This agent:
//   1. Receives the user's question
//   2. Runs the THINK → ACT → OBSERVE → RESPOND loop
//   3. Decides which tool to call (search_notes, generate_quiz, etc.)
//   4. Builds a grounded system prompt from retrieved chunks
//   5. Streams Gemini's response token-by-token back to the client
//   6. Returns full source attribution metadata
// ──────────────────────────────────────────────────────────────────────────────
// ─── server/agents/studyAgent.js ─────────────────────────────────────────────
// ─── server/agents/studyAgent.js ─────────────────────────────────────────────
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchNotes }         from '../services/vectorSearchService.js';

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
1. Answer ONLY using the CONTEXT CHUNKS below.
2. If the answer is not in the context say: "I couldn't find this in your notes."
3. Never make up information. Cite the source chunk number.
4. Be concise and use bullet points where helpful.`;

  const context = chunks.length > 0
    ? '\n\nCONTEXT FROM YOUR NOTES:\n' +
      chunks.map((c, i) =>
        `[SOURCE ${i+1}] ${c.metadata.documentName} | Chunk ${c.metadata.chunkIndex+1}/${c.metadata.totalChunks} | Match: ${(c.score*100).toFixed(0)}%\n${c.text}`
      ).join('\n\n---\n\n')
    : '\n\nNO CONTEXT FOUND. Tell the user no relevant information was found in their notes.';

  const taskMap = {
    generate_quiz:      '\n\nTASK: Generate 5 MCQ questions. Format: Q) question  A) B) C) D)  Answer: X — reason',
    summarize_document: '\n\nTASK: Summarize the key points in bullet points.',
    explain_concept:    '\n\nTASK: Explain the concept using only the context.',
    search_notes:       '\n\nTASK: Answer the student question using only the context.',
  };

  return base + context + (taskMap[tool] || taskMap.search_notes);
}

export async function runStudyAgent({ question, userId, documentId, history = [], onChunk, onMetadata }) {
  console.log(`\n🤖 Agent: "${question.substring(0,80)}"`);

  const toolUsed = classifyIntent(question);
  console.log(`   Tool: ${toolUsed}`);

  const { chunks, hasResults } = await searchNotes({
    query: question, userId, documentId, topK: 1, minScore: 0.5,
  });

  const systemPrompt = buildSystemPrompt(chunks, toolUsed);

const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite', 
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
