const { insert } = require('../config/database');

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Log to audit table if user is available
  if (req.user) {
    logAuditEvent(req.user.id, 'ERROR', 'SYSTEM', null, null, {
      error: err.message,
      url: req.url,
      method: req.method
    });
  }

  // MySQL error handling
  if (err.code === 'ER_DUP_ENTRY') {
    const message = 'Duplicate entry. This record already exists.';
    error = { message, statusCode: 409 };
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    const message = 'Referenced record does not exist.';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    const message = 'Cannot delete this record as it is referenced by other records.';
    error = { message, statusCode: 400 };
  }

  // JWT error handling
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token.';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired.';
    error = { message, statusCode: 401 };
  }

  // Multer error handling
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File size too large.';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Too many files uploaded.';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field.';
    error = { message, statusCode: 400 };
  }

  // Joi validation error handling
  if (err.isJoi) {
    const message = 'Validation failed.';
    const errors = err.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message,
      errors
    });
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new Error(`Not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Audit logging function
const logAuditEvent = async (userId, action, entityType, entityId, oldValues = null, newValues = null) => {
  try {
    await insert('audit_logs', {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues ? JSON.stringify(oldValues) : null,
      new_values: newValues ? JSON.stringify(newValues) : null,
      ip_address: null, // Will be set in request middleware
      user_agent: null // Will be set in request middleware
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')
    };

    console.log(`${logData.method} ${logData.url} ${logData.statusCode} - ${logData.duration}`);

    // Log successful requests to audit if user is authenticated
    if (req.user && res.statusCode < 400) {
      try {
        await insert('audit_logs', {
          user_id: req.user.id,
          action: `${req.method} ${req.route?.path || req.originalUrl}`,
          entity_type: 'API_REQUEST',
          entity_id: null,
          new_values: JSON.stringify(logData),
          ip_address: logData.ip,
          user_agent: logData.userAgent
        });
      } catch (error) {
        console.error('Failed to log request audit:', error);
      }
    }
  });

  next();
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  logAuditEvent,
  requestLogger
};
