// ─── server/controllers/notesController.js ─────────────────────────────────────
import fs from 'fs';
import path from 'path';
import Document from '../models/Document.js';
import Chunk from '../models/Chunk.js';
import { ingestPDF } from '../utils/ingestion.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// @desc    Upload notes PDF and start RAG ingestion
// @route   POST /api/notes/upload
// @access  Private
const uploadNotes = asyncHandler(async (req, res) => {
  const cleanup = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  };

  if (!req.file) {
    throw new AppError('No PDF file uploaded.', 400);
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
    throw new AppError('Failed to create document record.', 500);
  }

  // ── 2. Send immediate response (don't make user wait for full ingestion) ─
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

      await Document.findByIdAndUpdate(document._id, {
        status:       'error',
        errorMessage: err.message,
      });
    }
  })();
});

// @desc    List all documents for the user
// @route   GET /api/notes
// @access  Private
const getNotes = asyncHandler(async (req, res) => {
  const documents = await Document.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .select('-__v');

  res.json({ success: true, count: documents.length, documents });
});

// @desc    Get one document details
// @route   GET /api/notes/:id
// @access  Private
const getNoteById = asyncHandler(async (req, res) => {
  const document = await Document.findOne({
    _id:    req.params.id,
    userId: req.user._id,
  }).select('-__v');

  if (!document) {
    throw new AppError('Document not found.', 404);
  }

  res.json({ success: true, document });
});

// @desc    Delete document and all its chunks
// @route   DELETE /api/notes/:id
// @access  Private
const deleteNote = asyncHandler(async (req, res) => {
  const document = await Document.findOne({
    _id:    req.params.id,
    userId: req.user._id,
  });

  if (!document) {
    throw new AppError('Document not found.', 404);
  }

  const { deletedCount } = await Chunk.deleteMany({ documentId: document._id });

  await document.deleteOne();

  const filePath = path.join(UPLOAD_DIR, document.storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({
    success: true,
    message: `Deleted document and ${deletedCount} chunks.`,
  });
});

export { uploadNotes, getNotes, getNoteById, deleteNote };
