/**
 * Import CSV Use Case
 * Main orchestration for importing CSV data to Laylo
 * Following Clean Architecture - Application Layer
 */

const ImportSession = require('../../domain/entities/ImportSession');
const { ValidationService } = require('../../domain/services/ValidationService');
const { DeduplicationService } = require('../../domain/services/DeduplicationService');
const CsvRepository = require('../../infrastructure/repositories/CsvRepository');
const { LayloApiRepositoryFactory } = require('../../infrastructure/repositories/LayloApiRepository');

/**
 * Import CSV Use Case
 */
class ImportCsvUseCase {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger;
    
    // Initialize services
    this.csvRepository = new CsvRepository(logger);
    this.validationService = new ValidationService();
    this.deduplicationService = new DeduplicationService();
    this.apiRepository = LayloApiRepositoryFactory.create(config, logger);
    
    // Track use case statistics
    this.statistics = {
      sessionsExecuted: 0,
      totalRecordsProcessed: 0,
      totalRecordsSuccessful: 0,
      totalRecordsFailed: 0,
      lastExecutionAt: null
    };
  }

  /**
   * Execute the CSV import workflow
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import result
   */
  async execute(options = {}) {
    const importOptions = {
      dryRun: options.dryRun || this.config.DRY_RUN || false,
      batchSize: options.batchSize || this.config.BATCH_SIZE || 5,
      maxRecords: options.maxRecords || null,
      skipValidation: options.skipValidation || false,
      skipDeduplication: options.skipDeduplication || false,
      csvFilePath: options.csvFilePath || this.config.CSV_FILE_PATH,
      concurrency: options.concurrency || 1,
      failFast: options.failFast || false,
      progressCallback: options.progressCallback || null,
      ...options
    };

    if (this.logger) {
      this.logger.info('Starting CSV import workflow', {
        dryRun: importOptions.dryRun,
        batchSize: importOptions.batchSize,
        maxRecords: importOptions.maxRecords,
        csvFilePath: importOptions.csvFilePath
      });
    }

    // Create import session
    const sessionId = this.generateSessionId();
    const importSession = new ImportSession(sessionId, importOptions);

    try {
      // Phase 1: Test API connection (unless dry run)
      if (!importOptions.dryRun) {
        await this.testApiConnection(importSession);
      }

      // Phase 2: Load and validate CSV data
      const validatedData = await this.loadAndValidateData(importSession, importOptions);

      // Phase 3: Process duplicates
      const uniqueData = await this.processDeduplication(importSession, validatedData, importOptions);

      // Phase 4: Import to Laylo (unless dry run)
      let importResults = null;
      if (!importOptions.dryRun) {
        importResults = await this.importToLaylo(importSession, uniqueData, importOptions);
      }

      // Phase 5: Complete session and generate summary
      const summary = await this.completeImport(importSession, importResults, importOptions);

      // Update use case statistics
      this.updateStatistics(summary);

      if (this.logger) {
        this.logger.info('CSV import workflow completed successfully', {
          sessionId,
          dryRun: importOptions.dryRun,
          summary: summary.statistics
        });
      }

      return {
        success: true,
        sessionId,
        summary,
        importSession: importSession.getSummary()
      };

    } catch (error) {
      importSession.complete(false);
      importSession.addEvent('session_error', { error: error.message });

      if (this.logger) {
        this.logger.error('CSV import workflow failed', {
          sessionId,
          error: error.message,
          phase: importSession.getStatus().currentPhase
        });
      }

      return {
        success: false,
        sessionId,
        error: error.message,
        importSession: importSession.getSummary()
      };
    }
  }

  /**
   * Test API connection
   * @param {ImportSession} importSession - Import session
   * @returns {Promise<void>}
   */
  async testApiConnection(importSession) {
    importSession.setPhase('api_connection_test');
    
    if (this.logger) {
      this.logger.info('Testing Laylo API connection');
    }

    const connectionResult = await this.apiRepository.testConnection();
    
    if (!connectionResult.success) {
      throw new Error(`API connection failed: ${connectionResult.error.message}`);
    }

    if (this.logger) {
      this.logger.info('Laylo API connection test successful');
    }
  }

  /**
   * Load and validate CSV data
   * @param {ImportSession} importSession - Import session
   * @param {Object} options - Import options
   * @returns {Promise<Array>} Validated subscribers
   */
  async loadAndValidateData(importSession, options) {
    importSession.setPhase('data_loading_validation');
    
    if (this.logger) {
      this.logger.info('Loading and validating CSV data', {
        filePath: options.csvFilePath,
        maxRecords: options.maxRecords
      });
    }

    // Read CSV data
    const readOptions = {
      maxRows: options.maxRecords,
      requiredHeaders: ['email']
    };

    const { records, result } = await this.csvRepository.readAll(options.csvFilePath, readOptions);
    
    if (records.length === 0) {
      throw new Error('No valid records found in CSV file');
    }

    // Start import session with record count
    importSession.start(records.length);

    // Validate each record and create subscribers
    const validatedSubscribers = [];
    const validationResults = [];

    for (const record of records) {
      const { subscriber, validationResult, isValid } = this.validationService.validateAndCreateSubscriber(record);
      
      validationResults.push({
        record,
        subscriber,
        validationResult,
        isValid
      });

      if (isValid || !options.skipValidation) {
        validatedSubscribers.push(subscriber);
      }

      // Call progress callback if provided
      if (options.progressCallback) {
        options.progressCallback({
          phase: 'validation',
          processed: validationResults.length,
          total: records.length,
          valid: validatedSubscribers.length,
          invalid: validationResults.length - validatedSubscribers.length
        });
      }
    }

    const validCount = validatedSubscribers.filter(s => s.isValid()).length;
    const invalidCount = validatedSubscribers.length - validCount;

    if (this.logger) {
      this.logger.info('CSV data validation completed', {
        totalRecords: records.length,
        validRecords: validCount,
        invalidRecords: invalidCount,
        validationRate: Math.round((validCount / records.length) * 100)
      });
    }

    return validatedSubscribers;
  }

  /**
   * Process deduplication
   * @param {ImportSession} importSession - Import session
   * @param {Array} subscribers - Validated subscribers
   * @param {Object} options - Import options
   * @returns {Promise<Array>} Unique subscribers
   */
  async processDeduplication(importSession, subscribers, options) {
    importSession.setPhase('deduplication');

    if (options.skipDeduplication) {
      if (this.logger) {
        this.logger.info('Skipping deduplication as requested');
      }
      return subscribers;
    }

    if (this.logger) {
      this.logger.info('Processing deduplication', {
        totalSubscribers: subscribers.length
      });
    }

    const deduplicationResult = this.deduplicationService.processBatch(subscribers);
    const duplicateStats = this.deduplicationService.getStatistics();

    if (this.logger) {
      this.logger.info('Deduplication completed', {
        originalCount: subscribers.length,
        uniqueCount: deduplicationResult.unique.length,
        duplicatesCount: deduplicationResult.duplicates.length,
        deduplicationRate: Math.round(((subscribers.length - deduplicationResult.unique.length) / subscribers.length) * 100)
      });
    }

    // Call progress callback if provided
    if (options.progressCallback) {
      options.progressCallback({
        phase: 'deduplication',
        original: subscribers.length,
        unique: deduplicationResult.unique.length,
        duplicates: deduplicationResult.duplicates.length,
        statistics: duplicateStats
      });
    }

    return deduplicationResult.unique;
  }

  /**
   * Import to Laylo
   * @param {ImportSession} importSession - Import session
   * @param {Array} subscribers - Unique subscribers
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import results
   */
  async importToLaylo(importSession, subscribers, options) {
    importSession.setPhase('api_import');

    if (this.logger) {
      this.logger.info('Starting Laylo API import', {
        subscriberCount: subscribers.length,
        batchSize: options.batchSize,
        concurrency: options.concurrency
      });
    }

    // Process in batches
    const batches = this.createBatches(subscribers, options.batchSize);
    const allResults = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      if (this.logger) {
        this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, {
          batchSize: batch.length
        });
      }

      const batchResult = await this.apiRepository.subscribeUsersBatch(batch, {
        concurrency: options.concurrency,
        failFast: options.failFast
      });

      // Record results in import session
      for (const result of batchResult.results) {
        if (result.success) {
          importSession.recordSuccess(
            subscribers.find(s => s.getUniqueId() === result.metadata.subscriberId),
            result.data
          );
        } else {
          importSession.recordFailure(
            subscribers.find(s => s.getUniqueId() === result.metadata.subscriberId),
            result.error
          );
        }
      }

      allResults.push(batchResult);

      // Call progress callback if provided
      if (options.progressCallback) {
        const processedCount = (batchIndex + 1) * options.batchSize;
        options.progressCallback({
          phase: 'import',
          batch: batchIndex + 1,
          totalBatches: batches.length,
          processed: Math.min(processedCount, subscribers.length),
          total: subscribers.length,
          successful: importSession.getStatus().statistics.successful,
          failed: importSession.getStatus().statistics.failed
        });
      }

      // Add delay between batches if configured
      if (batchIndex < batches.length - 1 && this.config.BATCH_DELAY) {
        await this.sleep(this.config.BATCH_DELAY);
      }
    }

    const combinedStats = this.combineResultStatistics(allResults);

    if (this.logger) {
      this.logger.info('Laylo API import completed', combinedStats);
    }

    return {
      batches: allResults,
      statistics: combinedStats
    };
  }

  /**
   * Complete import process
   * @param {ImportSession} importSession - Import session
   * @param {Object} importResults - Import results
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Final summary
   */
  async completeImport(importSession, importResults, options) {
    importSession.setPhase('completion');
    importSession.complete(true);

    const summary = {
      sessionId: importSession.sessionId,
      dryRun: options.dryRun,
      statistics: importSession.getStatus().statistics,
      duration: importSession.getDuration(),
      apiResults: importResults ? importResults.statistics : null,
      apiRepository: this.apiRepository.getStatistics(),
      deduplicationStats: this.deduplicationService.getStatistics()
    };

    if (this.logger) {
      this.logger.info('Import process completed', summary);
    }

    return summary;
  }

  /**
   * Create batches from subscribers array
   * @param {Array} subscribers - Subscribers to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array<Array>} Array of batches
   */
  createBatches(subscribers, batchSize) {
    const batches = [];
    for (let i = 0; i < subscribers.length; i += batchSize) {
      batches.push(subscribers.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Combine result statistics from multiple batches
   * @param {Array} batchResults - Array of batch results
   * @returns {Object} Combined statistics
   */
  combineResultStatistics(batchResults) {
    const combined = {
      totalBatches: batchResults.length,
      totalRequests: 0,
      successful: 0,
      failed: 0,
      successRate: 0
    };

    for (const batchResult of batchResults) {
      combined.totalRequests += batchResult.statistics.total;
      combined.successful += batchResult.statistics.successful;
      combined.failed += batchResult.statistics.failed;
    }

    if (combined.totalRequests > 0) {
      combined.successRate = Math.round((combined.successful / combined.totalRequests) * 100);
    }

    return combined;
  }

  /**
   * Update use case statistics
   * @param {Object} summary - Import summary
   */
  updateStatistics(summary) {
    this.statistics.sessionsExecuted++;
    this.statistics.totalRecordsProcessed += summary.statistics.totalRecords;
    this.statistics.totalRecordsSuccessful += summary.statistics.successful;
    this.statistics.totalRecordsFailed += summary.statistics.failed;
    this.statistics.lastExecutionAt = new Date().toISOString();
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `import_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get use case statistics
   * @returns {Object} Use case statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * Reset use case statistics
   */
  resetStatistics() {
    this.statistics = {
      sessionsExecuted: 0,
      totalRecordsProcessed: 0,
      totalRecordsSuccessful: 0,
      totalRecordsFailed: 0,
      lastExecutionAt: null
    };
  }
}

module.exports = {
  ImportCsvUseCase
}; 