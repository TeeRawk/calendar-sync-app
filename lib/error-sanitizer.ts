/**
 * Error sanitization utilities for secure error handling
 * Prevents sensitive information exposure in production
 */

interface SanitizedError {
  message: string;
  code?: string;
  statusCode?: number;
}

// Patterns to detect sensitive information
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
  /cookie/i,
  /session/i,
  /database/i,
  /connection/i,
  /env/i,
  /process\.env/i,
  /\.env/i,
  /client_secret/i,
  /access_token/i,
  /refresh_token/i,
];

// Common database error patterns
const DB_ERROR_PATTERNS = [
  /duplicate key/i,
  /foreign key constraint/i,
  /connection refused/i,
  /timeout/i,
  /syntax error/i,
  /column .* does not exist/i,
  /table .* does not exist/i,
];

// Authentication error codes and their safe messages
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'UNAUTHENTICATED': 'Authentication required',
  'INVALID_CREDENTIALS': 'Invalid credentials provided',
  'TOKEN_EXPIRED': 'Authentication token has expired',
  'REFRESH_FAILED': 'Failed to refresh authentication',
  'OAUTH_ERROR': 'OAuth authentication failed',
  'RATE_LIMIT_EXCEEDED': 'Too many requests. Please try again later.',
  'FORBIDDEN': 'Access forbidden',
  'SESSION_EXPIRED': 'Session has expired',
  'INVALID_REQUEST': 'Invalid request format',
  'INTERNAL_ERROR': 'Internal server error occurred'
};

/**
 * Sanitize error messages for safe client exposure
 */
export function sanitizeError(error: any, isDevelopment: boolean = false): SanitizedError {
  // In development, show more details (but still sanitize sensitive data)
  if (isDevelopment) {
    return sanitizeForDevelopment(error);
  }

  // Production mode - minimal exposure
  return sanitizeForProduction(error);
}

function sanitizeForProduction(error: any): SanitizedError {
  // Handle known error codes
  if (error?.code && AUTH_ERROR_MESSAGES[error.code]) {
    return {
      message: AUTH_ERROR_MESSAGES[error.code],
      code: error.code,
      statusCode: error.statusCode || 500
    };
  }

  // Handle HTTP status codes
  if (error?.status || error?.statusCode) {
    const status = error.status || error.statusCode;
    switch (status) {
      case 400:
        return { message: 'Bad request', statusCode: 400 };
      case 401:
        return { message: 'Authentication required', statusCode: 401 };
      case 403:
        return { message: 'Access forbidden', statusCode: 403 };
      case 404:
        return { message: 'Resource not found', statusCode: 404 };
      case 429:
        return { message: 'Too many requests', statusCode: 429 };
      case 500:
      default:
        return { message: 'Internal server error', statusCode: 500 };
    }
  }

  // Handle database errors
  if (error?.message && DB_ERROR_PATTERNS.some(pattern => pattern.test(error.message))) {
    return { message: 'Database operation failed', statusCode: 500 };
  }

  // Default fallback
  return { message: 'An unexpected error occurred', statusCode: 500 };
}

function sanitizeForDevelopment(error: any): SanitizedError {
  let message = error?.message || 'Unknown error';
  
  // Remove sensitive information even in development
  SENSITIVE_PATTERNS.forEach(pattern => {
    if (pattern.test(message)) {
      message = message.replace(pattern, '[REDACTED]');
    }
  });

  // Replace actual values with placeholders
  message = message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[UUID]')
    .replace(/[0-9a-fA-F]{32,}/g, '[HASH]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [TOKEN]')
    .replace(/postgresql:\/\/[^@]+@[^\/]+\/\w+/g, 'postgresql://[CREDENTIALS]@[HOST]/[DB]');

  return {
    message: `[DEV] ${message}`,
    code: error?.code,
    statusCode: error?.status || error?.statusCode || 500
  };
}

/**
 * Log error safely without exposing sensitive information
 */
export function logErrorSafely(
  error: any, 
  context: string, 
  userId?: string,
  requestId?: string
) {
  const isDev = process.env.NODE_ENV === 'development';
  const sanitized = sanitizeError(error, isDev);
  
  const logData = {
    timestamp: new Date().toISOString(),
    context,
    error: sanitized,
    userId: userId ? `user-${userId.slice(0, 8)}***` : undefined,
    requestId: requestId?.slice(0, 8),
    // Only include stack trace in development
    stack: isDev ? error?.stack : undefined
  };

  console.error('🚨 Error:', JSON.stringify(logData, null, 2));
}

/**
 * Create safe error response for API endpoints
 */
export function createErrorResponse(
  error: any,
  statusCode?: number,
  requestId?: string
): Response {
  const isDev = process.env.NODE_ENV === 'development';
  const sanitized = sanitizeError(error, isDev);
  
  const responseData = {
    error: sanitized.code || 'UNKNOWN_ERROR',
    message: sanitized.message,
    requestId: requestId?.slice(0, 8),
    timestamp: new Date().toISOString()
  };

  return new Response(
    JSON.stringify(responseData),
    {
      status: statusCode || sanitized.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId?.slice(0, 8) || 'unknown'
      }
    }
  );
}

/**
 * Validate that error doesn't contain sensitive information before logging
 */
export function isSafeToLog(error: any): boolean {
  const message = error?.message || error?.toString() || '';
  return !SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}