// ─── server/routes/notes.js ───────────────────────────────────────────────────
// PDF Upload + Ingestion Route
// POST /api/notes/upload  — uploads PDF, triggers full RAG pipeline
// GET  /api/notes         — list user's documents
// GET  /api/notes/:id     — get one document with chunk count
// DELETE /api/notes/:id   — delete document and all its chunks
// ──────────────────────────────────────────────────────────────────────────────
import express         from 'express';
import multer          from 'multer';
import path            from 'path';
import fs              from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { protect }     from '../middleware/auth.js';
import Document        from '../models/Document.js';
import Chunk           from '../models/Chunk.js';
import { ingestPDF }   from '../services/ingestionService.js';

const router = express.Router();

// ─── Multer Configuration ─────────────────────────────────────────────────────
// Multer handles multipart/form-data file uploads

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Sanitize filename and add UUID to prevent collisions
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = file.originalname
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
      .substring(0, 50);
    cb(null, `${safeName}_${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are accepted.'), false);
  }
};

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 20;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

// ─── POST /api/notes/upload ───────────────────────────────────────────────────
// The main ingestion endpoint — uploads a PDF and runs the full RAG pipeline.
// This is the most important endpoint in the entire application.
router.post(
  '/upload',
  protect,
  upload.single('pdf'),           // Field name in form-data must be "pdf"
  async (req, res) => {
    // Cleanup helper: delete file on error
    const cleanup = () => {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    };

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }

    const subject = req.body.subject?.trim() || 'General';

    // ── 1. Create Document record (status: 'processing') ─────────────────
    let document;
    try {
      document = await Document.create({
        userId:       req.user._id,
        originalName: req.file.originalname,
        storedName:   req.file.filename,
        subject,
        fileSize:     req.file.size,
        status:       'processing',
      });
    } catch (err) {
      cleanup();
      return res.status(500).json({ success: false, error: 'Failed to create document record.' });
    }

    // ── 2. Send immediate response (don't make user wait for full ingestion) ─
    // The frontend can poll GET /api/notes/:id for status updates
    res.status(202).json({
      success:  true,
      message:  'PDF upload accepted. Processing in background...',
      document: {
        _id:          document._id,
        originalName: document.originalName,
        subject:      document.subject,
        status:       document.status,
        fileSize:     document.fileSize,
        createdAt:    document.createdAt,
      },
    });

    // ── 3. Run ingestion pipeline in background (non-blocking) ───────────
    // We don't await this — it runs after the response is sent
    ;(async () => {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);

        const stats = await ingestPDF({
          fileBuffer,
          documentId: document._id.toString(),
          userId:     req.user._id.toString(),
          docName:    req.file.originalname,
          subject,
        });

        console.log(`✅ Background ingestion complete for ${req.file.originalname}:`, stats);
      } catch (err) {
        console.error(`❌ Ingestion failed for ${req.file.originalname}:`, err.message);

        // Mark document as failed
        await Document.findByIdAndUpdate(document._id, {
          status:       'error',
          errorMessage: err.message,
        });
      }
    })();
  }
);

// ─── GET /api/notes ───────────────────────────────────────────────────────────
// List all documents uploaded by the authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json({ success: true, count: documents.length, documents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/notes/:id ───────────────────────────────────────────────────────
// Get one document — frontend polls this to check ingestion status
router.get('/:id', protect, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id:    req.params.id,
      userId: req.user._id,          // Security: users can only see their own docs
    }).select('-__v');

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    res.json({ success: true, document });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/notes/:id ────────────────────────────────────────────────────
// Delete a document AND all its associated chunks from MongoDB
router.delete('/:id', protect, async (req, res) => {
  try {
    const document = await Document.findOne({
      _id:    req.params.id,
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    // Delete all chunks for this document
    const { deletedCount } = await Chunk.deleteMany({ documentId: document._id });

    // Delete the Document record
    await document.deleteOne();

    // Delete the physical file
    const filePath = path.join(UPLOAD_DIR, document.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Deleted document and ${deletedCount} chunks.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Multer Error Handler ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${MAX_SIZE_MB}MB.`,
      });
    }
  }
  if (err.message === 'Only PDF files are accepted.') {
    return res.status(415).json({ success: false, error: err.message });
  }
  next(err);
});

export default router;
