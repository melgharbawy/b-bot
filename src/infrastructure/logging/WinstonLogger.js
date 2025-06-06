/**
 * Winston Logger Implementation
 * Winston-based logger with file rotation and structured formatting
 * Following Phase 4 Architecture Guidelines - Strategy Pattern for Logging
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

/**
 * Performance timer for measuring operation duration
 */
class PerformanceTimer {
  constructor(operation, logger) {
    this.operation = operation;
    this.logger = logger;
    this.startTime = process.hrtime.bigint();
    this.startMemory = process.memoryUsage();
  }

  /**
   * Complete the timer and log results
   * @param {Object} metadata - Additional metadata
   */
  done(metadata = {}) {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - this.startTime) / 1000000; // Convert to milliseconds
    const memoryDelta = endMemory.heapUsed - this.startMemory.heapUsed;

    this.logger.debug(`Performance: ${this.operation}`, {
      operation: this.operation,
      duration: `${duration.toFixed(2)}ms`,
      memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
      memoryUsage: {
        heapUsed: `${(endMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(endMemory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(endMemory.external / 1024 / 1024).toFixed(2)}MB`
      },
      ...metadata
    });

    return {
      duration,
      memoryDelta,
      memoryUsage: endMemory
    };
  }
}

/**
 * Winston Logger implementation
 */
class WinstonLogger {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.winston = this.createWinstonInstance();
    this.timers = new Map();
  }

  /**
   * Create Winston logger instance
   * @returns {winston.Logger} Winston logger
   * @private
   */
  createWinstonInstance() {
    // Ensure log directory exists
    if (this.config.enableFile) {
      this.ensureLogDirectory();
    }

    const transports = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(new winston.transports.Console({
        level: this.config.level,
        format: this.getConsoleFormat()
      }));
    }

    // File transports
    if (this.config.enableFile) {
      // Combined log file
      transports.push(new DailyRotateFile({
        filename: this.config.files.combined,
        level: this.config.level,
        format: this.getFileFormat(),
        maxSize: this.config.rotation.maxSize,
        maxFiles: this.config.rotation.maxFiles,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true
      }));

      // Error log file
      transports.push(new DailyRotateFile({
        filename: this.config.files.error,
        level: 'error',
        format: this.getFileFormat(),
        maxSize: this.config.rotation.maxSize,
        maxFiles: this.config.rotation.maxFiles,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true
      }));
    }

    return winston.createLogger({
      level: this.config.level,
      format: this.getBaseFormat(),
      transports,
      exitOnError: false
    });
  }

  /**
   * Ensure log directory exists
   * @private
   */
  ensureLogDirectory() {
    const logDir = path.dirname(this.config.files.combined);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Get base format for all logs
   * @returns {winston.Format} Winston format
   * @private
   */
  getBaseFormat() {
    return winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp', 'label']
      })
    );
  }

  /**
   * Get console format
   * @returns {winston.Format} Console format
   * @private
   */
  getConsoleFormat() {
    return winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, metadata = {} }) => {
        const metaStr = Object.keys(metadata).length > 0 ? 
          ` ${JSON.stringify(metadata)}` : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    );
  }

  /**
   * Get file format
   * @returns {winston.Format} File format
   * @private
   */
  getFileFormat() {
    return winston.format.combine(
      winston.format.json()
    );
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    this.winston.info(message, this.enrichMetadata(metadata));
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    this.winston.warn(message, this.enrichMetadata(metadata));
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    this.winston.error(message, this.enrichMetadata(metadata));
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    this.winston.debug(message, this.enrichMetadata(metadata));
  }

  /**
   * Log verbose message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  verbose(message, metadata = {}) {
    this.winston.verbose(message, this.enrichMetadata(metadata));
  }

  /**
   * Log silly message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  silly(message, metadata = {}) {
    this.winston.silly(message, this.enrichMetadata(metadata));
  }

  /**
   * Start a performance timer
   * @param {string} operation - Operation name
   * @returns {PerformanceTimer} Timer instance
   */
  startTimer(operation) {
    const timer = new PerformanceTimer(operation, this);
    this.timers.set(operation, timer);
    return timer;
  }

  /**
   * Get and remove a performance timer
   * @param {string} operation - Operation name
   * @returns {PerformanceTimer|null} Timer instance or null
   */
  getTimer(operation) {
    const timer = this.timers.get(operation);
    if (timer) {
      this.timers.delete(operation);
    }
    return timer || null;
  }

  /**
   * Log operation with automatic timing
   * @param {string} operation - Operation name
   * @param {Function} fn - Function to execute
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<any>} Function result
   */
  async time(operation, fn, metadata = {}) {
    const timer = this.startTimer(operation);
    
    try {
      const result = await fn();
      timer.done({ ...metadata, success: true });
      return result;
    } catch (error) {
      timer.done({ ...metadata, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Enrich metadata with standard fields
   * @param {Object} metadata - Original metadata
   * @returns {Object} Enriched metadata
   * @private
   */
  enrichMetadata(metadata) {
    return {
      ...metadata,
      logger: this.name,
      component: this.config.component,
      sessionId: this.config.sessionId,
      pid: process.pid,
      hostname: require('os').hostname(),
      nodeVersion: process.version
    };
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      name: this.name,
      level: this.config.level,
      component: this.config.component,
      sessionId: this.config.sessionId,
      activeTimers: this.timers.size,
      transportCount: this.winston.transports.length,
      config: {
        enableConsole: this.config.enableConsole,
        enableFile: this.config.enableFile,
        enableRotation: this.config.enableRotation
      }
    };
  }

  /**
   * Update log level
   * @param {string} level - New log level
   */
  setLevel(level) {
    this.winston.level = level;
    this.winston.transports.forEach(transport => {
      if (transport.level !== 'error') { // Don't change error-only transports
        transport.level = level;
      }
    });
  }

  /**
   * Add metadata to all subsequent logs
   * @param {Object} metadata - Metadata to add
   */
  addDefaultMetadata(metadata) {
    this.config = { ...this.config, ...metadata };
  }

  /**
   * Flush all pending logs
   * @returns {Promise<void>}
   */
  async flush() {
    return new Promise((resolve) => {
      let pendingFlushes = 0;
      
      const transports = this.winston.transports;
      if (transports.length === 0) {
        resolve();
        return;
      }

      transports.forEach(transport => {
        if (transport.flush && typeof transport.flush === 'function') {
          pendingFlushes++;
          transport.flush(() => {
            pendingFlushes--;
            if (pendingFlushes === 0) {
              resolve();
            }
          });
        }
      });

      if (pendingFlushes === 0) {
        resolve();
      }
    });
  }

  /**
   * Shutdown the logger
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Complete any active timers
    for (const [operation, timer] of this.timers.entries()) {
      timer.done({ completed: false, reason: 'logger_shutdown' });
    }
    this.timers.clear();

    // Flush and close transports
    await this.flush();
    
    return new Promise((resolve) => {
      this.winston.close(() => {
        resolve();
      });
    });
  }

  /**
   * Create a child logger with additional metadata
   * @param {Object} metadata - Additional metadata
   * @returns {WinstonLogger} Child logger
   */
  child(metadata) {
    const childConfig = {
      ...this.config,
      ...metadata
    };
    
    return new WinstonLogger(`${this.name}_child`, childConfig);
  }
}

module.exports = WinstonLogger; 