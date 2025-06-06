/**
 * Logger Factory
 * Factory pattern implementation for creating different types of loggers
 * Following Phase 4 Architecture Guidelines - Strategy Pattern for Logging
 */

const WinstonLogger = require('./WinstonLogger');
const StructuredLogger = require('./StructuredLogger');
const SessionLogger = require('./SessionLogger');
const path = require('path');

/**
 * Logger configuration options
 */
class LoggerConfig {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.format = options.format || 'structured';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.logDirectory = options.logDirectory || 'logs';
    this.filePrefix = options.filePrefix || 'laylo-import';
    this.maxFileSize = options.maxFileSize || '20m';
    this.maxFiles = options.maxFiles || '14d';
    this.enableRotation = options.enableRotation !== false;
    this.enableMetrics = options.enableMetrics !== false;
    this.sessionId = options.sessionId || null;
    this.component = options.component || 'default';
  }

  /**
   * Get file path for specific log type
   * @param {string} type - Log type (error, combined, etc.)
   * @returns {string} File path
   */
  getFilePath(type = 'combined') {
    return path.join(this.logDirectory, `${this.filePrefix}-${type}-%DATE%.log`);
  }

  /**
   * Create configuration object for Winston
   * @returns {Object} Winston configuration
   */
  toWinstonConfig() {
    return {
      level: this.level,
      format: this.format,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      files: {
        combined: this.getFilePath('combined'),
        error: this.getFilePath('error'),
        audit: this.getFilePath('audit')
      },
      rotation: {
        maxSize: this.maxFileSize,
        maxFiles: this.maxFiles,
        enabled: this.enableRotation
      },
      component: this.component
    };
  }
}

/**
 * Logger Factory
 */
class LoggerFactory {
  constructor() {
    this.loggers = new Map();
    this.defaultConfig = new LoggerConfig();
  }

  /**
   * Create or get a logger instance
   * @param {string} name - Logger name
   * @param {Object} options - Logger options
   * @returns {Object} Logger instance
   */
  createLogger(name, options = {}) {
    const cacheKey = `${name}_${JSON.stringify(options)}`;
    
    if (this.loggers.has(cacheKey)) {
      return this.loggers.get(cacheKey);
    }

    const config = new LoggerConfig({ ...this.defaultConfig, ...options });
    const logger = this.instantiateLogger(name, config);
    
    this.loggers.set(cacheKey, logger);
    return logger;
  }

  /**
   * Create a structured logger
   * @param {string} component - Component name
   * @param {Object} options - Logger options
   * @returns {StructuredLogger} Structured logger instance
   */
  createStructuredLogger(component, options = {}) {
    const config = new LoggerConfig({ 
      ...options, 
      component,
      format: 'structured',
      enableMetrics: true
    });
    
    const winstonLogger = new WinstonLogger(`structured_${component}`, config.toWinstonConfig());
    return new StructuredLogger(winstonLogger, component);
  }

  /**
   * Create a session-specific logger
   * @param {string} sessionId - Session ID
   * @param {Object} options - Logger options
   * @returns {SessionLogger} Session logger instance
   */
  createSessionLogger(sessionId, options = {}) {
    const config = new LoggerConfig({ 
      ...options, 
      sessionId,
      component: 'session',
      filePrefix: `session-${sessionId}`,
      enableMetrics: true
    });
    
    const winstonLogger = new WinstonLogger(`session_${sessionId}`, config.toWinstonConfig());
    return new SessionLogger(winstonLogger, sessionId);
  }

  /**
   * Create a component-specific logger
   * @param {string} component - Component name
   * @param {Object} options - Logger options
   * @returns {Object} Logger instance
   */
  createComponentLogger(component, options = {}) {
    return this.createStructuredLogger(component, {
      ...options,
      component
    });
  }

  /**
   * Create a performance metrics logger
   * @param {string} component - Component name
   * @param {Object} options - Logger options
   * @returns {Object} Metrics logger instance
   */
  createMetricsLogger(component, options = {}) {
    return this.createStructuredLogger(`metrics_${component}`, {
      ...options,
      filePrefix: `metrics-${component}`,
      enableMetrics: true,
      level: 'debug'
    });
  }

  /**
   * Create an audit logger
   * @param {Object} options - Logger options
   * @returns {Object} Audit logger instance
   */
  createAuditLogger(options = {}) {
    return this.createStructuredLogger('audit', {
      ...options,
      filePrefix: 'audit',
      level: 'info',
      enableConsole: false // Audit logs go to file only
    });
  }

  /**
   * Instantiate the appropriate logger type
   * @param {string} name - Logger name
   * @param {LoggerConfig} config - Logger configuration
   * @returns {Object} Logger instance
   * @private
   */
  instantiateLogger(name, config) {
    // For now, we'll use WinstonLogger as the base
    // This can be extended to support different logger types
    return new WinstonLogger(name, config.toWinstonConfig());
  }

  /**
   * Get default logger configuration
   * @returns {LoggerConfig} Default configuration
   */
  getDefaultConfig() {
    return this.defaultConfig;
  }

  /**
   * Update default configuration
   * @param {Object} options - Configuration options
   */
  updateDefaultConfig(options) {
    this.defaultConfig = new LoggerConfig({ ...this.defaultConfig, ...options });
  }

  /**
   * Clear logger cache
   */
  clearCache() {
    this.loggers.clear();
  }

  /**
   * Get logger cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cachedLoggers: this.loggers.size,
      loggerNames: Array.from(this.loggers.keys())
    };
  }

  /**
   * Shutdown all loggers
   * @returns {Promise<void>}
   */
  async shutdown() {
    const shutdownPromises = [];
    
    for (const logger of this.loggers.values()) {
      if (logger.shutdown && typeof logger.shutdown === 'function') {
        shutdownPromises.push(logger.shutdown());
      }
    }

    await Promise.all(shutdownPromises);
    this.clearCache();
  }
}

/**
 * Singleton factory instance
 */
let factoryInstance = null;

/**
 * Get the singleton logger factory instance
 * @returns {LoggerFactory} Factory instance
 */
function getLoggerFactory() {
  if (!factoryInstance) {
    factoryInstance = new LoggerFactory();
  }
  return factoryInstance;
}

/**
 * Create a quick logger instance
 * @param {string} component - Component name
 * @param {Object} options - Logger options
 * @returns {Object} Logger instance
 */
function createLogger(component, options = {}) {
  return getLoggerFactory().createStructuredLogger(component, options);
}

/**
 * Create a session logger instance
 * @param {string} sessionId - Session ID
 * @param {Object} options - Logger options
 * @returns {SessionLogger} Session logger instance
 */
function createSessionLogger(sessionId, options = {}) {
  return getLoggerFactory().createSessionLogger(sessionId, options);
}

module.exports = {
  LoggerFactory,
  LoggerConfig,
  getLoggerFactory,
  createLogger,
  createSessionLogger
}; 