/**
 * Session Logger
 * Session-specific logging with session tracking and lifecycle management
 * Following Phase 4 Architecture Guidelines - Session Management
 */

/**
 * Session logger that tracks session-specific events and state
 */
class SessionLogger {
  constructor(winstonLogger, sessionId) {
    this.winston = winstonLogger;
    this.sessionId = sessionId;
    this.sessionStartTime = new Date();
    this.sessionMetadata = {
      sessionId: sessionId,
      sessionStartTime: this.sessionStartTime.toISOString(),
      sessionType: 'import'
    };
    
    // Session state tracking
    this.sessionState = {
      phase: 'initialization',
      status: 'active',
      recordsProcessed: 0,
      recordsSuccessful: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
      milestones: []
    };

    // Session timers
    this.sessionTimers = new Map();
    
    // Log session start
    this.sessionStart();
  }

  /**
   * Log session start
   */
  sessionStart() {
    this.winston.info('Import session started', {
      ...this.sessionMetadata,
      eventType: 'session_lifecycle',
      lifecycle: 'start',
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform
    });
  }

  /**
   * Log session phase change
   * @param {string} newPhase - New phase name
   * @param {Object} phaseData - Phase-specific data
   */
  phaseChange(newPhase, phaseData = {}) {
    const previousPhase = this.sessionState.phase;
    this.sessionState.phase = newPhase;

    this.winston.info(`Session phase change: ${previousPhase} -> ${newPhase}`, {
      ...this.sessionMetadata,
      eventType: 'session_phase_change',
      previousPhase,
      currentPhase: newPhase,
      phaseData,
      sessionDuration: this.getSessionDuration(),
      timestamp: new Date().toISOString()
    });

    // Add milestone
    this.sessionState.milestones.push({
      phase: newPhase,
      timestamp: new Date().toISOString(),
      duration: this.getSessionDuration(),
      data: phaseData
    });
  }

  /**
   * Log successful record processing
   * @param {Object} record - Processed record
   * @param {Object} result - Processing result
   */
  recordSuccess(record, result = {}) {
    this.sessionState.recordsProcessed++;
    this.sessionState.recordsSuccessful++;

    this.winston.debug('Record processed successfully', {
      ...this.sessionMetadata,
      eventType: 'record_processing',
      outcome: 'success',
      recordData: this.sanitizeRecord(record),
      result: this.sanitizeData(result),
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log failed record processing
   * @param {Object} record - Failed record
   * @param {Error} error - Processing error
   */
  recordFailure(record, error) {
    this.sessionState.recordsProcessed++;
    this.sessionState.recordsFailed++;
    this.sessionState.errors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      record: this.sanitizeRecord(record),
      phase: this.sessionState.phase
    });

    this.winston.warn('Record processing failed', {
      ...this.sessionMetadata,
      eventType: 'record_processing',
      outcome: 'failure',
      recordData: this.sanitizeRecord(record),
      error: {
        message: error.message,
        name: error.name,
        code: error.code
      },
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log batch processing start
   * @param {number} batchNumber - Batch number
   * @param {number} batchSize - Size of the batch
   * @param {Object} batchData - Batch metadata
   */
  batchStart(batchNumber, batchSize, batchData = {}) {
    const timerId = `batch_${batchNumber}`;
    this.sessionTimers.set(timerId, Date.now());

    this.winston.info(`Batch ${batchNumber} processing started`, {
      ...this.sessionMetadata,
      eventType: 'batch_processing',
      lifecycle: 'start',
      batchNumber,
      batchSize,
      batchData,
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log batch processing completion
   * @param {number} batchNumber - Batch number
   * @param {Object} batchResult - Batch processing result
   */
  batchComplete(batchNumber, batchResult = {}) {
    const timerId = `batch_${batchNumber}`;
    const batchDuration = this.sessionTimers.has(timerId) ? 
      Date.now() - this.sessionTimers.get(timerId) : 0;
    this.sessionTimers.delete(timerId);

    this.winston.info(`Batch ${batchNumber} processing completed`, {
      ...this.sessionMetadata,
      eventType: 'batch_processing',
      lifecycle: 'complete',
      batchNumber,
      batchDuration,
      batchResult: this.sanitizeData(batchResult),
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log session warning
   * @param {string} message - Warning message
   * @param {Object} warningData - Warning-specific data
   */
  sessionWarning(message, warningData = {}) {
    this.sessionState.warnings.push({
      timestamp: new Date().toISOString(),
      message,
      data: warningData,
      phase: this.sessionState.phase
    });

    this.winston.warn(`Session warning: ${message}`, {
      ...this.sessionMetadata,
      eventType: 'session_warning',
      warningData,
      phase: this.sessionState.phase,
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log session error
   * @param {string} message - Error message
   * @param {Error|Object} error - Error object or data
   */
  sessionError(message, error = {}) {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    } : error;

    this.sessionState.errors.push({
      timestamp: new Date().toISOString(),
      message,
      error: errorData,
      phase: this.sessionState.phase
    });

    this.winston.error(`Session error: ${message}`, {
      ...this.sessionMetadata,
      eventType: 'session_error',
      error: errorData,
      phase: this.sessionState.phase,
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log session pause
   * @param {string} reason - Pause reason
   * @param {Object} pauseData - Pause-specific data
   */
  sessionPause(reason, pauseData = {}) {
    this.sessionState.status = 'paused';

    this.winston.info(`Session paused: ${reason}`, {
      ...this.sessionMetadata,
      eventType: 'session_lifecycle',
      lifecycle: 'pause',
      reason,
      pauseData,
      sessionDuration: this.getSessionDuration(),
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log session resume
   * @param {Object} resumeData - Resume-specific data
   */
  sessionResume(resumeData = {}) {
    this.sessionState.status = 'active';

    this.winston.info('Session resumed', {
      ...this.sessionMetadata,
      eventType: 'session_lifecycle',
      lifecycle: 'resume',
      resumeData,
      sessionDuration: this.getSessionDuration(),
      sessionStats: this.getSessionStats()
    });
  }

  /**
   * Log session completion
   * @param {boolean} success - Whether session completed successfully
   * @param {Object} summary - Session summary data
   */
  sessionComplete(success, summary = {}) {
    this.sessionState.status = success ? 'completed' : 'failed';
    const sessionEndTime = new Date();
    const totalDuration = sessionEndTime.getTime() - this.sessionStartTime.getTime();

    this.winston.info(`Session ${success ? 'completed successfully' : 'failed'}`, {
      ...this.sessionMetadata,
      eventType: 'session_lifecycle',
      lifecycle: 'complete',
      success,
      sessionEndTime: sessionEndTime.toISOString(),
      totalDuration,
      finalStats: this.getSessionStats(),
      summary: this.sanitizeData(summary),
      errorCount: this.sessionState.errors.length,
      warningCount: this.sessionState.warnings.length,
      milestoneCount: this.sessionState.milestones.length
    });
  }

  /**
   * Log API interaction within session context
   * @param {string} operation - API operation
   * @param {Object} request - Request data
   * @param {Object} response - Response data
   * @param {number} duration - Request duration
   */
  apiInteraction(operation, request = {}, response = {}, duration = 0) {
    this.winston.debug(`API interaction: ${operation}`, {
      ...this.sessionMetadata,
      eventType: 'api_interaction',
      operation,
      duration,
      request: this.sanitizeData(request),
      response: this.sanitizeData(response),
      phase: this.sessionState.phase
    });
  }

  /**
   * Log performance metrics
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Metric unit
   * @param {Object} context - Additional context
   */
  performanceMetric(metric, value, unit = 'ms', context = {}) {
    this.winston.debug(`Performance metric: ${metric}`, {
      ...this.sessionMetadata,
      eventType: 'performance_metric',
      metric,
      value,
      unit,
      context,
      phase: this.sessionState.phase,
      sessionDuration: this.getSessionDuration()
    });
  }

  /**
   * Create session checkpoint
   * @param {Object} checkpointData - Checkpoint data
   */
  checkpoint(checkpointData = {}) {
    this.winston.info('Session checkpoint created', {
      ...this.sessionMetadata,
      eventType: 'session_checkpoint',
      checkpoint: {
        timestamp: new Date().toISOString(),
        phase: this.sessionState.phase,
        sessionStats: this.getSessionStats(),
        ...checkpointData
      }
    });
  }

  /**
   * Get current session statistics
   * @returns {Object} Session statistics
   */
  getSessionStats() {
    return {
      recordsProcessed: this.sessionState.recordsProcessed,
      recordsSuccessful: this.sessionState.recordsSuccessful,
      recordsFailed: this.sessionState.recordsFailed,
      successRate: this.sessionState.recordsProcessed > 0 ? 
        Math.round((this.sessionState.recordsSuccessful / this.sessionState.recordsProcessed) * 100) : 0,
      phase: this.sessionState.phase,
      status: this.sessionState.status,
      duration: this.getSessionDuration(),
      errorCount: this.sessionState.errors.length,
      warningCount: this.sessionState.warnings.length
    };
  }

  /**
   * Get session duration in milliseconds
   * @returns {number} Duration in milliseconds
   */
  getSessionDuration() {
    return Date.now() - this.sessionStartTime.getTime();
  }

  /**
   * Get session summary
   * @returns {Object} Complete session summary
   */
  getSessionSummary() {
    return {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime.toISOString(),
      duration: this.getSessionDuration(),
      state: this.sessionState,
      stats: this.getSessionStats(),
      milestones: this.sessionState.milestones,
      errors: this.sessionState.errors,
      warnings: this.sessionState.warnings
    };
  }

  /**
   * Sanitize record data for logging
   * @param {Object} record - Record to sanitize
   * @returns {Object} Sanitized record
   * @private
   */
  sanitizeRecord(record) {
    if (!record || typeof record !== 'object') {
      return record;
    }

    const sanitized = { ...record };
    
    // Mask email
    if (sanitized.email) {
      const [local, domain] = sanitized.email.split('@');
      if (local && domain) {
        sanitized.email = `${local.substring(0, 2)}***@${domain}`;
      }
    }
    
    // Mask phone number
    if (sanitized.phoneNumber && sanitized.phoneNumber.length > 4) {
      sanitized.phoneNumber = `***${sanitized.phoneNumber.slice(-4)}`;
    }

    return sanitized;
  }

  /**
   * Sanitize general data for logging
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   * @private
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    // Remove or mask sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'apiKey'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Delegate standard logging methods to winston with session context
   */
  info(message, metadata = {}) {
    this.winston.info(message, {
      ...this.sessionMetadata,
      phase: this.sessionState.phase,
      ...metadata
    });
  }

  warn(message, metadata = {}) {
    this.winston.warn(message, {
      ...this.sessionMetadata,
      phase: this.sessionState.phase,
      ...metadata
    });
  }

  error(message, metadata = {}) {
    this.winston.error(message, {
      ...this.sessionMetadata,
      phase: this.sessionState.phase,
      ...metadata
    });
  }

  debug(message, metadata = {}) {
    this.winston.debug(message, {
      ...this.sessionMetadata,
      phase: this.sessionState.phase,
      ...metadata
    });
  }

  /**
   * Start a timer for session-specific operations
   * @param {string} operation - Operation name
   * @returns {Object} Timer object
   */
  startTimer(operation) {
    const timer = this.winston.startTimer(operation);
    
    return {
      done: (metadata = {}) => {
        return timer.done({
          ...this.sessionMetadata,
          phase: this.sessionState.phase,
          ...metadata
        });
      }
    };
  }

  /**
   * Time an operation within session context
   * @param {string} operation - Operation name
   * @param {Function} fn - Function to execute
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Function result
   */
  async time(operation, fn, metadata = {}) {
    return this.winston.time(operation, fn, {
      ...this.sessionMetadata,
      phase: this.sessionState.phase,
      ...metadata
    });
  }

  /**
   * Flush session logs
   * @returns {Promise<void>}
   */
  async flush() {
    return this.winston.flush();
  }

  /**
   * Shutdown session logger
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Log session shutdown if not already completed
    if (this.sessionState.status === 'active') {
      this.sessionComplete(false, { reason: 'logger_shutdown' });
    }
    
    return this.winston.shutdown();
  }
}

module.exports = SessionLogger; 