/**
 * Command Pattern Implementation for API Operations
 * Following Architecture Design Pattern 2: Command Pattern
 */

/**
 * Command result wrapper
 */
class CommandResult {
  constructor(success, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = {
      executedAt: new Date().toISOString(),
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
 * Base Command interface
 */
class Command {
  constructor() {
    this.attempts = 0;
    this.maxRetries = 3;
    this.lastError = null;
  }

  /**
   * Execute the command
   * @returns {Promise<CommandResult>} Command result
   */
  async execute() {
    throw new Error('Command.execute must be implemented');
  }

  /**
   * Check if command can be retried
   * @returns {boolean} True if retryable
   */
  canRetry() {
    return this.attempts < this.maxRetries && this.isRetryable();
  }

  /**
   * Check if the last error is retryable
   * @returns {boolean} True if retryable
   */
  isRetryable() {
    if (!this.lastError) return false;
    
    // Use error's own retry logic if available
    if (this.lastError.isRetryable && typeof this.lastError.isRetryable === 'function') {
      return this.lastError.isRetryable();
    }
    
    return false;
  }

  /**
   * Get retry delay in milliseconds
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    if (!this.lastError) return 1000;
    
    // Use error's own delay if available
    if (this.lastError.getRetryDelay && typeof this.lastError.getRetryDelay === 'function') {
      return this.lastError.getRetryDelay();
    }
    
    // Exponential backoff
    return Math.min(1000 * Math.pow(2, this.attempts), 10000);
  }

  /**
   * Reset command state for retry
   */
  reset() {
    this.attempts = 0;
    this.lastError = null;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>} Promise that resolves after sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Subscribe User Command
 */
class SubscribeUserCommand extends Command {
  constructor(apiClient, subscriberData, logger = null) {
    super();
    this.apiClient = apiClient;
    this.subscriberData = subscriberData;
    this.logger = logger;
    this.commandId = this.generateCommandId();
  }

  /**
   * Generate unique command ID
   * @returns {string} Command ID
   */
  generateCommandId() {
    return `subscribe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Execute subscription command
   * @returns {Promise<CommandResult>} Command result
   */
  async execute() {
    const startTime = Date.now();
    
    if (this.logger) {
      this.logger.debug('Executing SubscribeUserCommand', {
        commandId: this.commandId,
        email: this.maskEmail(this.subscriberData.email),
        attempt: this.attempts + 1
      });
    }

    try {
      this.attempts++;
      
      const result = await this.apiClient.subscribeUser(this.subscriberData);
      const duration = Date.now() - startTime;

      if (this.logger) {
        this.logger.info('SubscribeUserCommand completed successfully', {
          commandId: this.commandId,
          email: this.maskEmail(this.subscriberData.email),
          attempts: this.attempts,
          duration
        });
      }

      return new CommandResult(true, result.data, null, {
        commandId: this.commandId,
        attempts: this.attempts,
        duration,
        operation: 'subscribeUser'
      });

    } catch (error) {
      this.lastError = error;
      const duration = Date.now() - startTime;

      if (this.logger) {
        this.logger.warn('SubscribeUserCommand failed', {
          commandId: this.commandId,
          email: this.maskEmail(this.subscriberData.email),
          attempt: this.attempts,
          error: error.message,
          canRetry: this.canRetry(),
          duration
        });
      }

      return new CommandResult(false, null, error, {
        commandId: this.commandId,
        attempts: this.attempts,
        duration,
        operation: 'subscribeUser',
        canRetry: this.canRetry()
      });
    }
  }

  /**
   * Mask email for logging
   * @param {string} email - Email to mask
   * @returns {string} Masked email
   */
  maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  toString() {
    return `SubscribeUserCommand{id: ${this.commandId}, email: ${this.maskEmail(this.subscriberData.email)}}`;
  }
}

/**
 * Batch Process Command
 */
class BatchProcessCommand extends Command {
  constructor(commands, options = {}) {
    super();
    this.commands = commands;
    this.options = {
      concurrency: options.concurrency || 1,
      failFast: options.failFast || false,
      retryFailedCommands: options.retryFailedCommands !== false,
      ...options
    };
    this.logger = options.logger || null;
    this.batchId = this.generateBatchId();
  }

  /**
   * Generate unique batch ID
   * @returns {string} Batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Execute batch of commands
   * @returns {Promise<CommandResult>} Batch result
   */
  async execute() {
    const startTime = Date.now();
    
    if (this.logger) {
      this.logger.info('Executing BatchProcessCommand', {
        batchId: this.batchId,
        commandCount: this.commands.length,
        concurrency: this.options.concurrency,
        attempt: this.attempts + 1
      });
    }

    try {
      this.attempts++;
      
      const results = await this.processBatch();
      const duration = Date.now() - startTime;

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      if (this.logger) {
        this.logger.info('BatchProcessCommand completed', {
          batchId: this.batchId,
          total: results.length,
          successful,
          failed,
          successRate: Math.round((successful / results.length) * 100),
          duration
        });
      }

      return new CommandResult(true, results, null, {
        batchId: this.batchId,
        attempts: this.attempts,
        duration,
        operation: 'batchProcess',
        statistics: {
          total: results.length,
          successful,
          failed,
          successRate: Math.round((successful / results.length) * 100)
        }
      });

    } catch (error) {
      this.lastError = error;
      const duration = Date.now() - startTime;

      if (this.logger) {
        this.logger.error('BatchProcessCommand failed', {
          batchId: this.batchId,
          attempt: this.attempts,
          error: error.message,
          duration
        });
      }

      return new CommandResult(false, null, error, {
        batchId: this.batchId,
        attempts: this.attempts,
        duration,
        operation: 'batchProcess'
      });
    }
  }

  /**
   * Process batch of commands with concurrency control
   * @returns {Promise<Array<CommandResult>>} Array of results
   */
  async processBatch() {
    if (this.options.concurrency === 1) {
      return this.processSequentially();
    } else {
      return this.processConcurrently();
    }
  }

  /**
   * Process commands sequentially
   * @returns {Promise<Array<CommandResult>>} Array of results
   */
  async processSequentially() {
    const results = [];
    
    for (let i = 0; i < this.commands.length; i++) {
      const command = this.commands[i];
      
      const result = await this.executeCommandWithRetry(command);
      results.push(result);

      // Fail fast if enabled and command failed
      if (this.options.failFast && !result.success) {
        if (this.logger) {
          this.logger.warn('Batch processing stopped due to failure (fail-fast enabled)', {
            batchId: this.batchId,
            commandIndex: i,
            processedCommands: i + 1,
            totalCommands: this.commands.length
          });
        }
        break;
      }
    }

    return results;
  }

  /**
   * Process commands concurrently
   * @returns {Promise<Array<CommandResult>>} Array of results
   */
  async processConcurrently() {
    const semaphore = new Semaphore(this.options.concurrency);
    
    const promises = this.commands.map(async (command, index) => {
      await semaphore.acquire();
      
      try {
        return await this.executeCommandWithRetry(command);
      } finally {
        semaphore.release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Execute command with retry logic
   * @param {Command} command - Command to execute
   * @returns {Promise<CommandResult>} Command result
   */
  async executeCommandWithRetry(command) {
    let result;
    
    do {
      result = await command.execute();
      
      if (!result.success && command.canRetry() && this.options.retryFailedCommands) {
        const retryDelay = command.getRetryDelay();
        
        if (this.logger) {
          this.logger.debug('Retrying failed command', {
            batchId: this.batchId,
            commandId: command.commandId || 'unknown',
            attempt: command.attempts + 1,
            retryDelay
          });
        }
        
        await command.sleep(retryDelay);
      }
    } while (!result.success && command.canRetry() && this.options.retryFailedCommands);

    return result;
  }

  /**
   * Get batch description
   * @returns {string} Batch description
   */
  toString() {
    return `BatchProcessCommand{id: ${this.batchId}, commands: ${this.commands.length}}`;
  }
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  constructor(count) {
    this.count = count;
    this.waiting = [];
  }

  /**
   * Acquire semaphore
   * @returns {Promise<void>} Promise that resolves when acquired
   */
  async acquire() {
    return new Promise((resolve) => {
      if (this.count > 0) {
        this.count--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  /**
   * Release semaphore
   */
  release() {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve();
    } else {
      this.count++;
    }
  }
}

/**
 * Command Factory for creating different types of commands
 */
class CommandFactory {
  /**
   * Create subscribe user command
   * @param {Object} apiClient - API client
   * @param {Object} subscriberData - Subscriber data
   * @param {Object} logger - Logger instance
   * @returns {SubscribeUserCommand} Subscribe command
   */
  static createSubscribeUserCommand(apiClient, subscriberData, logger = null) {
    return new SubscribeUserCommand(apiClient, subscriberData, logger);
  }

  /**
   * Create batch process command
   * @param {Array<Command>} commands - Array of commands
   * @param {Object} options - Batch options
   * @returns {BatchProcessCommand} Batch command
   */
  static createBatchProcessCommand(commands, options = {}) {
    return new BatchProcessCommand(commands, options);
  }

  /**
   * Create batch of subscribe user commands
   * @param {Object} apiClient - API client
   * @param {Array<Object>} subscribersData - Array of subscriber data
   * @param {Object} logger - Logger instance
   * @returns {Array<SubscribeUserCommand>} Array of subscribe commands
   */
  static createSubscribeUserCommands(apiClient, subscribersData, logger = null) {
    return subscribersData.map(subscriberData => 
      new SubscribeUserCommand(apiClient, subscriberData, logger)
    );
  }
}

/**
 * Command Executor for running commands with sophisticated retry logic
 */
class CommandExecutor {
  constructor(options = {}) {
    this.options = {
      defaultMaxRetries: options.defaultMaxRetries || 3,
      defaultRetryDelay: options.defaultRetryDelay || 1000,
      ...options
    };
    this.logger = options.logger || null;
  }

  /**
   * Execute a single command
   * @param {Command} command - Command to execute
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(command) {
    let result;
    
    do {
      result = await command.execute();
      
      if (!result.success && command.canRetry()) {
        const retryDelay = command.getRetryDelay();
        
        if (this.logger) {
          this.logger.info('Retrying command execution', {
            commandType: command.constructor.name,
            attempt: command.attempts + 1,
            maxRetries: command.maxRetries,
            retryDelay
          });
        }
        
        await command.sleep(retryDelay);
      }
    } while (!result.success && command.canRetry());

    return result;
  }

  /**
   * Execute multiple commands
   * @param {Array<Command>} commands - Commands to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Array<CommandResult>>} Array of results
   */
  async executeMany(commands, options = {}) {
    const batchCommand = new BatchProcessCommand(commands, {
      ...this.options,
      ...options,
      logger: this.logger
    });

    const batchResult = await this.execute(batchCommand);
    return batchResult.success ? batchResult.data : [];
  }
}

module.exports = {
  Command,
  CommandResult,
  SubscribeUserCommand,
  BatchProcessCommand,
  CommandFactory,
  CommandExecutor,
  Semaphore
}; 