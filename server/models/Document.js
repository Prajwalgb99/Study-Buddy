// ─── server/models/Document.js ───────────────────────────────────────────────
// Stores metadata about each uploaded PDF
// ──────────────────────────────────────────────────────────────────────────────
import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    // Which user uploaded this document
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Original filename shown to user
    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    // Sanitized filename stored on disk
    storedName: {
      type: String,
      required: true,
    },

    // Subject/category tag the user can set
    subject: {
      type: String,
      trim: true,
      default: 'General',
    },

    // Processing status
    status: {
      type: String,
      enum: ['processing', 'ready', 'error'],
      default: 'processing',
    },

    // Stats filled in after processing
    pageCount:   { type: Number, default: 0 },
    chunkCount:  { type: Number, default: 0 },
    charCount:   { type: Number, default: 0 },

    // File size in bytes
    fileSize: {
      type: Number,
      required: true,
    },

    // Error message if processing failed
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Document', documentSchema);
