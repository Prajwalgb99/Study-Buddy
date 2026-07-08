// ─── server/middleware/upload.js ───────────────────────────────────────────────
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

// Multer error handling helper
export function handleMulterError(err, req, res, next) {
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
}
