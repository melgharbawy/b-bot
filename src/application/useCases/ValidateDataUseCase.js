/**
 * Validate Data Use Case
 * Standalone data validation for CSV files
 * Following Clean Architecture - Application Layer
 */

const { ValidationService } = require('../../domain/services/ValidationService');
const { DeduplicationService } = require('../../domain/services/DeduplicationService');
const CsvRepository = require('../../infrastructure/repositories/CsvRepository');

/**
 * Validation report
 */
class ValidationReport {
  constructor(summary, records, duplicates, statistics) {
    this.summary = summary;
    this.records = records;
    this.duplicates = duplicates;
    this.statistics = statistics;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get valid records
   * @returns {Array} Valid records
   */
  getValidRecords() {
    return this.records.filter(r => r.isValid);
  }

  /**
   * Get invalid records
   * @returns {Array} Invalid records
   */
  getInvalidRecords() {
    return this.records.filter(r => !r.isValid);
  }

  /**
   * Get records with warnings
   * @returns {Array} Records with warnings
   */
  getRecordsWithWarnings() {
    return this.records.filter(r => r.validationResult.hasWarnings());
  }

  /**
   * Get validation errors grouped by type
   * @returns {Object} Errors grouped by type
   */
  getErrorsByType() {
    const errorsByType = {};
    
    for (const record of this.getInvalidRecords()) {
      for (const error of record.validationResult.getErrors()) {
        const errorType = error.type || 'unknown';
        if (!errorsByType[errorType]) {
          errorsByType[errorType] = [];
        }
        errorsByType[errorType].push({
          lineNumber: record.record._lineNumber,
          field: error.field,
          value: error.value,
          message: error.message
        });
      }
    }

    return errorsByType;
  }

  /**
   * Export report to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      summary: this.summary,
      records: this.records.map(r => ({
        lineNumber: r.record._lineNumber,
        isValid: r.isValid,
        subscriber: {
          email: r.subscriber.maskEmail(r.subscriber.email),
          firstName: r.subscriber.firstName,
          lastName: r.subscriber.lastName,
          phoneNumber: r.subscriber.maskPhoneNumber(r.subscriber.phoneNumber),
          hasPhoneNumber: r.subscriber.hasPhoneNumber()
        },
        errors: r.validationResult.getErrorMessages(),
        warnings: r.validationResult.getWarningMessages()
      })),
      duplicates: this.duplicates,
      statistics: this.statistics,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validate Data Use Case
 */
class ValidateDataUseCase {
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger;
    
    // Initialize services
    this.csvRepository = new CsvRepository(logger);
    this.validationService = new ValidationService();
    this.deduplicationService = new DeduplicationService();
    
    // Track use case statistics
    this.statistics = {
      validationsExecuted: 0,
      totalRecordsValidated: 0,
      totalValidRecords: 0,
      totalInvalidRecords: 0,
      totalDuplicatesFound: 0,
      lastExecutionAt: null
    };
  }

  /**
   * Execute data validation workflow
   * @param {Object} options - Validation options
   * @returns {Promise<ValidationReport>} Validation report
   */
  async execute(options = {}) {
    const validationOptions = {
      csvFilePath: options.csvFilePath || this.config.CSV_FILE_PATH,
      maxRecords: options.maxRecords || null,
      includeDeduplication: options.includeDeduplication !== false,
      includeWarnings: options.includeWarnings !== false,
      progressCallback: options.progressCallback || null,
      strictValidation: options.strictValidation || false,
      ...options
    };

    if (this.logger) {
      this.logger.info('Starting data validation workflow', {
        csvFilePath: validationOptions.csvFilePath,
        maxRecords: validationOptions.maxRecords,
        includeDeduplication: validationOptions.includeDeduplication,
        strictValidation: validationOptions.strictValidation
      });
    }

    try {
      // Phase 1: Load CSV data
      const records = await this.loadCsvData(validationOptions);

      // Phase 2: Validate records
      const validationResults = await this.validateRecords(records, validationOptions);

      // Phase 3: Check for duplicates (if enabled)
      let duplicates = [];
      if (validationOptions.includeDeduplication) {
        duplicates = await this.checkDuplicates(validationResults, validationOptions);
      }

      // Phase 4: Generate report
      const report = await this.generateReport(validationResults, duplicates, validationOptions);

      // Update use case statistics
      this.updateStatistics(report);

      if (this.logger) {
        this.logger.info('Data validation completed successfully', {
          totalRecords: report.summary.totalRecords,
          validRecords: report.summary.validRecords,
          invalidRecords: report.summary.invalidRecords,
          duplicatesFound: report.summary.duplicatesFound
        });
      }

      return report;

    } catch (error) {
      if (this.logger) {
        this.logger.error('Data validation failed', {
          error: error.message,
          csvFilePath: validationOptions.csvFilePath
        });
      }
      throw error;
    }
  }

  /**
   * Load CSV data
   * @param {Object} options - Validation options
   * @returns {Promise<Array>} CSV records
   */
  async loadCsvData(options) {
    if (this.logger) {
      this.logger.info('Loading CSV data for validation', {
        filePath: options.csvFilePath,
        maxRecords: options.maxRecords
      });
    }

    const readOptions = {
      maxRows: options.maxRecords,
      requiredHeaders: ['email']
    };

    const { records, result } = await this.csvRepository.readAll(options.csvFilePath, readOptions);

    if (records.length === 0) {
      throw new Error('No records found in CSV file');
    }

    if (this.logger) {
      this.logger.info('CSV data loaded successfully', {
        totalRecords: records.length,
        csvStats: {
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          headers: result.headers
        }
      });
    }

    return records;
  }

  /**
   * Validate CSV records
   * @param {Array} records - CSV records
   * @param {Object} options - Validation options
   * @returns {Promise<Array>} Validation results
   */
  async validateRecords(records, options) {
    if (this.logger) {
      this.logger.info('Starting record validation', {
        totalRecords: records.length,
        strictValidation: options.strictValidation
      });
    }

    const validationResults = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      const { subscriber, validationResult, isValid } = this.validationService.validateAndCreateSubscriber(
        record, 
        { strict: options.strictValidation }
      );

      const result = {
        record,
        subscriber,
        validationResult,
        isValid,
        index: i
      };

      validationResults.push(result);

      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
      }

      // Call progress callback if provided
      if (options.progressCallback) {
        options.progressCallback({
          phase: 'validation',
          processed: i + 1,
          total: records.length,
          valid: validCount,
          invalid: invalidCount,
          currentRecord: {
            lineNumber: record._lineNumber,
            email: subscriber.maskEmail(subscriber.email),
            isValid
          }
        });
      }
    }

    if (this.logger) {
      this.logger.info('Record validation completed', {
        totalRecords: records.length,
        validRecords: validCount,
        invalidRecords: invalidCount,
        validationRate: Math.round((validCount / records.length) * 100)
      });
    }

    return validationResults;
  }

  /**
   * Check for duplicates
   * @param {Array} validationResults - Validation results
   * @param {Object} options - Validation options
   * @returns {Promise<Array>} Duplicate information
   */
  async checkDuplicates(validationResults, options) {
    if (this.logger) {
      this.logger.info('Checking for duplicates');
    }

    // Get only valid subscribers for duplicate checking
    const validSubscribers = validationResults
      .filter(r => r.isValid)
      .map(r => r.subscriber);

    if (validSubscribers.length === 0) {
      if (this.logger) {
        this.logger.info('No valid subscribers to check for duplicates');
      }
      return [];
    }

    const deduplicationResult = this.deduplicationService.processBatch(validSubscribers);
    const duplicateStats = this.deduplicationService.getStatistics();

    // Format duplicate information
    const duplicates = deduplicationResult.duplicates.map(dup => ({
      email: dup.subscriber.maskEmail(dup.subscriber.email),
      firstName: dup.subscriber.firstName,
      lastName: dup.subscriber.lastName,
      duplicateCount: dup.duplicateResult.duplicateCount,
      isDuplicate: dup.duplicateResult.isDuplicate,
      timestamp: dup.duplicateResult.timestamp,
      originalRecord: dup.duplicateResult.originalRecord ? {
        email: dup.duplicateResult.originalRecord.maskEmail(dup.duplicateResult.originalRecord.email),
        firstName: dup.duplicateResult.originalRecord.firstName,
        lastName: dup.duplicateResult.originalRecord.lastName
      } : null
    }));

    if (this.logger) {
      this.logger.info('Duplicate check completed', {
        totalValidSubscribers: validSubscribers.length,
        uniqueSubscribers: deduplicationResult.unique.length,
        duplicatesFound: duplicates.length,
        deduplicationRate: Math.round(((validSubscribers.length - deduplicationResult.unique.length) / validSubscribers.length) * 100)
      });
    }

    // Call progress callback if provided
    if (options.progressCallback) {
      options.progressCallback({
        phase: 'deduplication',
        total: validSubscribers.length,
        unique: deduplicationResult.unique.length,
        duplicates: duplicates.length,
        statistics: duplicateStats
      });
    }

    return duplicates;
  }

  /**
   * Generate validation report
   * @param {Array} validationResults - Validation results
   * @param {Array} duplicates - Duplicate information
   * @param {Object} options - Validation options
   * @returns {Promise<ValidationReport>} Validation report
   */
  async generateReport(validationResults, duplicates, options) {
    const validRecords = validationResults.filter(r => r.isValid);
    const invalidRecords = validationResults.filter(r => !r.isValid);
    const recordsWithWarnings = validationResults.filter(r => r.validationResult.hasWarnings());

    const summary = {
      totalRecords: validationResults.length,
      validRecords: validRecords.length,
      invalidRecords: invalidRecords.length,
      recordsWithWarnings: recordsWithWarnings.length,
      duplicatesFound: duplicates.length,
      validationRate: Math.round((validRecords.length / validationResults.length) * 100),
      csvFilePath: options.csvFilePath,
      validationOptions: {
        includeDeduplication: options.includeDeduplication,
        strictValidation: options.strictValidation,
        maxRecords: options.maxRecords
      }
    };

    const statistics = {
      byEmailDomain: this.getStatisticsByEmailDomain(validationResults),
      byValidationType: this.getStatisticsByValidationType(invalidRecords),
      byPhoneNumberPresence: this.getStatisticsByPhoneNumberPresence(validationResults),
      commonIssues: this.getCommonValidationIssues(invalidRecords)
    };

    if (this.logger) {
      this.logger.info('Validation report generated', summary);
    }

    return new ValidationReport(summary, validationResults, duplicates, statistics);
  }

  /**
   * Get statistics by email domain
   * @param {Array} validationResults - Validation results
   * @returns {Object} Statistics by email domain
   */
  getStatisticsByEmailDomain(validationResults) {
    const domainStats = {};
    
    for (const result of validationResults) {
      if (result.subscriber.email) {
        const domain = result.subscriber.email.split('@')[1];
        if (domain) {
          if (!domainStats[domain]) {
            domainStats[domain] = { total: 0, valid: 0, invalid: 0 };
          }
          domainStats[domain].total++;
          if (result.isValid) {
            domainStats[domain].valid++;
          } else {
            domainStats[domain].invalid++;
          }
        }
      }
    }

    // Sort by total count and return top 10
    return Object.entries(domainStats)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 10)
      .reduce((acc, [domain, stats]) => {
        acc[domain] = stats;
        return acc;
      }, {});
  }

  /**
   * Get statistics by validation type
   * @param {Array} invalidRecords - Invalid records
   * @returns {Object} Statistics by validation type
   */
  getStatisticsByValidationType(invalidRecords) {
    const typeStats = {};
    
    for (const record of invalidRecords) {
      for (const error of record.validationResult.getErrors()) {
        const errorType = error.type || 'unknown';
        if (!typeStats[errorType]) {
          typeStats[errorType] = 0;
        }
        typeStats[errorType]++;
      }
    }

    return typeStats;
  }

  /**
   * Get statistics by phone number presence
   * @param {Array} validationResults - Validation results
   * @returns {Object} Statistics by phone number presence
   */
  getStatisticsByPhoneNumberPresence(validationResults) {
    let withPhone = 0;
    let withoutPhone = 0;

    for (const result of validationResults) {
      if (result.subscriber.hasPhoneNumber()) {
        withPhone++;
      } else {
        withoutPhone++;
      }
    }

    return {
      withPhoneNumber: withPhone,
      withoutPhoneNumber: withoutPhone,
      phoneNumberRate: Math.round((withPhone / validationResults.length) * 100)
    };
  }

  /**
   * Get common validation issues
   * @param {Array} invalidRecords - Invalid records
   * @returns {Array} Common validation issues
   */
  getCommonValidationIssues(invalidRecords) {
    const issueStats = {};
    
    for (const record of invalidRecords) {
      for (const error of record.validationResult.getErrors()) {
        const issueKey = `${error.field || 'unknown'}_${error.type || 'unknown'}`;
        if (!issueStats[issueKey]) {
          issueStats[issueKey] = {
            field: error.field,
            type: error.type,
            count: 0,
            examples: []
          };
        }
        issueStats[issueKey].count++;
        
        if (issueStats[issueKey].examples.length < 5) {
          issueStats[issueKey].examples.push({
            lineNumber: record.record._lineNumber,
            value: error.value,
            message: error.message
          });
        }
      }
    }

    // Sort by count and return top 10
    return Object.values(issueStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Update use case statistics
   * @param {ValidationReport} report - Validation report
   */
  updateStatistics(report) {
    this.statistics.validationsExecuted++;
    this.statistics.totalRecordsValidated += report.summary.totalRecords;
    this.statistics.totalValidRecords += report.summary.validRecords;
    this.statistics.totalInvalidRecords += report.summary.invalidRecords;
    this.statistics.totalDuplicatesFound += report.summary.duplicatesFound;
    this.statistics.lastExecutionAt = new Date().toISOString();
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
      validationsExecuted: 0,
      totalRecordsValidated: 0,
      totalValidRecords: 0,
      totalInvalidRecords: 0,
      totalDuplicatesFound: 0,
      lastExecutionAt: null
    };
  }
}

module.exports = {
  ValidateDataUseCase,
  ValidationReport
}; 