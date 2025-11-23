/**
 * Log Sanitizer
 * Sanitizes sensitive data from logs and responses
 */

export function sanitizeErrorForResponse(error: any): any {
  if (!error) return error;

  // Remove sensitive information
  const sanitized = { ...error };

  // Remove stack traces in production
  if (process.env.NODE_ENV === 'production') {
    delete sanitized.stack;
  }

  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

export function sanitizeError(error: any): any {
  return sanitizeErrorForResponse(error);
}

export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };

  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}