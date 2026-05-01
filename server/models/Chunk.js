// ─── server/models/Chunk.js ───────────────────────────────────────────────────
// Each chunk = one searchable piece of a PDF with its vector embedding
// This collection is what MongoDB Vector Search operates on
// ──────────────────────────────────────────────────────────────────────────────
import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
  {
    // Reference back to parent document
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },

    // Denormalized for filtering without joins
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The actual text of this chunk
    text: {
      type: String,
      required: true,
    },

    // ── The magic: the vector embedding ─────────────────────────────────────
    // Gemini embedding-001 produces 768-dimensional float vectors
    // MongoDB Vector Search will index this field
    embedding: {
      type: [Number],   // Array of 768 floats
      required: true,
    },

    // ── Source attribution metadata ──────────────────────────────────────────
    metadata: {
      // Position in the document
      chunkIndex:    { type: Number, required: true },
      totalChunks:   { type: Number, required: true },

      // For displaying to user: "From: Chapter 3, Cloud Computing.pdf"
      documentName:  { type: String, required: true },
      subject:       { type: String, default: 'General' },

      // Approximate character position in original text
      startChar:     { type: Number },
      endChar:       { type: Number },
    },
  },
  {
    timestamps: true,
    // Tell Mongoose this collection uses the vector search index
    collection: 'chunks',
  }
);

// ── Compound indexes for fast filtering ───────────────────────────────────────
// These speed up the pre-filter stage of $vectorSearch
chunkSchema.index({ documentId: 1, 'metadata.chunkIndex': 1 });
chunkSchema.index({ userId: 1, documentId: 1 });

export default mongoose.model('Chunk', chunkSchema);
