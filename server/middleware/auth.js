// ─── server/middleware/auth.js ────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from './errorHandler.js';

// Protect middleware to validate user JWT
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('No token provided. Please log in.', 401);
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token (jwt.verify throws if token is expired/invalid)
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const user = await User.findById(decoded.userId).select('-password');
  if (!user) {
    throw new AppError('User no longer exists.', 401);
  }

  req.user = user;
  next();
});

export { protect };
