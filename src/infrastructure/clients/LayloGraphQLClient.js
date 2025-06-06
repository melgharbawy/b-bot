/**
 * Laylo GraphQL Client
 * Implements Laylo's GraphQL API for subscriber management
 * Following Architecture Guidelines - Factory Pattern, Repository Pattern
 */

const { HttpClient } = require('./HttpClient');
const { 
  GraphQLError, 
  AuthenticationError, 
  ErrorFactory 
} = require('../errors');

/**
 * GraphQL operation result
 */
class GraphQLResult {
  constructor(success, data = null, errors = null, extensions = null) {
    this.success = success;
    this.data = data;
    this.errors = errors;
    this.extensions = extensions;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Check if result has errors
   * @returns {boolean} True if errors exist
   */
  hasErrors() {
    return this.errors && this.errors.length > 0;
  }

  /**
   * Get error messages
   * @returns {Array<string>} Array of error messages
   */
  getErrorMessages() {
    if (!this.hasErrors()) return [];
    return this.errors.map(error => error.message);
  }

  /**
   * Convert to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      success: this.success,
      data: this.data,
      errors: this.errors,
      extensions: this.extensions,
      timestamp: this.timestamp
    };
  }
}

/**
 * Laylo GraphQL Client
 */
class LayloGraphQLClient {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || 'https://laylo.com/api/graphql',
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryBaseDelay: config.retryBaseDelay || 1000,
      rateLimitRequestsPerSecond: config.rateLimitRequestsPerSecond || 1,
      rateLimitBurstSize: config.rateLimitBurstSize || 2,
      ...config
    };

    // Validate required configuration
    this.validateConfig();

    // Initialize HTTP client
    this.httpClient = new HttpClient({
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryBaseDelay: this.config.retryBaseDelay,
      rateLimitRequestsPerSecond: this.config.rateLimitRequestsPerSecond,
      rateLimitBurstSize: this.config.rateLimitBurstSize
    });

    this.logger = null;
  }

  /**
   * Validate client configuration
   * @throws {AuthenticationError} If API key is missing
   */
  validateConfig() {
    if (!this.config.apiKey) {
      throw new AuthenticationError('Laylo API key is required');
    }

    if (!this.config.apiUrl) {
      throw new Error('Laylo API URL is required');
    }
  }

  /**
   * Set logger instance
   * @param {Object} logger - Logger instance
   */
  setLogger(logger) {
    this.logger = logger;
    this.httpClient.setLogger(logger);
  }

  /**
   * Get authentication headers
   * @returns {Object} Authentication headers
   */
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Execute GraphQL query/mutation
   * @param {string} query - GraphQL query string
   * @param {Object} variables - Query variables
   * @param {string} operationName - Operation name (optional)
   * @returns {Promise<GraphQLResult>} GraphQL result
   */
  async execute(query, variables = {}, operationName = null) {
    const payload = {
      query,
      variables,
      ...(operationName && { operationName })
    };

    if (this.logger) {
      this.logger.debug('Executing GraphQL operation', {
        operationName,
        variableKeys: Object.keys(variables),
        queryLength: query.length
      });
    }

    const requestConfig = {
      headers: this.getAuthHeaders()
    };

    const result = await this.httpClient.post(this.config.apiUrl, payload, requestConfig);

    if (!result.success) {
      if (this.logger) {
        this.logger.error('GraphQL request failed', {
          operationName,
          error: result.error.message,
          attempts: result.attempts
        });
      }
      
      throw result.error;
    }

    // Check for GraphQL errors
    if (result.data.errors && result.data.errors.length > 0) {
      const graphqlError = new GraphQLError(result.data.errors, result.data.data);
      
      if (this.logger) {
        this.logger.error('GraphQL operation returned errors', {
          operationName,
          errors: result.data.errors,
          data: result.data.data
        });
      }
      
      throw graphqlError;
    }

    if (this.logger) {
      this.logger.debug('GraphQL operation completed successfully', {
        operationName,
        hasData: !!result.data.data,
        duration: result.duration
      });
    }

    return new GraphQLResult(
      true,
      result.data.data,
      result.data.errors,
      result.data.extensions
    );
  }

  /**
   * Subscribe a user to Laylo
   * @param {Object} subscriberData - Subscriber data
   * @param {string} subscriberData.email - Email address
   * @param {string} [subscriberData.phoneNumber] - Phone number
   * @returns {Promise<GraphQLResult>} Subscription result
   */
  async subscribeUser(subscriberData) {
    const { email, phoneNumber } = subscriberData;

    // Validate input
    if (!email) {
      throw new Error('Email address is required for subscription');
    }

    const mutation = `
      mutation SubscribeToUser($email: String, $phoneNumber: String) {
        subscribeToUser(email: $email, phoneNumber: $phoneNumber)
      }
    `;

    const variables = {
      email: email.toLowerCase().trim(),
      ...(phoneNumber && { phoneNumber: phoneNumber.trim() })
    };

    if (this.logger) {
      this.logger.info('Subscribing user to Laylo', {
        email: this.maskEmail(email),
        hasPhoneNumber: !!phoneNumber,
        operation: 'subscribeToUser'
      });
    }

    const result = await this.execute(mutation, variables, 'SubscribeToUser');

    if (this.logger) {
      this.logger.info('User subscription completed', {
        email: this.maskEmail(email),
        success: result.success,
        subscriptionResult: result.data?.subscribeToUser
      });
    }

    return result;
  }

  /**
   * Test API connectivity and authentication
   * @returns {Promise<GraphQLResult>} Test result
   */
  async testConnection() {
    // Use a simple introspection query to test connectivity
    const query = `
      query TestConnection {
        __schema {
          queryType {
            name
          }
        }
      }
    `;

    if (this.logger) {
      this.logger.info('Testing Laylo API connection');
    }

    try {
      const result = await this.execute(query, {}, 'TestConnection');
      
      if (this.logger) {
        this.logger.info('Laylo API connection test successful');
      }
      
      return result;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Laylo API connection test failed', {
          error: error.message,
          type: error.constructor.name
        });
      }
      
      throw error;
    }
  }

  /**
   * Batch subscribe multiple users
   * @param {Array<Object>} subscribersData - Array of subscriber data
   * @returns {Promise<Array<GraphQLResult>>} Array of results
   */
  async batchSubscribeUsers(subscribersData) {
    if (!Array.isArray(subscribersData) || subscribersData.length === 0) {
      throw new Error('Subscribers data must be a non-empty array');
    }

    if (this.logger) {
      this.logger.info('Starting batch user subscription', {
        batchSize: subscribersData.length,
        operation: 'batchSubscribeUsers'
      });
    }

    const results = [];
    
    // Process each subscription individually for better error handling
    for (let i = 0; i < subscribersData.length; i++) {
      const subscriberData = subscribersData[i];
      
      try {
        const result = await this.subscribeUser(subscriberData);
        results.push(result);
      } catch (error) {
        // Create a failed result for this subscriber
        const failedResult = new GraphQLResult(false, null, [
          {
            message: error.message,
            path: [`subscriber_${i}`],
            extensions: {
              code: error.code || 'SUBSCRIPTION_FAILED',
              subscriberData: {
                email: this.maskEmail(subscriberData.email),
                hasPhoneNumber: !!subscriberData.phoneNumber
              }
            }
          }
        ]);
        
        results.push(failedResult);
        
        if (this.logger) {
          this.logger.warn('Individual subscription failed in batch', {
            subscriberIndex: i,
            email: this.maskEmail(subscriberData.email),
            error: error.message
          });
        }
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    if (this.logger) {
      this.logger.info('Batch user subscription completed', {
        total: results.length,
        successful,
        failed,
        successRate: Math.round((successful / results.length) * 100)
      });
    }

    return results;
  }

  /**
   * Get client configuration (sanitized)
   * @returns {Object} Client configuration
   */
  getConfig() {
    return {
      apiUrl: this.config.apiUrl,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryBaseDelay: this.config.retryBaseDelay,
      rateLimitRequestsPerSecond: this.config.rateLimitRequestsPerSecond,
      rateLimitBurstSize: this.config.rateLimitBurstSize,
      hasApiKey: !!this.config.apiKey
    };
  }

  /**
   * Update client configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update HTTP client configuration
    this.httpClient.updateRateLimit(
      this.config.rateLimitRequestsPerSecond,
      this.config.rateLimitBurstSize
    );
  }

  /**
   * Get rate limiter status
   * @returns {Object} Rate limiter status
   */
  getRateLimiterStatus() {
    return this.httpClient.getRateLimiterStatus();
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
   * Get client health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      configured: !!this.config.apiKey,
      apiUrl: this.config.apiUrl,
      rateLimiter: this.getRateLimiterStatus(),
      lastConnectionTest: null // Could be tracked if needed
    };
  }
}

/**
 * Factory for creating Laylo GraphQL clients
 */
class LayloGraphQLClientFactory {
  /**
   * Create a Laylo GraphQL client
   * @param {Object} config - Client configuration
   * @returns {LayloGraphQLClient} Configured client
   */
  static create(config) {
    return new LayloGraphQLClient(config);
  }

  /**
   * Create client from application config
   * @param {Object} appConfig - Application configuration
   * @returns {LayloGraphQLClient} Configured client
   */
  static fromAppConfig(appConfig) {
    return new LayloGraphQLClient({
      apiUrl: appConfig.LAYLO_API_URL,
      apiKey: appConfig.LAYLO_API_KEY,
      timeout: 30000,
      retryAttempts: appConfig.RETRY_ATTEMPTS || 3,
      retryBaseDelay: appConfig.RETRY_BASE_DELAY || 1000,
      rateLimitRequestsPerSecond: 1,
      rateLimitBurstSize: 2
    });
  }
}

module.exports = {
  LayloGraphQLClient,
  LayloGraphQLClientFactory,
  GraphQLResult
}; 