/**
 * Progress Tracker
 * Main progress tracking coordinator using Observer pattern
 * Following Phase 4 Architecture Guidelines - Observer Pattern for Progress Tracking
 */

/**
 * Progress event types
 */
const ProgressEventType = {
  PHASE_CHANGE: 'phase_change',
  BATCH_START: 'batch_start',
  BATCH_PROGRESS: 'batch_progress',
  BATCH_COMPLETE: 'batch_complete',
  RECORD_PROCESSED: 'record_processed',
  ERROR_OCCURRED: 'error_occurred',
  WARNING_OCCURRED: 'warning_occurred',
  MILESTONE_REACHED: 'milestone_reached',
  SESSION_COMPLETE: 'session_complete',
  STATISTICS_UPDATE: 'statistics_update'
};

/**
 * Progress state representation
 */
class ProgressState {
  constructor() {
    this.sessionId = null;
    this.currentPhase = 'initialization';
    this.status = 'idle'; // idle, active, paused, completed, failed
    this.startTime = null;
    this.endTime = null;
    
    // Overall progress
    this.totalRecords = 0;
    this.processedRecords = 0;
    this.successfulRecords = 0;
    this.failedRecords = 0;
    
    // Batch progress
    this.totalBatches = 0;
    this.currentBatch = 0;
    this.currentBatchSize = 0;
    this.currentBatchProcessed = 0;
    
    // Performance metrics
    this.recordsPerSecond = 0;
    this.estimatedTimeRemaining = 0;
    this.averageBatchTime = 0;
    
    // Error tracking
    this.errors = [];
    this.warnings = [];
    this.lastError = null;
    this.lastWarning = null;
    
    // Milestones
    this.milestones = [];
    this.lastMilestone = null;
    
    // Statistics
    this.statistics = {
      successRate: 0,
      errorRate: 0,
      throughput: 0,
      duration: 0,
      memoryUsage: 0
    };
  }

  /**
   * Update progress state with new event data
   * @param {Object} event - Progress event
   */
  update(event) {
    const now = new Date();
    
    switch (event.type) {
      case ProgressEventType.PHASE_CHANGE:
        this.currentPhase = event.phase;
        break;
        
      case ProgressEventType.BATCH_START:
        this.currentBatch = event.batchNumber;
        this.currentBatchSize = event.batchSize;
        this.currentBatchProcessed = 0;
        break;
        
      case ProgressEventType.BATCH_PROGRESS:
        this.currentBatchProcessed = event.processed;
        break;
        
      case ProgressEventType.BATCH_COMPLETE:
        this.currentBatchProcessed = this.currentBatchSize;
        if (event.duration) {
          this.updateAverageBatchTime(event.duration);
        }
        break;
        
      case ProgressEventType.RECORD_PROCESSED:
        this.processedRecords++;
        if (event.success) {
          this.successfulRecords++;
        } else {
          this.failedRecords++;
        }
        this.updatePerformanceMetrics();
        break;
        
      case ProgressEventType.ERROR_OCCURRED:
        this.errors.push({
          timestamp: now,
          error: event.error,
          context: event.context
        });
        this.lastError = event.error;
        break;
        
      case ProgressEventType.WARNING_OCCURRED:
        this.warnings.push({
          timestamp: now,
          warning: event.warning,
          context: event.context
        });
        this.lastWarning = event.warning;
        break;
        
      case ProgressEventType.MILESTONE_REACHED:
        this.milestones.push({
          timestamp: now,
          milestone: event.milestone,
          data: event.data
        });
        this.lastMilestone = event.milestone;
        break;
        
      case ProgressEventType.SESSION_COMPLETE:
        this.status = event.success ? 'completed' : 'failed';
        this.endTime = now;
        break;
        
      case ProgressEventType.STATISTICS_UPDATE:
        if (event.statistics) {
          this.statistics = { ...this.statistics, ...event.statistics };
        }
        break;
    }
    
    // Update common fields
    this.updateCommonMetrics();
  }

  /**
   * Update performance metrics
   * @private
   */
  updatePerformanceMetrics() {
    if (!this.startTime) return;
    
    const duration = Date.now() - this.startTime.getTime();
    const seconds = duration / 1000;
    
    if (seconds > 0) {
      this.recordsPerSecond = this.processedRecords / seconds;
      
      if (this.recordsPerSecond > 0 && this.totalRecords > 0) {
        const remainingRecords = this.totalRecords - this.processedRecords;
        this.estimatedTimeRemaining = remainingRecords / this.recordsPerSecond;
      }
    }
  }

  /**
   * Update average batch processing time
   * @param {number} duration - Batch duration in milliseconds
   * @private
   */
  updateAverageBatchTime(duration) {
    if (this.averageBatchTime === 0) {
      this.averageBatchTime = duration;
    } else {
      // Exponential moving average
      this.averageBatchTime = (this.averageBatchTime * 0.8) + (duration * 0.2);
    }
  }

  /**
   * Update common metrics
   * @private
   */
  updateCommonMetrics() {
    // Success/error rates
    if (this.processedRecords > 0) {
      this.statistics.successRate = (this.successfulRecords / this.processedRecords) * 100;
      this.statistics.errorRate = (this.failedRecords / this.processedRecords) * 100;
    }
    
    // Throughput
    this.statistics.throughput = this.recordsPerSecond;
    
    // Duration
    if (this.startTime) {
      this.statistics.duration = Date.now() - this.startTime.getTime();
    }
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    this.statistics.memoryUsage = memoryUsage.heapUsed / 1024 / 1024; // MB
  }

  /**
   * Get completion percentage
   * @returns {number} Percentage (0-100)
   */
  getCompletionPercentage() {
    if (this.totalRecords === 0) return 0;
    return Math.min(100, (this.processedRecords / this.totalRecords) * 100);
  }

  /**
   * Get current status summary
   * @returns {Object} Status summary
   */
  getStatusSummary() {
    return {
      sessionId: this.sessionId,
      phase: this.currentPhase,
      status: this.status,
      completion: this.getCompletionPercentage(),
      processed: this.processedRecords,
      total: this.totalRecords,
      successful: this.successfulRecords,
      failed: this.failedRecords,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      eta: this.estimatedTimeRemaining,
      throughput: this.recordsPerSecond,
      statistics: this.statistics,
      errors: this.errors.length,
      warnings: this.warnings.length
    };
  }
}

/**
 * Main progress tracker with observer pattern
 */
class ProgressTracker {
  constructor(sessionId = null) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.observers = [];
    this.state = new ProgressState();
    this.state.sessionId = this.sessionId;
    this.updateInterval = null;
    this.updateFrequency = 100; // Update frequency in milliseconds
    this.lastUpdateTime = 0;
  }

  /**
   * Add an observer
   * @param {Object} observer - Observer with onProgressUpdate method
   */
  addObserver(observer) {
    if (observer && typeof observer.onProgressUpdate === 'function') {
      this.observers.push(observer);
    } else {
      throw new Error('Observer must have onProgressUpdate method');
    }
  }

  /**
   * Remove an observer
   * @param {Object} observer - Observer to remove
   */
  removeObserver(observer) {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Remove all observers
   */
  clearObservers() {
    this.observers = [];
  }

  /**
   * Start progress tracking session
   * @param {Object} config - Session configuration
   */
  startSession(config = {}) {
    this.state.startTime = new Date();
    this.state.status = 'active';
    this.state.totalRecords = config.totalRecords || 0;
    this.state.totalBatches = config.totalBatches || 0;
    
    this.updateProgress({
      type: ProgressEventType.PHASE_CHANGE,
      phase: config.initialPhase || 'initialization',
      sessionConfig: config
    });

    // Start periodic updates
    if (config.enablePeriodicUpdates !== false) {
      this.startPeriodicUpdates();
    }
  }

  /**
   * Update progress with new event
   * @param {Object} event - Progress event
   */
  updateProgress(event) {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Always update internal state (don't throttle state updates)
    this.state.update(event);

    // Throttle observer notifications to prevent overwhelming them
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateFrequency && 
        event.type !== ProgressEventType.SESSION_COMPLETE &&
        event.type !== ProgressEventType.PHASE_CHANGE &&
        event.type !== ProgressEventType.MILESTONE_REACHED &&
        event.type !== ProgressEventType.ERROR_OCCURRED) {
      return;
    }
    this.lastUpdateTime = now;

    // Notify all observers
    this.notifyObservers(event);
  }

  /**
   * Phase change notification
   * @param {string} newPhase - New phase name
   * @param {Object} phaseData - Phase-specific data
   */
  phaseChange(newPhase, phaseData = {}) {
    this.updateProgress({
      type: ProgressEventType.PHASE_CHANGE,
      phase: newPhase,
      previousPhase: this.state.currentPhase,
      phaseData
    });
  }

  /**
   * Batch processing start notification
   * @param {number} batchNumber - Batch number
   * @param {number} batchSize - Size of batch
   * @param {Object} batchData - Batch metadata
   */
  batchStart(batchNumber, batchSize, batchData = {}) {
    this.updateProgress({
      type: ProgressEventType.BATCH_START,
      batchNumber,
      batchSize,
      batchData
    });
  }

  /**
   * Batch progress update
   * @param {number} batchNumber - Batch number
   * @param {number} processed - Records processed in batch
   */
  batchProgress(batchNumber, processed) {
    this.updateProgress({
      type: ProgressEventType.BATCH_PROGRESS,
      batchNumber,
      processed
    });
  }

  /**
   * Batch completion notification
   * @param {number} batchNumber - Batch number
   * @param {Object} batchResult - Batch results
   * @param {number} duration - Batch duration in milliseconds
   */
  batchComplete(batchNumber, batchResult = {}, duration = 0) {
    this.updateProgress({
      type: ProgressEventType.BATCH_COMPLETE,
      batchNumber,
      batchResult,
      duration
    });
  }

  /**
   * Record processing notification
   * @param {boolean} success - Whether record was processed successfully
   * @param {Object} recordData - Record metadata
   */
  recordProcessed(success, recordData = {}) {
    this.updateProgress({
      type: ProgressEventType.RECORD_PROCESSED,
      success,
      recordData
    });
  }

  /**
   * Error notification
   * @param {Error} error - Error that occurred
   * @param {Object} context - Error context
   */
  errorOccurred(error, context = {}) {
    this.updateProgress({
      type: ProgressEventType.ERROR_OCCURRED,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      context
    });
  }

  /**
   * Warning notification
   * @param {string} warning - Warning message
   * @param {Object} context - Warning context
   */
  warningOccurred(warning, context = {}) {
    this.updateProgress({
      type: ProgressEventType.WARNING_OCCURRED,
      warning,
      context
    });
  }

  /**
   * Milestone notification
   * @param {string} milestone - Milestone name
   * @param {Object} data - Milestone data
   */
  milestoneReached(milestone, data = {}) {
    this.updateProgress({
      type: ProgressEventType.MILESTONE_REACHED,
      milestone,
      data
    });
  }

  /**
   * Session completion notification
   * @param {boolean} success - Whether session completed successfully
   * @param {Object} summary - Session summary
   */
  sessionComplete(success, summary = {}) {
    this.state.status = success ? 'completed' : 'failed';
    this.state.endTime = new Date();
    
    this.updateProgress({
      type: ProgressEventType.SESSION_COMPLETE,
      success,
      summary
    });

    // Stop periodic updates
    this.stopPeriodicUpdates();
  }

  /**
   * Pause progress tracking
   */
  pause() {
    this.state.status = 'paused';
    this.stopPeriodicUpdates();
  }

  /**
   * Resume progress tracking
   */
  resume() {
    this.state.status = 'active';
    this.startPeriodicUpdates();
  }

  /**
   * Get current progress state
   * @returns {Object} Current state summary
   */
  getProgress() {
    return this.state.getStatusSummary();
  }

  /**
   * Get detailed progress state
   * @returns {ProgressState} Full progress state
   */
  getDetailedProgress() {
    return this.state;
  }

  /**
   * Notify all observers of progress update
   * @param {Object} event - Progress event
   * @private
   */
  notifyObservers(event) {
    const progressData = {
      event,
      state: this.state.getStatusSummary(),
      timestamp: event.timestamp
    };

    for (const observer of this.observers) {
      try {
        if (typeof observer.onProgressUpdate === 'function') {
          observer.onProgressUpdate(progressData);
        }
        
        // Call specific event handlers if they exist
        const handlerName = `on${event.type.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join('')}`;
        
        if (typeof observer[handlerName] === 'function') {
          observer[handlerName](progressData);
        }
      } catch (error) {
        console.error('Error notifying observer:', error);
      }
    }
  }

  /**
   * Start periodic progress updates
   * @private
   */
  startPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      if (this.state.status === 'active') {
        this.updateProgress({
          type: ProgressEventType.STATISTICS_UPDATE,
          statistics: this.state.statistics
        });
      }
    }, 1000); // Update every second
  }

  /**
   * Stop periodic progress updates
   * @private
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Cleanup and shutdown progress tracker
   */
  shutdown() {
    this.stopPeriodicUpdates();
    this.clearObservers();
    this.state.status = 'shutdown';
  }
}

module.exports = {
  ProgressTracker,
  ProgressState,
  ProgressEventType
}; 