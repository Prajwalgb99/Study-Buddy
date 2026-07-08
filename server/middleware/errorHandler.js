// ─── server/middleware/errorHandler.js ─────────────────────────────────────────

// Operational error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async error wrapper to catch rejections in controllers and pass to Express
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler for routes not matched
const notFound = (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};

// Centralized error handler middleware
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose duplicate key error (e.g. email already exists)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    statusCode = 400;
  }

  // Mongoose validation error (schema requirements failed)
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map((e) => e.message).join('. ');
    statusCode = 400;
  }

  // Mongoose cast error (invalid MongoDB object ID)
  if (err.name === 'CastError') {
    message = `Invalid ${err.path}: ${err.value}`;
    statusCode = 400;
  }

  // JSON Web Token Errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token. Please log in again.';
    statusCode = 401;
  }
  if (err.name === 'TokenExpiredError') {
    message = 'Token expired. Please log in again.';
    statusCode = 401;
  }

  // Multer errors (file uploads issues)
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = 'File size too large. Maximum size exceeded.';
    statusCode = 400;
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('ERROR:', err);
    return res.status(statusCode).json({
      success: false,
      error: message,
      stack: err.stack,
      err,
    });
  }

  // Production response: hide internal servers crash details
  res.status(statusCode).json({
    success: false,
    error: err.isOperational ? message : 'Something went wrong. Please try again.',
  });
};

export { AppError, asyncHandler, notFound, errorHandler };
