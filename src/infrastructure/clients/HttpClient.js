/**
 * HTTP Client with Retry Logic and Rate Limiting
 * Following Architecture Rules 4 (Async/Await) and 7 (Rate Limiting)
 */

const axios = require('axios');
const { ErrorFactory, TimeoutError } = require('../errors');

/**
 * Request result wrapper
 */
class RequestResult {
  constructor(success, data = null, error = null, attempts = 1, duration = 0) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.attempts = attempts;
    this.duration = duration;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      success: this.success,
      data: this.data,
      error: this.error ? this.error.toJSON() : null,
      attempts: this.attempts,
      duration: this.duration,
      timestamp: this.timestamp
    };
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  constructor(requestsPerSecond = 1, burstSize = 5) {
    this.tokens = burstSize;
    this.maxTokens = burstSize;
    this.refillRate = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire a token for making a request
   * @returns {Promise<void>} Resolves when token is available
   */
  async acquire() {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time for next token
    const waitTime = (1 / this.refillRate) * 1000;
    await this.sleep(waitTime);
    return this.acquire();
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>} Promise that resolves after sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current token count
   * @returns {number} Available tokens
   */
  getAvailableTokens() {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}

/**
 * HTTP Client with retry logic and rate limiting
 */
class HttpClient {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      retryBaseDelay: options.retryBaseDelay || 1000,
      rateLimitRequestsPerSecond: options.rateLimitRequestsPerSecond || 1,
      rateLimitBurstSize: options.rateLimitBurstSize || 5,
      ...options
    };

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter(
      this.config.rateLimitRequestsPerSecond,
      this.config.rateLimitBurstSize
    );

    // Create axios instance
    this.axios = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Laylo-CSV-Importer/1.0.0'
      }
    });

    // Add request interceptor for logging
    this.axios.interceptors.request.use(
      config => {
        config.metadata = {
          startTime: Date.now(),
          requestId: this.generateRequestId()
        };
        
        if (this.logger) {
          this.logger.debug('HTTP request started', {
            requestId: config.metadata.requestId,
            method: config.method,
            url: config.url,
            headers: this.sanitizeHeaders(config.headers)
          });
        }
        
        return config;
      },
      error => Promise.reject(error)
    );

    // Add response interceptor for logging
    this.axios.interceptors.response.use(
      response => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        if (this.logger) {
          this.logger.debug('HTTP request completed', {
            requestId: response.config.metadata.requestId,
            status: response.status,
            duration,
            responseSize: JSON.stringify(response.data).length
          });
        }
        
        return response;
      },
      error => {
        const duration = error.config ? 
          Date.now() - error.config.metadata.startTime : 0;
        
        if (this.logger) {
          this.logger.debug('HTTP request failed', {
            requestId: error.config?.metadata?.requestId,
            status: error.response?.status,
            duration,
            error: error.message
          });
        }
        
        return Promise.reject(error);
      }
    );

    this.logger = null;
  }

  /**
   * Set logger instance
   * @param {Object} logger - Logger instance
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   * @param {Object} headers - Headers object
   * @returns {Object} Sanitized headers
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    
    // Mask authorization headers
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer ***';
    }
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer ***';
    }
    
    return sanitized;
  }

  /**
   * Calculate delay for exponential backoff
   * @param {number} attempt - Attempt number (0-based)
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attempt, baseDelay = this.config.retryBaseDelay) {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Use our custom error types if available
    if (error.isRetryable && typeof error.isRetryable === 'function') {
      return error.isRetryable();
    }

    // Check axios error
    if (error.response) {
      const status = error.response.status;
      return [429, 500, 502, 503, 504].includes(status);
    }

    // Network errors are usually retryable
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }

  /**
   * Get retry delay from error
   * @param {Error} error - Error object
   * @param {number} attempt - Attempt number
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay(error, attempt) {
    // Use custom error delay if available
    if (error.getRetryDelay && typeof error.getRetryDelay === 'function') {
      return error.getRetryDelay();
    }

    // Check for Retry-After header
    if (error.response && error.response.headers['retry-after']) {
      const retryAfter = parseInt(error.response.headers['retry-after'], 10);
      return retryAfter * 1000; // Convert to milliseconds
    }

    // Use exponential backoff
    return this.calculateBackoffDelay(attempt);
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>} Promise that resolves after sleep
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with retry logic
   * @param {Object} requestConfig - Axios request configuration
   * @returns {Promise<RequestResult>} Request result
   */
  async request(requestConfig) {
    const startTime = Date.now();
    let lastError = null;
    let attempts = 0;

    // Apply rate limiting
    await this.rateLimiter.acquire();

    while (attempts < this.config.retryAttempts) {
      attempts++;

      try {
        const response = await this.axios(requestConfig);
        const duration = Date.now() - startTime;
        
        return new RequestResult(true, response.data, null, attempts, duration);
      } catch (error) {
        lastError = this.convertError(error);
        
        if (this.logger) {
          this.logger.warn('HTTP request attempt failed', {
            attempt: attempts,
            maxAttempts: this.config.retryAttempts,
            error: lastError.message,
            retryable: this.isRetryableError(lastError)
          });
        }

        // Don't retry if this is the last attempt or error is not retryable
        if (attempts >= this.config.retryAttempts || !this.isRetryableError(lastError)) {
          break;
        }

        // Calculate and wait for retry delay
        const retryDelay = this.getRetryDelay(lastError, attempts - 1);
        
        if (this.logger) {
          this.logger.info('Retrying request', {
            attempt: attempts + 1,
            delay: retryDelay,
            reason: lastError.message
          });
        }

        await this.sleep(retryDelay);
      }
    }

    const duration = Date.now() - startTime;
    return new RequestResult(false, null, lastError, attempts, duration);
  }

  /**
   * Convert axios error to our custom error types
   * @param {Error} error - Axios error
   * @returns {BaseError} Custom error
   */
  convertError(error) {
    if (error.response) {
      // HTTP error with response
      return ErrorFactory.fromHttpResponse(error.response, error.message);
    } else if (error.request) {
      // Network error
      return ErrorFactory.fromNetworkError(error);
    } else {
      // Other error
      return ErrorFactory.fromNetworkError(error);
    }
  }

  /**
   * Make GET request
   * @param {string} url - Request URL
   * @param {Object} config - Additional config
   * @returns {Promise<RequestResult>} Request result
   */
  async get(url, config = {}) {
    return this.request({
      method: 'GET',
      url,
      ...config
    });
  }

  /**
   * Make POST request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} config - Additional config
   * @returns {Promise<RequestResult>} Request result
   */
  async post(url, data = {}, config = {}) {
    return this.request({
      method: 'POST',
      url,
      data,
      ...config
    });
  }

  /**
   * Make PUT request
   * @param {string} url - Request URL
   * @param {Object} data - Request data
   * @param {Object} config - Additional config
   * @returns {Promise<RequestResult>} Request result
   */
  async put(url, data = {}, config = {}) {
    return this.request({
      method: 'PUT',
      url,
      data,
      ...config
    });
  }

  /**
   * Make DELETE request
   * @param {string} url - Request URL
   * @param {Object} config - Additional config
   * @returns {Promise<RequestResult>} Request result
   */
  async delete(url, config = {}) {
    return this.request({
      method: 'DELETE',
      url,
      ...config
    });
  }

  /**
   * Get rate limiter status
   * @returns {Object} Rate limiter status
   */
  getRateLimiterStatus() {
    return {
      availableTokens: this.rateLimiter.getAvailableTokens(),
      maxTokens: this.rateLimiter.maxTokens,
      refillRate: this.rateLimiter.refillRate
    };
  }

  /**
   * Update rate limiter configuration
   * @param {number} requestsPerSecond - Requests per second
   * @param {number} burstSize - Burst size
   */
  updateRateLimit(requestsPerSecond, burstSize) {
    this.rateLimiter = new RateLimiter(requestsPerSecond, burstSize);
    this.config.rateLimitRequestsPerSecond = requestsPerSecond;
    this.config.rateLimitBurstSize = burstSize;
  }
}

module.exports = { HttpClient, RequestResult, RateLimiter }; 