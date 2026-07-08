// ─── server/models/User.js ────────────────────────────────────────────────────
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,  // Never returned in queries by default
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method: compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);

// ─── ChatHistory Model ────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  // Sources used in this message (for assistant messages)
  sources: [{
    documentName: String,
    subject: String,
    chunkIndex: Number,
    score: Number,          // Similarity score (0-1)
    excerpt: String,          // First 120 chars of the chunk
  }],
  toolsUsed: [String],            // e.g. ['search_notes', 'search_web']
  timestamp: { type: Date, default: Date.now },
});

const chatHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    title: { type: String, default: 'New Chat' },
    messages: [messageSchema],
  },
  { timestamps: true }
);

export const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);
