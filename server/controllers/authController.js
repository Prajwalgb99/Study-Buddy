// ─── server/controllers/authController.js ──────────────────────────────────────
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    throw new AppError('All fields are required.', 400);
  }

  const exists = await User.findOne({ email });
  if (exists) {
    throw new AppError('Email already registered.', 409);
  }

  const user  = await User.create({ name, email, password });
  const token = signToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: { _id: user._id, name: user.name, email: user.email },
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError('Email and password required.', 400);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = signToken(user._id);
  res.json({
    success: true,
    token,
    user: { _id: user._id, name: user.name, email: user.email },
  });
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

export { register, login, me };
