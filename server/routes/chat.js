// ─── server/routes/chat.js ────────────────────────────────────────────────────
import express from 'express';
import { protect } from '../middleware/auth.js';
import { streamChat, getSessions, getHistory, deleteHistory } from '../controllers/chatController.js';

const router = express.Router();

// POST /api/chat/stream
router.post('/stream', protect, streamChat);

// GET /api/chat/sessions
router.get('/sessions', protect, getSessions);

// GET /api/chat/history/:sessionId
router.get('/history/:sessionId', protect, getHistory);

// DELETE /api/chat/history/:sessionId
router.delete('/history/:sessionId', protect, deleteHistory);

export default router;
