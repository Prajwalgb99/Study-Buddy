// ─── server/routes/auth.js ────────────────────────────────────────────────────
import express from 'express';
import { register, login, me } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me
router.get('/me', protect, me);

export default router;
