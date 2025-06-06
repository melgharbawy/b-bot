/**
 * ImportSession Domain Entity
 * Manages import session state, progress tracking, and statistics
 * Following Architecture Guidelines - Domain Layer
 */

/**
 * ImportSession entity representing a complete import operation
 */
class ImportSession {
  /**
   * Create a new ImportSession
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Session options
   */
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId || this.generateSessionId();
    this.startTime = new Date();
    this.endTime = null;
    this.status = 'initialized'; // initialized, processing, paused, completed, failed
    
    // Configuration
    this.config = {
      batchSize: options.batchSize || 5,
      rateLimitDelay: options.rateLimitDelay || 1000,
      dryRun: options.dryRun || false,
      skipDuplicates: options.skipDuplicates !== false,
      skipInvalidEmails: options.skipInvalidEmails !== false,
      allowMissingPhone: options.allowMissingPhone !== false,
      ...options
    };

    // Progress tracking
    this.progress = {
      totalRecords: 0,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      skippedRecords: 0,
      currentBatch: 0,
      totalBatches: 0,
      currentRecord: null
    };

    // Statistics
    this.statistics = {
      duplicatesFound: 0,
      invalidEmails: 0,
      missingPhones: 0,
      validationErrors: 0,
      apiErrors: 0,
      networkErrors: 0,
      processingTime: 0,
      averageBatchTime: 0,
      recordsPerSecond: 0
    };

    // Data tracking
    this.data = {
      successfulRecords: [],
      failedRecords: [],
      skippedRecords: [],
      duplicateRecords: [],
      validationErrors: []
    };

    // Resumption support
    this.resumeData = {
      lastProcessedIndex: -1,
      canResume: false,
      resumePoint: null
    };

    // Event tracking
    this.events = [];
    
    // Current phase tracking
    this.currentPhase = 'initialization';
  }

  /**
   * Generate a unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Start the import session
   * @param {number} totalRecords - Total number of records to process
   */
  start(totalRecords) {
    this.status = 'processing';
    this.startTime = new Date();
    this.progress.totalRecords = totalRecords;
    this.progress.totalBatches = Math.ceil(totalRecords / this.config.batchSize);
    
    this.addEvent('session_started', {
      totalRecords,
      totalBatches: this.progress.totalBatches,
      config: this.config
    });
  }

  /**
   * Mark session as completed
   * @param {boolean} success - Whether session completed successfully
   */
  complete(success = true) {
    this.status = success ? 'completed' : 'failed';
    this.endTime = new Date();
    this.calculateFinalStatistics();
    
    this.addEvent('session_completed', {
      success,
      duration: this.getDuration(),
      finalStatistics: this.statistics
    });
  }

  /**
   * Pause the import session
   */
  pause() {
    this.status = 'paused';
    this.resumeData.canResume = true;
    this.resumeData.resumePoint = {
      recordIndex: this.progress.processedRecords,
      batchIndex: this.progress.currentBatch,
      timestamp: new Date().toISOString()
    };
    
    this.addEvent('session_paused', {
      resumePoint: this.resumeData.resumePoint
    });
  }

  /**
   * Resume the import session
   */
  resume() {
    this.status = 'processing';
    this.addEvent('session_resumed', {
      resumedFrom: this.resumeData.resumePoint
    });
  }

  /**
   * Record successful processing of a record
   * @param {Object} record - The processed record
   * @param {Object} apiResponse - API response
   */
  recordSuccess(record, apiResponse = null) {
    this.progress.successfulRecords++;
    this.progress.processedRecords++;
    this.data.successfulRecords.push({
      record: record.toLogSafeJSON ? record.toLogSafeJSON() : record,
      timestamp: new Date().toISOString(),
      apiResponse
    });
    
    this.updateProgress();
  }

  /**
   * Record failed processing of a record
   * @param {Object} record - The failed record
   * @param {Error} error - The error that occurred
   */
  recordFailure(record, error) {
    this.progress.failedRecords++;
    this.progress.processedRecords++;
    
    // Categorize error types
    if (error.name === 'ValidationError') {
      this.statistics.validationErrors++;
    } else if (error.name === 'ApiError') {
      this.statistics.apiErrors++;
    } else if (error.name === 'NetworkError') {
      this.statistics.networkErrors++;
    }
    
    this.data.failedRecords.push({
      record: record.toLogSafeJSON ? record.toLogSafeJSON() : record,
      error: {
        name: error.name,
        message: error.message,
        code: error.code || 'UNKNOWN'
      },
      timestamp: new Date().toISOString()
    });
    
    this.updateProgress();
  }

  /**
   * Record skipped processing of a record
   * @param {Object} record - The skipped record
   * @param {string} reason - Reason for skipping
   */
  recordSkipped(record, reason) {
    this.progress.skippedRecords++;
    this.progress.processedRecords++;
    
    // Update statistics based on skip reason
    switch (reason) {
      case 'duplicate':
        this.statistics.duplicatesFound++;
        this.data.duplicateRecords.push(record);
        break;
      case 'invalid_email':
        this.statistics.invalidEmails++;
        break;
      case 'missing_phone':
        this.statistics.missingPhones++;
        break;
    }
    
    this.data.skippedRecords.push({
      record: record.toLogSafeJSON ? record.toLogSafeJSON() : record,
      reason,
      timestamp: new Date().toISOString()
    });
    
    this.updateProgress();
  }

  /**
   * Update batch progress
   * @param {number} batchIndex - Current batch index
   * @param {number} batchTime - Time taken for batch (ms)
   */
  updateBatch(batchIndex, batchTime = 0) {
    this.progress.currentBatch = batchIndex;
    
    if (batchTime > 0) {
      // Calculate running average of batch times
      const totalBatches = batchIndex + 1;
      this.statistics.averageBatchTime = (
        (this.statistics.averageBatchTime * (totalBatches - 1) + batchTime) / totalBatches
      );
    }
    
    this.updateProgress();
  }

  /**
   * Update overall progress and statistics
   */
  updateProgress() {
    const elapsed = this.getDuration();
    if (elapsed > 0 && this.progress.processedRecords > 0) {
      this.statistics.recordsPerSecond = this.progress.processedRecords / (elapsed / 1000);
    }
    
    this.resumeData.lastProcessedIndex = this.progress.processedRecords - 1;
  }

  /**
   * Calculate final statistics
   */
  calculateFinalStatistics() {
    this.statistics.processingTime = this.getDuration();
    this.statistics.recordsPerSecond = this.progress.processedRecords / (this.statistics.processingTime / 1000);
  }

  /**
   * Get session duration in milliseconds
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Get completion percentage
   * @returns {number} Percentage completed (0-100)
   */
  getCompletionPercentage() {
    if (this.progress.totalRecords === 0) return 0;
    return Math.round((this.progress.processedRecords / this.progress.totalRecords) * 100);
  }

  /**
   * Get estimated time remaining
   * @returns {number} Estimated time in milliseconds
   */
  getEstimatedTimeRemaining() {
    if (this.statistics.recordsPerSecond === 0) return null;
    
    const remainingRecords = this.progress.totalRecords - this.progress.processedRecords;
    return remainingRecords / this.statistics.recordsPerSecond * 1000;
  }

  /**
   * Get current status information
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      currentPhase: this.currentPhase,
      progress: {
        ...this.progress,
        percentage: this.getCompletionPercentage(),
        estimatedTimeRemaining: this.getEstimatedTimeRemaining()
      },
      statistics: this.statistics,
      duration: this.getDuration(),
      canResume: this.resumeData.canResume
    };
  }

  /**
   * Check if session is in a terminal state
   * @returns {boolean} True if session is completed or failed
   */
  isCompleted() {
    return ['completed', 'failed'].includes(this.status);
  }

  /**
   * Check if session can be resumed
   * @returns {boolean} True if session can be resumed
   */
  canResume() {
    return this.resumeData.canResume && this.status === 'paused';
  }

  /**
   * Set current processing phase
   * @param {string} phase - Current phase name
   */
  setPhase(phase) {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;
    
    this.addEvent('phase_changed', {
      previousPhase,
      currentPhase: phase
    });
  }

  /**
   * Get current processing phase
   * @returns {string} Current phase
   */
  getCurrentPhase() {
    return this.currentPhase;
  }

  /**
   * Add an event to the session log
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  addEvent(type, data = {}) {
    this.events.push({
      type,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get session summary for reporting
   * @returns {Object} Session summary
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      duration: this.getDuration(),
      status: this.status,
      config: this.config,
      progress: this.progress,
      statistics: this.statistics,
      successRate: this.progress.totalRecords > 0 ? 
        Math.round((this.progress.successfulRecords / this.progress.totalRecords) * 100) : 0
    };
  }

  /**
   * Export session data for persistence
   * @returns {Object} Complete session data
   */
  export() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      status: this.status,
      config: this.config,
      progress: this.progress,
      statistics: this.statistics,
      data: this.data,
      resumeData: this.resumeData,
      events: this.events
    };
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return this.export();
  }

  /**
   * Create string representation
   * @returns {string} String representation
   */
  toString() {
    return `ImportSession{id: ${this.sessionId}, status: ${this.status}, progress: ${this.getCompletionPercentage()}%}`;
  }
}

module.exports = ImportSession; 