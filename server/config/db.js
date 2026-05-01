// ─── server/config/db.js ──────────────────────────────────────────────────────
// MongoDB Atlas connection with Vector Search setup instructions
// ──────────────────────────────────────────────────────────────────────────────
import mongoose from 'mongoose';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options prevent deprecation warnings
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // ── IMPORTANT: After connecting, create the Vector Search Index manually ──
    // Go to: MongoDB Atlas → Your Cluster → Search → Create Search Index
    // Select: "JSON Editor" and use Atlas Vector Search
    // Index Name: "vector_index"
    // Collection: study-buddy.chunks
    // JSON Definition:
    // {
    //   "fields": [
    //     {
    //       "type": "vector",
    //       "path": "embedding",
    //       "numDimensions": 768,
    //       "similarity": "cosine"
    //     },
    //     {
    //       "type": "filter",
    //       "path": "documentId"
    //     },
    //     {
    //       "type": "filter",
    //       "path": "userId"
    //     }
    //   ]
    // }
    // Note: Gemini embedding-001 produces 768-dimensional vectors
    // ─────────────────────────────────────────────────────────────────────────

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);  // Exit process on connection failure
  }
}
