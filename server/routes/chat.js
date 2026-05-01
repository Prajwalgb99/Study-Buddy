// ─── server/routes/chat.js ────────────────────────────────────────────────────
// Chat endpoint with Server-Sent Events (SSE) streaming
//
// POST /api/chat/stream  — streams AI response token by token via SSE
// GET  /api/chat/history/:sessionId — get chat history
// DELETE /api/chat/history/:sessionId — clear chat history
// ──────────────────────────────────────────────────────────────────────────────
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { protect }      from '../middleware/auth.js';
import { runStudyAgent } from '../agents/studyAgent.js';
import { ChatHistory }  from '../models/User.js';

const router = express.Router();

// ─── POST /api/chat/stream ────────────────────────────────────────────────────
// The main chat endpoint — uses Server-Sent Events for streaming.
//
// Server-Sent Events (SSE) Protocol:
//   - HTTP connection stays open
//   - Server pushes "data: ...\n\n" messages
//   - Client reads them with EventSource or a fetch reader
//   - Connection closes when server sends "data: [DONE]\n\n"
//
// Request body: { question, sessionId, documentId? }
// SSE events:
//   data: {"type":"chunk","text":"Hello"}     — streamed token
//   data: {"type":"metadata","sources":[...]} — sources + tool used
//   data: {"type":"done"}                     — signals end
//   data: {"type":"error","message":"..."}    — error
router.post('/stream', protect, async (req, res) => {
  const { question, sessionId: clientSessionId, documentId } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ success: false, error: 'Question is required.' });
  }

  // ── Setup SSE Headers ─────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable Nginx buffering if proxied
  res.flushHeaders();  // Send headers immediately — opens the SSE connection

  // Helper: send an SSE event
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep-alive ping every 15s to prevent proxy timeouts
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  // Cleanup on client disconnect
  req.on('close', () => clearInterval(keepAlive));

  const sessionId = clientSessionId || uuidv4();
  let fullResponse = '';
  let sources      = [];
  let toolUsed     = '';

  try {
    // ── Load chat history for multi-turn context ──────────────────────────
    const historyDoc = await ChatHistory.findOne({ sessionId });
    const history    = historyDoc?.messages?.slice(-10) || [];  // Last 5 turns

    // ── Run the Study Agent with streaming callbacks ───────────────────────
    await runStudyAgent({
      question,
      userId:     req.user._id.toString(),
      documentId,
      history,

      // Called for EACH streamed token from Gemini
      onChunk: (text) => {
        fullResponse += text;
        sendEvent({ type: 'chunk', text });
      },

      // Called ONCE when agent has finished deciding tools and retrieving sources
      onMetadata: (meta) => {
        sources  = meta.sources;
        toolUsed = meta.toolUsed;
        // Send sources immediately so frontend can display them while text streams
        sendEvent({ type: 'metadata', sources: meta.sources, toolUsed: meta.toolUsed, hasResults: meta.hasResults });
      },
    });

    // ── Save complete exchange to chat history ────────────────────────────
    await ChatHistory.findOneAndUpdate(
      { sessionId },
      {
        userId: req.user._id,
        sessionId,
        // Auto-title from first message
        $setOnInsert: { title: question.substring(0, 60) },
        $push: {
          messages: {
            $each: [
              { role: 'user',      content: question,      timestamp: new Date() },
              { role: 'assistant', content: fullResponse, sources, toolsUsed: [toolUsed], timestamp: new Date() },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    // ── Signal stream completion ──────────────────────────────────────────
    sendEvent({ type: 'done', sessionId });

  } catch (err) {
    console.error('Chat streaming error:', err);
    sendEvent({ type: 'error', message: err.message || 'Agent encountered an error.' });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ─── GET /api/chat/sessions ───────────────────────────────────────────────────
// List all chat sessions for the user
router.get('/sessions', protect, async (req, res) => {
  try {
    const sessions = await ChatHistory.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .select('sessionId title updatedAt')
      .limit(20);

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/chat/history/:sessionId ────────────────────────────────────────
// Get full chat history for a session
router.get('/history/:sessionId', protect, async (req, res) => {
  try {
    const history = await ChatHistory.findOne({
      sessionId: req.params.sessionId,
      userId:    req.user._id,
    });

    if (!history) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/chat/history/:sessionId ─────────────────────────────────────
router.delete('/history/:sessionId', protect, async (req, res) => {
  try {
    await ChatHistory.deleteOne({ sessionId: req.params.sessionId, userId: req.user._id });
    res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
