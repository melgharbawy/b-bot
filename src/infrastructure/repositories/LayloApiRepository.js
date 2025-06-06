/**
 * Laylo API Repository
 * Implements Repository pattern for Laylo API operations
 * Following Architecture Design Pattern 5: Repository Pattern
 */

const { LayloGraphQLClientFactory } = require('../clients/LayloGraphQLClient');
const { CommandFactory, CommandExecutor } = require('../commands');
const Subscriber = require('../../domain/entities/Subscriber');

/**
 * API operation result
 */
class ApiOperationResult {
  constructor(success, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata
    };
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
      metadata: this.metadata
    };
  }
}

/**
 * Batch operation result
 */
class BatchOperationResult {
  constructor(results, statistics) {
    this.results = results;
    this.statistics = statistics;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get successful operations
   * @returns {Array} Successful operations
   */
  getSuccessful() {
    return this.results.filter(r => r.success);
  }

  /**
   * Get failed operations
   * @returns {Array} Failed operations
   */
  getFailed() {
    return this.results.filter(r => !r.success);
  }

  /**
   * Check if all operations succeeded
   * @returns {boolean} True if all succeeded
   */
  allSucceeded() {
    return this.statistics.failed === 0;
  }

  /**
   * Get success rate
   * @returns {number} Success rate percentage
   */
  getSuccessRate() {
    return this.statistics.successRate;
  }

  /**
   * Convert to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      results: this.results.map(r => r.toJSON()),
      statistics: this.statistics,
      timestamp: this.timestamp
    };
  }
}

/**
 * Laylo API Repository
 */
class LayloApiRepository {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger;
    
    // Initialize API client
    this.apiClient = LayloGraphQLClientFactory.fromAppConfig(config);
    if (this.logger) {
      this.apiClient.setLogger(this.logger);
    }

    // Initialize command executor
    this.commandExecutor = new CommandExecutor({
      defaultMaxRetries: config.RETRY_ATTEMPTS || 3,
      defaultRetryDelay: config.RETRY_BASE_DELAY || 1000,
      logger: this.logger
    });

    // Track repository statistics
    this.statistics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastOperationAt: null,
      connectionTested: false,
      lastConnectionTest: null
    };
  }

  /**
   * Test API connection
   * @returns {Promise<ApiOperationResult>} Connection test result
   */
  async testConnection() {
    if (this.logger) {
      this.logger.info('Testing Laylo API connection');
    }

    try {
      const result = await this.apiClient.testConnection();
      
      this.statistics.connectionTested = true;
      this.statistics.lastConnectionTest = new Date().toISOString();

      if (this.logger) {
        this.logger.info('Laylo API connection test successful');
      }

      return new ApiOperationResult(true, result.data, null, {
        operation: 'testConnection',
        apiUrl: this.config.LAYLO_API_URL
      });

    } catch (error) {
      this.statistics.lastConnectionTest = new Date().toISOString();

      if (this.logger) {
        this.logger.error('Laylo API connection test failed', {
          error: error.message,
          type: error.constructor.name
        });
      }

      return new ApiOperationResult(false, null, error, {
        operation: 'testConnection',
        apiUrl: this.config.LAYLO_API_URL
      });
    }
  }

  /**
   * Subscribe a single user to Laylo
   * @param {Subscriber} subscriber - Subscriber entity
   * @returns {Promise<ApiOperationResult>} Subscription result
   */
  async subscribeUser(subscriber) {
    if (!(subscriber instanceof Subscriber)) {
      throw new Error('Expected Subscriber instance');
    }

    if (!subscriber.isValid()) {
      const error = new Error(`Subscriber validation failed: ${subscriber.getValidationErrors().map(e => e.message).join(', ')}`);
      return new ApiOperationResult(false, null, error, {
        operation: 'subscribeUser',
        subscriberId: subscriber.getUniqueId()
      });
    }

    const subscriberData = subscriber.getApiData();
    
    if (this.logger) {
      this.logger.info('Subscribing user to Laylo', {
        email: subscriber.maskEmail(subscriber.email),
        hasPhoneNumber: subscriber.hasPhoneNumber(),
        operation: 'subscribeUser'
      });
    }

    try {
      // Create and execute command
      const command = CommandFactory.createSubscribeUserCommand(
        this.apiClient,
        subscriberData,
        this.logger
      );

      const commandResult = await this.commandExecutor.execute(command);
      
      // Update statistics
      this.updateStatistics(commandResult.success);

      // Mark subscriber as processed
      if (commandResult.success) {
        subscriber.markProcessed(true, 'Successfully subscribed to Laylo');
      } else {
        subscriber.markProcessed(false, commandResult.error?.message || 'Subscription failed');
      }

      return new ApiOperationResult(
        commandResult.success,
        commandResult.data,
        commandResult.error,
        {
          operation: 'subscribeUser',
          subscriberId: subscriber.getUniqueId(),
          attempts: commandResult.metadata.attempts,
          duration: commandResult.metadata.duration,
          commandId: commandResult.metadata.commandId
        }
      );

    } catch (error) {
      this.updateStatistics(false);
      subscriber.markProcessed(false, error.message);

      if (this.logger) {
        this.logger.error('User subscription failed', {
          email: subscriber.maskEmail(subscriber.email),
          error: error.message
        });
      }

      return new ApiOperationResult(false, null, error, {
        operation: 'subscribeUser',
        subscriberId: subscriber.getUniqueId()
      });
    }
  }

  /**
   * Subscribe multiple users in batch
   * @param {Array<Subscriber>} subscribers - Array of subscriber entities
   * @param {Object} options - Batch options
   * @returns {Promise<BatchOperationResult>} Batch result
   */
  async subscribeUsersBatch(subscribers, options = {}) {
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      throw new Error('Expected non-empty array of Subscriber instances');
    }

    const batchOptions = {
      concurrency: options.concurrency || 1,
      failFast: options.failFast || false,
      retryFailedCommands: options.retryFailedCommands !== false,
      logger: this.logger,
      ...options
    };

    if (this.logger) {
      this.logger.info('Starting batch user subscription', {
        batchSize: subscribers.length,
        concurrency: batchOptions.concurrency,
        operation: 'subscribeUsersBatch'
      });
    }

    // Validate all subscribers first
    const validSubscribers = [];
    const invalidResults = [];

    for (const subscriber of subscribers) {
      if (!(subscriber instanceof Subscriber)) {
        const error = new Error('Expected Subscriber instance');
        invalidResults.push(new ApiOperationResult(false, null, error, {
          operation: 'subscribeUser',
          subscriberId: 'unknown',
          reason: 'invalid_type'
        }));
        continue;
      }

      if (!subscriber.isValid()) {
        const error = new Error(`Subscriber validation failed: ${subscriber.getValidationErrors().map(e => e.message).join(', ')}`);
        invalidResults.push(new ApiOperationResult(false, null, error, {
          operation: 'subscribeUser',
          subscriberId: subscriber.getUniqueId(),
          reason: 'validation_failed'
        }));
        subscriber.markProcessed(false, error.message);
        continue;
      }

      validSubscribers.push(subscriber);
    }

    // Create commands for valid subscribers
    const commands = validSubscribers.map(subscriber => 
      CommandFactory.createSubscribeUserCommand(
        this.apiClient,
        subscriber.getApiData(),
        this.logger
      )
    );

    // Execute batch command
    let commandResults = [];
    if (commands.length > 0) {
      try {
        commandResults = await this.commandExecutor.executeMany(commands, batchOptions);
      } catch (error) {
        if (this.logger) {
          this.logger.error('Batch command execution failed', {
            error: error.message,
            commandCount: commands.length
          });
        }
        throw error;
      }
    }

    // Convert command results to API operation results
    const apiResults = [];
    
    for (let i = 0; i < commandResults.length; i++) {
      const commandResult = commandResults[i];
      const subscriber = validSubscribers[i];
      
      // Mark subscriber as processed
      if (commandResult.success) {
        subscriber.markProcessed(true, 'Successfully subscribed to Laylo');
      } else {
        subscriber.markProcessed(false, commandResult.error?.message || 'Subscription failed');
      }

      // Update statistics
      this.updateStatistics(commandResult.success);

      apiResults.push(new ApiOperationResult(
        commandResult.success,
        commandResult.data,
        commandResult.error,
        {
          operation: 'subscribeUser',
          subscriberId: subscriber.getUniqueId(),
          attempts: commandResult.metadata?.attempts || 1,
          duration: commandResult.metadata?.duration || 0,
          commandId: commandResult.metadata?.commandId
        }
      ));
    }

    // Combine all results
    const allResults = [...invalidResults, ...apiResults];
    
    // Calculate statistics
    const statistics = {
      total: allResults.length,
      successful: allResults.filter(r => r.success).length,
      failed: allResults.filter(r => !r.success).length,
      validationFailed: invalidResults.length,
      processed: apiResults.length,
      successRate: allResults.length > 0 ? 
        Math.round((allResults.filter(r => r.success).length / allResults.length) * 100) : 0
    };

    if (this.logger) {
      this.logger.info('Batch user subscription completed', {
        ...statistics,
        concurrency: batchOptions.concurrency
      });
    }

    return new BatchOperationResult(allResults, statistics);
  }

  /**
   * Update repository statistics
   * @param {boolean} success - Whether operation was successful
   */
  updateStatistics(success) {
    this.statistics.totalOperations++;
    this.statistics.lastOperationAt = new Date().toISOString();
    
    if (success) {
      this.statistics.successfulOperations++;
    } else {
      this.statistics.failedOperations++;
    }
  }

  /**
   * Get repository statistics
   * @returns {Object} Repository statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      successRate: this.statistics.totalOperations > 0 ? 
        Math.round((this.statistics.successfulOperations / this.statistics.totalOperations) * 100) : 0
    };
  }

  /**
   * Get API client health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      apiClient: this.apiClient.getHealthStatus(),
      repository: this.getStatistics(),
      rateLimiter: this.apiClient.getRateLimiterStatus()
    };
  }

  /**
   * Update API client configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.apiClient.updateConfig({
      retryAttempts: newConfig.RETRY_ATTEMPTS,
      retryBaseDelay: newConfig.RETRY_BASE_DELAY,
      rateLimitRequestsPerSecond: newConfig.rateLimitRequestsPerSecond || 1,
      rateLimitBurstSize: newConfig.rateLimitBurstSize || 2
    });

    if (this.logger) {
      this.logger.info('API repository configuration updated', {
        changes: Object.keys(newConfig)
      });
    }
  }

  /**
   * Reset repository statistics
   */
  resetStatistics() {
    this.statistics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastOperationAt: null,
      connectionTested: this.statistics.connectionTested,
      lastConnectionTest: this.statistics.lastConnectionTest
    };

    if (this.logger) {
      this.logger.info('Repository statistics reset');
    }
  }

  /**
   * Get repository configuration (sanitized)
   * @returns {Object} Sanitized configuration
   */
  getConfiguration() {
    return {
      apiUrl: this.config.LAYLO_API_URL,
      retryAttempts: this.config.RETRY_ATTEMPTS,
      retryBaseDelay: this.config.RETRY_BASE_DELAY,
      hasApiKey: !!this.config.LAYLO_API_KEY,
      rateLimiter: this.apiClient.getRateLimiterStatus()
    };
  }
}

/**
 * Factory for creating Laylo API repositories
 */
class LayloApiRepositoryFactory {
  /**
   * Create a Laylo API repository
   * @param {Object} config - Application configuration
   * @param {Object} logger - Logger instance
   * @returns {LayloApiRepository} Configured repository
   */
  static create(config, logger = null) {
    return new LayloApiRepository(config, logger);
  }
}

module.exports = {
  LayloApiRepository,
  LayloApiRepositoryFactory,
  ApiOperationResult,
  BatchOperationResult
}; 