// ─── server/controllers/chatController.js ──────────────────────────────────────
import { v4 as uuidv4 } from 'uuid';
import { runStudyAgent } from '../utils/studyAgent.js';
import { ChatHistory } from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

// @desc    Stream AI response via SSE
// @route   POST /api/chat/stream
// @access  Private
const streamChat = asyncHandler(async (req, res) => {
  const { question, sessionId: clientSessionId, documentId } = req.body;

  if (!question?.trim()) {
    throw new AppError('Question is required.', 400);
  }

  // ── Setup SSE Headers ─────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

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

      onChunk: (text) => {
        fullResponse += text;
        sendEvent({ type: 'chunk', text });
      },

      onMetadata: (meta) => {
        sources  = meta.sources;
        toolUsed = meta.toolUsed;
        sendEvent({ type: 'metadata', sources: meta.sources, toolUsed: meta.toolUsed, hasResults: meta.hasResults });
      },
    });

    // ── Save complete exchange to chat history ────────────────────────────
    await ChatHistory.findOneAndUpdate(
      { sessionId },
      {
        userId: req.user._id,
        sessionId,
        documentId: documentId || undefined,
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
  } // Note: We do not catch and throw to global handler because headers are sent.
  finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// @desc    List all chat sessions for the user
// @route   GET /api/chat/sessions
// @access  Private
const getSessions = asyncHandler(async (req, res) => {
  const sessions = await ChatHistory.find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .select('sessionId title documentId updatedAt')
    .limit(20);

  res.json({ success: true, sessions });
});

// @desc    Get full chat history for a session
// @route   GET /api/chat/history/:sessionId
// @access  Private
const getHistory = asyncHandler(async (req, res) => {
  const history = await ChatHistory.findOne({
    sessionId: req.params.sessionId,
    userId:    req.user._id,
  });

  if (!history) {
    throw new AppError('Session not found.', 404);
  }

  res.json({ success: true, history });
});

// @desc    Delete chat history for a session
// @route   DELETE /api/chat/history/:sessionId
// @access  Private
const deleteHistory = asyncHandler(async (req, res) => {
  await ChatHistory.deleteOne({ sessionId: req.params.sessionId, userId: req.user._id });
  res.json({ success: true, message: 'Chat history cleared.' });
});

export { streamChat, getSessions, getHistory, deleteHistory };
