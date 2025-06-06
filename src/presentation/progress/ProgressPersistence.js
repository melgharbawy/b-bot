/**
 * Progress Persistence
 * Save and restore progress state for session recovery
 * Following Phase 4 Architecture Guidelines - Progress Persistence
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Progress checkpoint data structure
 */
class ProgressCheckpoint {
  constructor(progressState, sessionData = {}) {
    this.id = `checkpoint_${Date.now()}`;
    this.timestamp = new Date().toISOString();
    this.sessionId = progressState.sessionId;
    this.version = '1.0.0';
    
    // Progress state snapshot
    this.state = {
      currentPhase: progressState.currentPhase,
      status: progressState.status,
      startTime: progressState.startTime,
      
      // Progress counters
      totalRecords: progressState.totalRecords,
      processedRecords: progressState.processedRecords,
      successfulRecords: progressState.successfulRecords,
      failedRecords: progressState.failedRecords,
      
      // Batch progress
      totalBatches: progressState.totalBatches,
      currentBatch: progressState.currentBatch,
      currentBatchSize: progressState.currentBatchSize,
      currentBatchProcessed: progressState.currentBatchProcessed,
      
      // Performance metrics
      recordsPerSecond: progressState.recordsPerSecond,
      averageBatchTime: progressState.averageBatchTime,
      
      // Statistics
      statistics: { ...progressState.statistics },
      
      // Error and warning counts
      errorCount: progressState.errors.length,
      warningCount: progressState.warnings.length,
      milestoneCount: progressState.milestones.length
    };
    
    // Session-specific data
    this.sessionData = {
      configurationFile: sessionData.configurationFile || null,
      csvFile: sessionData.csvFile || null,
      lastProcessedBatch: sessionData.lastProcessedBatch || 0,
      lastProcessedRecord: sessionData.lastProcessedRecord || 0,
      resumePoint: sessionData.resumePoint || null,
      ...sessionData
    };
    
    // Metadata
    this.metadata = {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Check if checkpoint is valid for resuming
   * @returns {boolean} True if valid for resume
   */
  isValid() {
    return (
      this.sessionId &&
      this.state &&
      this.state.status !== 'completed' &&
      this.state.status !== 'failed' &&
      this.state.processedRecords < this.state.totalRecords
    );
  }

  /**
   * Get resume progress percentage
   * @returns {number} Percentage (0-100)
   */
  getResumePercentage() {
    if (this.state.totalRecords === 0) return 0;
    return Math.min(100, (this.state.processedRecords / this.state.totalRecords) * 100);
  }

  /**
   * Get checkpoint summary
   * @returns {Object} Summary information
   */
  getSummary() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      timestamp: this.timestamp,
      phase: this.state.currentPhase,
      progress: this.getResumePercentage(),
      processed: this.state.processedRecords,
      total: this.state.totalRecords,
      isValid: this.isValid(),
      csvFile: this.sessionData.csvFile
    };
  }
}

/**
 * Progress persistence manager
 */
class ProgressPersistence {
  constructor(options = {}) {
    this.options = {
      storageDirectory: options.storageDirectory || 'data/checkpoints',
      maxCheckpoints: options.maxCheckpoints || 10,
      autoSaveInterval: options.autoSaveInterval || 30000, // 30 seconds
      enableAutoSave: options.enableAutoSave !== false,
      ...options
    };

    this.currentSessionId = null;
    this.autoSaveTimer = null;
    this.lastCheckpoint = null;
    this.progressTracker = null;
    
    // Ensure storage directory exists
    this.ensureStorageDirectory();
  }

  /**
   * Attach to a progress tracker for auto-save
   * @param {ProgressTracker} progressTracker - Progress tracker instance
   */
  attachToTracker(progressTracker) {
    this.progressTracker = progressTracker;
    this.currentSessionId = progressTracker.sessionId;
    
    if (this.options.enableAutoSave) {
      this.startAutoSave();
    }
  }

  /**
   * Detach from progress tracker
   */
  detachFromTracker() {
    this.stopAutoSave();
    this.progressTracker = null;
    this.currentSessionId = null;
  }

  /**
   * Save progress checkpoint
   * @param {ProgressState} progressState - Current progress state
   * @param {Object} sessionData - Additional session data
   * @returns {Promise<ProgressCheckpoint>} Saved checkpoint
   */
  async saveCheckpoint(progressState, sessionData = {}) {
    try {
      const checkpoint = new ProgressCheckpoint(progressState, sessionData);
      
      // Ensure session directory exists
      await this.ensureSessionDirectory(checkpoint.sessionId);
      
      const filePath = this.getCheckpointFilePath(checkpoint.sessionId, checkpoint.id);
      
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf8');
      
      this.lastCheckpoint = checkpoint;
      
      // Clean up old checkpoints
      await this.cleanupOldCheckpoints(checkpoint.sessionId);
      
      return checkpoint;
    } catch (error) {
      throw new Error(`Failed to save checkpoint: ${error.message}`);
    }
  }

  /**
   * Load the latest checkpoint for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<ProgressCheckpoint|null>} Latest checkpoint or null
   */
  async loadLatestCheckpoint(sessionId) {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);
      
      if (checkpoints.length === 0) {
        return null;
      }

      // Sort by timestamp (newest first)
      checkpoints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const latestCheckpoint = checkpoints[0];
      const filePath = this.getCheckpointFilePath(sessionId, latestCheckpoint.id);
      const data = await fs.readFile(filePath, 'utf8');
      
      return this.deserializeCheckpoint(JSON.parse(data));
    } catch (error) {
      throw new Error(`Failed to load checkpoint: ${error.message}`);
    }
  }

  /**
   * Load specific checkpoint by ID
   * @param {string} sessionId - Session ID
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<ProgressCheckpoint|null>} Checkpoint or null
   */
  async loadCheckpoint(sessionId, checkpointId) {
    try {
      const filePath = this.getCheckpointFilePath(sessionId, checkpointId);
      const data = await fs.readFile(filePath, 'utf8');
      
      return this.deserializeCheckpoint(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to load checkpoint: ${error.message}`);
    }
  }

  /**
   * List all checkpoints for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Array of checkpoint summaries
   */
  async listCheckpoints(sessionId) {
    try {
      const sessionDir = path.join(this.options.storageDirectory, sessionId);
      
      try {
        const files = await fs.readdir(sessionDir);
        const checkpoints = [];
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const filePath = path.join(sessionDir, file);
              const data = await fs.readFile(filePath, 'utf8');
              const checkpoint = JSON.parse(data);
              checkpoints.push(checkpoint);
            } catch (error) {
              console.warn(`Failed to read checkpoint file ${file}:`, error.message);
            }
          }
        }
        
        return checkpoints;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to list checkpoints: ${error.message}`);
    }
  }

  /**
   * Find resumable sessions
   * @returns {Promise<Array>} Array of resumable session summaries
   */
  async findResumableSessions() {
    try {
      const storageDir = this.options.storageDirectory;
      
      try {
        const sessionDirs = await fs.readdir(storageDir);
        const resumableSessions = [];
        
        for (const sessionDir of sessionDirs) {
          const sessionPath = path.join(storageDir, sessionDir);
          const stat = await fs.stat(sessionPath);
          
          if (stat.isDirectory()) {
            try {
              const latestCheckpoint = await this.loadLatestCheckpoint(sessionDir);
              
              if (latestCheckpoint && latestCheckpoint.isValid()) {
                resumableSessions.push({
                  sessionId: sessionDir,
                  ...latestCheckpoint.getSummary()
                });
              }
            } catch (error) {
              console.warn(`Failed to check session ${sessionDir}:`, error.message);
            }
          }
        }
        
        // Sort by timestamp (newest first)
        resumableSessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return resumableSessions;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to find resumable sessions: ${error.message}`);
    }
  }

  /**
   * Delete checkpoint
   * @param {string} sessionId - Session ID
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteCheckpoint(sessionId, checkpointId) {
    try {
      const filePath = this.getCheckpointFilePath(sessionId, checkpointId);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw new Error(`Failed to delete checkpoint: ${error.message}`);
    }
  }

  /**
   * Delete all checkpoints for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<number>} Number of deleted checkpoints
   */
  async deleteSessionCheckpoints(sessionId) {
    try {
      const sessionDir = path.join(this.options.storageDirectory, sessionId);
      
      try {
        const files = await fs.readdir(sessionDir);
        let deletedCount = 0;
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(sessionDir, file));
            deletedCount++;
          }
        }
        
        // Remove empty directory
        try {
          await fs.rmdir(sessionDir);
        } catch (error) {
          // Directory might not be empty, ignore
        }
        
        return deletedCount;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return 0;
        }
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to delete session checkpoints: ${error.message}`);
    }
  }

  /**
   * Start auto-save timer
   * @private
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(async () => {
      if (this.progressTracker && this.progressTracker.state.status === 'active') {
        try {
          await this.saveCheckpoint(this.progressTracker.state);
        } catch (error) {
          console.warn('Auto-save failed:', error.message);
        }
      }
    }, this.options.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   * @private
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Ensure storage directory exists
   * @private
   */
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.options.storageDirectory, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create storage directory: ${error.message}`);
    }
  }

  /**
   * Get checkpoint file path
   * @param {string} sessionId - Session ID
   * @param {string} checkpointId - Checkpoint ID
   * @returns {string} File path
   * @private
   */
  getCheckpointFilePath(sessionId, checkpointId) {
    const sessionDir = path.join(this.options.storageDirectory, sessionId);
    return path.join(sessionDir, `${checkpointId}.json`);
  }

  /**
   * Ensure session directory exists
   * @param {string} sessionId - Session ID
   * @private
   */
  async ensureSessionDirectory(sessionId) {
    const sessionDir = path.join(this.options.storageDirectory, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
  }

  /**
   * Clean up old checkpoints (keep only maxCheckpoints)
   * @param {string} sessionId - Session ID
   * @private
   */
  async cleanupOldCheckpoints(sessionId) {
    try {
      const checkpoints = await this.listCheckpoints(sessionId);
      
      if (checkpoints.length > this.options.maxCheckpoints) {
        // Sort by timestamp (oldest first)
        checkpoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const toDelete = checkpoints.slice(0, checkpoints.length - this.options.maxCheckpoints);
        
        for (const checkpoint of toDelete) {
          await this.deleteCheckpoint(sessionId, checkpoint.id);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old checkpoints:', error.message);
    }
  }

  /**
   * Deserialize checkpoint data
   * @param {Object} data - Raw checkpoint data
   * @returns {ProgressCheckpoint} Checkpoint instance
   * @private
   */
  deserializeCheckpoint(data) {
    const checkpoint = Object.create(ProgressCheckpoint.prototype);
    Object.assign(checkpoint, data);
    
    // Convert timestamp strings back to Date objects if needed
    if (typeof checkpoint.state.startTime === 'string') {
      checkpoint.state.startTime = new Date(checkpoint.state.startTime);
    }
    
    return checkpoint;
  }

  /**
   * Get persistence statistics
   * @returns {Object} Persistence statistics
   */
  getStats() {
    return {
      storageDirectory: this.options.storageDirectory,
      currentSessionId: this.currentSessionId,
      autoSaveEnabled: this.options.enableAutoSave,
      autoSaveInterval: this.options.autoSaveInterval,
      maxCheckpoints: this.options.maxCheckpoints,
      lastCheckpoint: this.lastCheckpoint ? this.lastCheckpoint.getSummary() : null,
      isAutoSaving: !!this.autoSaveTimer
    };
  }

  /**
   * Shutdown persistence manager
   */
  shutdown() {
    this.stopAutoSave();
    this.detachFromTracker();
  }
}

module.exports = {
  ProgressPersistence,
  ProgressCheckpoint
}; 