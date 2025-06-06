/**
 * Configuration Management System
 * Loads, validates, and manages environment configuration
 * Following Architecture Rule 1: Configuration Management
 */

const path = require('path');

// Load environment variables
require('dotenv').config();

/**
 * Custom error for configuration issues
 */
class ConfigurationError extends Error {
  constructor(setting, reason) {
    super(`Configuration Error - ${setting}: ${reason}`);
    this.name = 'ConfigurationError';
    this.setting = setting;
    this.reason = reason;
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // API Configuration
  LAYLO_API_URL: 'https://laylo.com/api/graphql',
  
  // Processing Configuration
  BATCH_SIZE: 5,
  RATE_LIMIT_DELAY: 1000,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000,
  
  // File Configuration
  CSV_FILE_PATH: 'data/LAYLO IMPORT - Sheet1.csv',
  LOG_DIRECTORY: 'logs',
  
  // Logging Configuration
  LOG_LEVEL: 'INFO',
  LOG_TO_FILE: true,
  LOG_TO_CONSOLE: true,
  
  // Processing Options
  SKIP_DUPLICATES: true,
  SKIP_INVALID_EMAILS: true,
  ALLOW_MISSING_PHONE: true,
  DRY_RUN: false
};

/**
 * Configuration validation rules
 */
const VALIDATION_RULES = {
  LAYLO_API_KEY: {
    required: true,
    type: 'string',
    minLength: 10,
    validator: (value) => value && value !== 'your_bearer_token_here'
  },
  LAYLO_API_URL: {
    required: true,
    type: 'string',
    validator: (value) => value && value.startsWith('http')
  },
  BATCH_SIZE: {
    type: 'number',
    min: 1,
    max: 50
  },
  RATE_LIMIT_DELAY: {
    type: 'number',
    min: 100,
    max: 10000
  },
  RETRY_ATTEMPTS: {
    type: 'number',
    min: 0,
    max: 10
  },
  LOG_LEVEL: {
    type: 'string',
    enum: ['ERROR', 'WARN', 'INFO', 'DEBUG']
  }
};

/**
 * Configuration Validator
 */
class ConfigValidator {
  /**
   * Validate configuration against rules
   * @param {Object} config - Configuration object to validate
   * @throws {ConfigurationError} If validation fails
   */
  static validate(config) {
    for (const [key, rules] of Object.entries(VALIDATION_RULES)) {
      const value = config[key];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null || value === '')) {
        throw new ConfigurationError(key, 'Required configuration is missing');
      }
      
      // Skip validation if value is undefined and not required
      if (value === undefined && !rules.required) {
        continue;
      }
      
      // Type validation
      if (rules.type && !this.validateType(value, rules.type)) {
        throw new ConfigurationError(key, `Expected type ${rules.type}, got ${typeof value}`);
      }
      
      // String validations
      if (rules.type === 'string' && typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          throw new ConfigurationError(key, `Minimum length is ${rules.minLength}`);
        }
        if (rules.enum && !rules.enum.includes(value)) {
          throw new ConfigurationError(key, `Must be one of: ${rules.enum.join(', ')}`);
        }
      }
      
      // Number validations
      if (rules.type === 'number' && typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          throw new ConfigurationError(key, `Minimum value is ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          throw new ConfigurationError(key, `Maximum value is ${rules.max}`);
        }
      }
      
      // Custom validator
      if (rules.validator && !rules.validator(value)) {
        throw new ConfigurationError(key, 'Custom validation failed');
      }
    }
  }
  
  /**
   * Validate value type
   * @param {*} value - Value to check
   * @param {string} expectedType - Expected type
   * @returns {boolean} True if type matches
   */
  static validateType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      default:
        return false;
    }
  }
}

/**
 * Configuration Loader
 */
class ConfigLoader {
  /**
   * Load configuration from environment and defaults
   * @returns {Object} Validated configuration object
   */
  static load() {
    const config = {};
    
    // Load from environment variables with type conversion
    for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
      const envValue = process.env[key];
      
      if (envValue !== undefined) {
        config[key] = this.convertType(envValue, typeof defaultValue);
      } else {
        config[key] = defaultValue;
      }
    }
    
    // Always load API key from environment (no default)
    config.LAYLO_API_KEY = process.env.LAYLO_API_KEY;
    
    // Resolve relative paths
    config.CSV_FILE_PATH = path.resolve(process.cwd(), config.CSV_FILE_PATH);
    config.LOG_DIRECTORY = path.resolve(process.cwd(), config.LOG_DIRECTORY);
    
    // Validate configuration
    ConfigValidator.validate(config);
    
    return config;
  }
  
  /**
   * Convert string environment variable to appropriate type
   * @param {string} value - Environment variable value
   * @param {string} type - Target type
   * @returns {*} Converted value
   */
  static convertType(value, type) {
    switch (type) {
      case 'number':
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new ConfigurationError('type_conversion', `Cannot convert "${value}" to number`);
        }
        return num;
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'string':
      default:
        return value;
    }
  }
}

/**
 * Load and export configuration
 */
let config;

try {
  config = ConfigLoader.load();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`❌ Configuration Error: ${error.message}`);
    console.error(`💡 Please check your .env file or copy from env.template`);
    process.exit(1);
  }
  throw error;
}

module.exports = {
  config,
  ConfigurationError,
  ConfigValidator,
  ConfigLoader
}; 