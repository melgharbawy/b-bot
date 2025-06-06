/**
 * Structured Logger
 * Provides structured logging with standardized metadata and context
 * Following Phase 4 Architecture Guidelines - Strategy Pattern for Logging
 */

/**
 * Structured logger wrapper that enforces consistent logging patterns
 */
class StructuredLogger {
  constructor(winstonLogger, component) {
    this.winston = winstonLogger;
    this.component = component;
    this.defaultMetadata = {
      component: component,
      version: require('../../../package.json').version || '1.0.0'
    };
  }

  /**
   * Log info message with structured metadata
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    this.winston.info(message, this.structureMetadata(metadata));
  }

  /**
   * Log warning message with structured metadata
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    this.winston.warn(message, this.structureMetadata(metadata));
  }

  /**
   * Log error message with structured metadata
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    // Enhance error metadata
    const errorMetadata = this.enhanceErrorMetadata(metadata);
    this.winston.error(message, this.structureMetadata(errorMetadata));
  }

  /**
   * Log debug message with structured metadata
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    this.winston.debug(message, this.structureMetadata(metadata));
  }

  /**
   * Log verbose message with structured metadata
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  verbose(message, metadata = {}) {
    this.winston.verbose(message, this.structureMetadata(metadata));
  }

  /**
   * Start an operation timer
   * @param {string} operation - Operation name
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Timer with enhanced done method
   */
  startTimer(operation, metadata = {}) {
    const timer = this.winston.startTimer(operation);
    const structuredMetadata = this.structureMetadata(metadata);
    
    // Log operation start
    this.debug(`Starting operation: ${operation}`, {
      ...structuredMetadata,
      operationState: 'started',
      operation
    });

    // Return enhanced timer
    return {
      done: (completionMetadata = {}) => {
        const result = timer.done(this.structureMetadata({
          ...structuredMetadata,
          ...completionMetadata,
          operationState: 'completed',
          operation
        }));

        this.debug(`Completed operation: ${operation}`, {
          ...structuredMetadata,
          ...completionMetadata,
          operationState: 'completed',
          operation,
          duration: result.duration,
          memoryDelta: result.memoryDelta
        });

        return result;
      }
    };
  }

  /**
   * Time an async operation with automatic logging
   * @param {string} operation - Operation name
   * @param {Function} fn - Function to execute
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Function result
   */
  async time(operation, fn, metadata = {}) {
    const timer = this.startTimer(operation, metadata);
    
    try {
      const result = await fn();
      timer.done({ success: true });
      return result;
    } catch (error) {
      timer.done({ 
        success: false, 
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Log a phase change
   * @param {string} phase - New phase name
   * @param {string} previousPhase - Previous phase name
   * @param {Object} metadata - Additional metadata
   */
  phaseChange(phase, previousPhase = null, metadata = {}) {
    this.info(`Phase changed: ${previousPhase || 'unknown'} -> ${phase}`, {
      ...metadata,
      eventType: 'phase_change',
      currentPhase: phase,
      previousPhase,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log a data quality issue
   * @param {string} issue - Issue description
   * @param {Object} data - Data that caused the issue
   * @param {string} severity - Issue severity (low, medium, high, critical)
   * @param {Object} metadata - Additional metadata
   */
  dataQualityIssue(issue, data, severity = 'medium', metadata = {}) {
    const logLevel = this.getSeverityLogLevel(severity);
    
    this[logLevel](`Data quality issue: ${issue}`, {
      ...metadata,
      eventType: 'data_quality_issue',
      issue,
      severity,
      affectedData: this.sanitizeDataForLogging(data),
      recommendations: this.getQualityRecommendations(issue, severity)
    });
  }

  /**
   * Log a processing milestone
   * @param {string} milestone - Milestone name
   * @param {Object} statistics - Current statistics
   * @param {Object} metadata - Additional metadata
   */
  milestone(milestone, statistics = {}, metadata = {}) {
    this.info(`Processing milestone: ${milestone}`, {
      ...metadata,
      eventType: 'processing_milestone',
      milestone,
      statistics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log API interaction
   * @param {string} operation - API operation
   * @param {string} endpoint - API endpoint
   * @param {Object} request - Request data (sanitized)
   * @param {Object} response - Response data (sanitized)
   * @param {Object} metadata - Additional metadata
   */
  apiInteraction(operation, endpoint, request = {}, response = {}, metadata = {}) {
    this.info(`API interaction: ${operation}`, {
      ...metadata,
      eventType: 'api_interaction',
      operation,
      endpoint,
      request: this.sanitizeDataForLogging(request),
      response: this.sanitizeDataForLogging(response),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log user action
   * @param {string} action - User action
   * @param {Object} context - Action context
   * @param {Object} metadata - Additional metadata
   */
  userAction(action, context = {}, metadata = {}) {
    this.info(`User action: ${action}`, {
      ...metadata,
      eventType: 'user_action',
      action,
      context: this.sanitizeDataForLogging(context),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log system metric
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Metric unit
   * @param {Object} metadata - Additional metadata
   */
  metric(metric, value, unit = 'count', metadata = {}) {
    this.debug(`Metric: ${metric}`, {
      ...metadata,
      eventType: 'system_metric',
      metric,
      value,
      unit,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Structure metadata with standard fields
   * @param {Object} metadata - Original metadata
   * @returns {Object} Structured metadata
   * @private
   */
  structureMetadata(metadata) {
    return {
      ...this.defaultMetadata,
      timestamp: new Date().toISOString(),
      ...metadata
    };
  }

  /**
   * Enhance error metadata with additional context
   * @param {Object} metadata - Original metadata
   * @returns {Object} Enhanced metadata
   * @private
   */
  enhanceErrorMetadata(metadata) {
    const enhanced = { ...metadata };

    // Extract error information if error object is present
    if (metadata.error && typeof metadata.error === 'object') {
      enhanced.errorDetails = {
        name: metadata.error.name,
        message: metadata.error.message,
        code: metadata.error.code,
        stack: metadata.error.stack
      };
    }

    // Add error categorization
    enhanced.errorCategory = this.categorizeError(metadata);
    enhanced.recoverySuggestion = this.getRecoverySuggestion(metadata);

    return enhanced;
  }

  /**
   * Categorize error based on metadata
   * @param {Object} metadata - Error metadata
   * @returns {string} Error category
   * @private
   */
  categorizeError(metadata) {
    if (metadata.error) {
      const errorName = metadata.error.name || '';
      const errorMessage = metadata.error.message || '';

      if (errorName.includes('Validation') || errorMessage.includes('validation')) {
        return 'validation_error';
      }
      if (errorName.includes('Network') || errorMessage.includes('network')) {
        return 'network_error';
      }
      if (errorName.includes('Auth') || errorMessage.includes('authentication')) {
        return 'authentication_error';
      }
      if (errorName.includes('Rate') || errorMessage.includes('rate limit')) {
        return 'rate_limit_error';
      }
    }

    return 'unknown_error';
  }

  /**
   * Get recovery suggestion based on error
   * @param {Object} metadata - Error metadata
   * @returns {string} Recovery suggestion
   * @private
   */
  getRecoverySuggestion(metadata) {
    const category = this.categorizeError(metadata);
    
    const suggestions = {
      validation_error: 'Review input data format and validation rules',
      network_error: 'Check network connectivity and retry with backoff',
      authentication_error: 'Verify API credentials and token validity',
      rate_limit_error: 'Reduce request rate and implement proper throttling',
      unknown_error: 'Review error details and contact support if needed'
    };

    return suggestions[category] || suggestions.unknown_error;
  }

  /**
   * Get log level based on severity
   * @param {string} severity - Issue severity
   * @returns {string} Log level
   * @private
   */
  getSeverityLogLevel(severity) {
    const levels = {
      low: 'debug',
      medium: 'warn',
      high: 'error',
      critical: 'error'
    };

    return levels[severity] || 'warn';
  }

  /**
   * Get quality recommendations based on issue
   * @param {string} issue - Data quality issue
   * @param {string} severity - Issue severity
   * @returns {Array<string>} Recommendations
   * @private
   */
  getQualityRecommendations(issue, severity) {
    const recommendations = [];

    if (issue.includes('email')) {
      recommendations.push('Validate email format before processing');
      recommendations.push('Consider implementing fuzzy matching for typos');
    }

    if (issue.includes('phone')) {
      recommendations.push('Standardize phone number format');
      recommendations.push('Allow international number formats');
    }

    if (issue.includes('duplicate')) {
      recommendations.push('Implement deduplication strategy');
      recommendations.push('Consider merge rules for duplicate data');
    }

    if (severity === 'critical') {
      recommendations.push('Stop processing and review data source');
    }

    return recommendations;
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   * @private
   */
  sanitizeDataForLogging(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    // Mask email addresses
    if (sanitized.email && typeof sanitized.email === 'string') {
      const [local, domain] = sanitized.email.split('@');
      if (local && domain) {
        sanitized.email = `${local.substring(0, 2)}***@${domain}`;
      }
    }
    
    // Mask phone numbers
    const phoneFields = ['phoneNumber', 'phone_number', 'phone'];
    phoneFields.forEach(field => {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        const phone = sanitized[field];
        if (phone.length > 4) {
          sanitized[field] = `***${phone.slice(-4)}`;
        }
      }
    });

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      ...this.winston.getStats(),
      component: this.component,
      structuredLogger: true
    };
  }

  /**
   * Set logger level
   * @param {string} level - New log level
   */
  setLevel(level) {
    this.winston.setLevel(level);
  }

  /**
   * Flush logger
   * @returns {Promise<void>}
   */
  async flush() {
    return this.winston.flush();
  }

  /**
   * Shutdown logger
   * @returns {Promise<void>}
   */
  async shutdown() {
    return this.winston.shutdown();
  }

  /**
   * Create child logger with additional context
   * @param {Object} context - Additional context
   * @returns {StructuredLogger} Child logger
   */
  child(context) {
    const childWinston = this.winston.child(context);
    const childLogger = new StructuredLogger(childWinston, this.component);
    childLogger.defaultMetadata = { ...this.defaultMetadata, ...context };
    return childLogger;
  }
}

module.exports = StructuredLogger; 