/**
 * Custom Error Types for Laylo API Integration
 * Following Architecture Rule 2: Error Handling
 */

/**
 * Base class for all application errors
 */
class BaseError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where our error was thrown (only V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Get sanitized version for user display (removes sensitive info)
   * @returns {Object} Sanitized error
   */
  toUserSafe() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp
    };
  }
}

/**
 * Configuration-related errors
 */
class ConfigurationError extends BaseError {
  constructor(setting, reason, context = {}) {
    super(`Configuration Error - ${setting}: ${reason}`, 'CONFIG_ERROR', {
      setting,
      reason,
      ...context
    });
    this.setting = setting;
    this.reason = reason;
  }
}

/**
 * Data validation errors
 */
class ValidationError extends BaseError {
  constructor(field, value, rule, context = {}) {
    super(`Validation failed for field '${field}': ${rule}`, 'VALIDATION_ERROR', {
      field,
      value,
      rule,
      ...context
    });
    this.field = field;
    this.value = value;
    this.rule = rule;
  }
}

/**
 * API-related errors
 */
class ApiError extends BaseError {
  constructor(status, message, response = null, context = {}) {
    super(message, 'API_ERROR', {
      status,
      response: response ? JSON.stringify(response) : null,
      ...context
    });
    this.status = status;
    this.response = response;
  }

  /**
   * Check if error is retryable based on status code
   * @returns {boolean} True if retryable
   */
  isRetryable() {
    return [429, 500, 502, 503, 504].includes(this.status);
  }

  /**
   * Get retry delay based on error type
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    switch (this.status) {
      case 429: // Rate limited
        return 5000;
      case 500:
      case 502:
      case 503:
      case 504:
        return 2000;
      default:
        return 1000;
    }
  }
}

/**
 * Network-related errors
 */
class NetworkError extends BaseError {
  constructor(message, originalError = null, context = {}) {
    super(`Network error: ${message}`, 'NETWORK_ERROR', {
      originalError: originalError ? originalError.message : null,
      ...context
    });
    this.originalError = originalError;
  }

  /**
   * Check if error is retryable
   * @returns {boolean} True if retryable
   */
  isRetryable() {
    // Most network errors are retryable
    return true;
  }

  /**
   * Get retry delay
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    return 2000;
  }
}

/**
 * Authentication errors
 */
class AuthenticationError extends BaseError {
  constructor(message, context = {}) {
    super(`Authentication failed: ${message}`, 'AUTH_ERROR', context);
  }

  /**
   * Authentication errors are not retryable
   * @returns {boolean} False
   */
  isRetryable() {
    return false;
  }
}

/**
 * Rate limiting errors
 */
class RateLimitError extends BaseError {
  constructor(retryAfter = null, context = {}) {
    const message = retryAfter ? 
      `Rate limit exceeded. Retry after ${retryAfter} seconds` :
      'Rate limit exceeded';
    
    super(message, 'RATE_LIMIT_ERROR', {
      retryAfter,
      ...context
    });
    this.retryAfter = retryAfter;
  }

  /**
   * Rate limit errors are retryable
   * @returns {boolean} True
   */
  isRetryable() {
    return true;
  }

  /**
   * Get retry delay based on rate limit info
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    return this.retryAfter ? (this.retryAfter * 1000) : 5000;
  }
}

/**
 * Processing errors (record-level)
 */
class ProcessingError extends BaseError {
  constructor(record, cause, context = {}) {
    super(`Processing failed for record: ${cause.message}`, 'PROCESSING_ERROR', {
      record: record ? record.getUniqueId() : null,
      cause: cause.message,
      ...context
    });
    this.record = record;
    this.cause = cause;
  }
}

/**
 * GraphQL-specific errors
 */
class GraphQLError extends BaseError {
  constructor(errors, data = null, context = {}) {
    const errorMessages = Array.isArray(errors) ? 
      errors.map(e => e.message).join(', ') : 
      errors;
    
    super(`GraphQL error: ${errorMessages}`, 'GRAPHQL_ERROR', {
      errors: JSON.stringify(errors),
      data: data ? JSON.stringify(data) : null,
      ...context
    });
    this.errors = errors;
    this.data = data;
  }

  /**
   * Check if GraphQL errors are retryable
   * @returns {boolean} True if retryable
   */
  isRetryable() {
    // Only retry if errors indicate server issues
    if (Array.isArray(this.errors)) {
      return this.errors.some(error => 
        error.extensions && 
        error.extensions.code && 
        ['INTERNAL_ERROR', 'TIMEOUT'].includes(error.extensions.code)
      );
    }
    return false;
  }
}

/**
 * Timeout errors
 */
class TimeoutError extends BaseError {
  constructor(timeout, operation, context = {}) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, 'TIMEOUT_ERROR', {
      timeout,
      operation,
      ...context
    });
    this.timeout = timeout;
    this.operation = operation;
  }

  /**
   * Timeout errors are retryable
   * @returns {boolean} True
   */
  isRetryable() {
    return true;
  }

  /**
   * Get retry delay for timeout
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    return 3000;
  }
}

/**
 * Error factory for creating appropriate error types
 */
class ErrorFactory {
  /**
   * Create error from HTTP response
   * @param {Object} response - HTTP response object
   * @param {string} message - Error message
   * @returns {BaseError} Appropriate error type
   */
  static fromHttpResponse(response, message = 'HTTP request failed') {
    const status = response.status || response.statusCode || 0;
    
    if (status === 401 || status === 403) {
      return new AuthenticationError(message, { status, response });
    }
    
    if (status === 429) {
      const retryAfter = response.headers && response.headers['retry-after'];
      return new RateLimitError(retryAfter, { status, response });
    }
    
    return new ApiError(status, message, response);
  }

  /**
   * Create error from network exception
   * @param {Error} error - Original error
   * @returns {NetworkError} Network error
   */
  static fromNetworkError(error) {
    if (error.code === 'ECONNREFUSED') {
      return new NetworkError('Connection refused', error);
    }
    
    if (error.code === 'ENOTFOUND') {
      return new NetworkError('DNS resolution failed', error);
    }
    
    if (error.code === 'ETIMEDOUT') {
      return new TimeoutError(error.timeout || 0, 'network_request');
    }
    
    return new NetworkError(error.message, error);
  }

  /**
   * Create error from GraphQL response
   * @param {Object} graphqlResponse - GraphQL response with errors
   * @returns {GraphQLError} GraphQL error
   */
  static fromGraphQLResponse(graphqlResponse) {
    return new GraphQLError(
      graphqlResponse.errors,
      graphqlResponse.data
    );
  }
}

module.exports = {
  BaseError,
  ConfigurationError,
  ValidationError,
  ApiError,
  NetworkError,
  AuthenticationError,
  RateLimitError,
  ProcessingError,
  GraphQLError,
  TimeoutError,
  ErrorFactory
}; 