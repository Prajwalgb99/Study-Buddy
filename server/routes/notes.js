// ─── server/routes/notes.js ───────────────────────────────────────────────────
import express from 'express';
import { protect } from '../middleware/auth.js';
import { upload, handleMulterError } from '../middleware/upload.js';
import { uploadNotes, getNotes, getNoteById, deleteNote } from '../controllers/notesController.js';

const router = express.Router();

// POST /api/notes/upload
router.post('/upload', protect, upload.single('pdf'), uploadNotes, handleMulterError);

// GET /api/notes
router.get('/', protect, getNotes);

// GET /api/notes/:id
router.get('/:id', protect, getNoteById);

// DELETE /api/notes/:id
router.delete('/:id', protect, deleteNote);

export default router;
