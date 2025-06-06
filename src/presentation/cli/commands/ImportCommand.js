/**
 * Import Command
 * Import CSV data to Laylo with dry-run support
 * Following Command pattern and Phase 4 CLI guidelines
 */

const path = require('path');
const fs = require('fs');
const { BaseCommand, CommandResult, ValidationResult } = require('../CommandRegistry');

/**
 * Import command implementation
 */
class ImportCommand extends BaseCommand {
  constructor(config, ui) {
    super('import', 'Import CSV data to Laylo (supports --dry-run)');
    this.config = config;
    this.ui = ui;
  }

  /**
   * Execute import command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    try {
      const csvFile = args.getFirstArg();
      if (!csvFile) {
        return CommandResult.failure('CSV file path is required');
      }

      const isDryRun = args.getOption('dryRun', false);

      // Show action details and get confirmation
      const actionDetails = this.getActionDetails(args);
      const shouldProceed = await this.ui.confirmAction(
        isDryRun ? 'Validate CSV Data (Dry Run)' : 'Import CSV Data to Laylo',
        actionDetails,
        { 
          defaultValue: isDryRun ? true : false,
          destructive: !isDryRun 
        }
      );

      if (!shouldProceed) {
        return CommandResult.success(`${isDryRun ? 'Validation' : 'Import'} cancelled by user`);
      }

      // Execute import or dry run
      if (isDryRun) {
        return await this.performDryRun(csvFile, args);
      } else {
        return await this.performImport(csvFile, args);
      }

    } catch (error) {
      return CommandResult.failure(`Import failed: ${error.message}`);
    }
  }

  /**
   * Perform dry run validation
   * @param {string} csvFile - CSV file path
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Validation result
   * @private
   */
  async performDryRun(csvFile, args) {
    try {
      this.ui.info('🔍 Running dry-run validation...');

      // Import validation use case
      const { ValidateDataUseCase } = require('../../../application/useCases/ValidateDataUseCase');
      
      // Create validation use case instance
      const validateUseCase = new ValidateDataUseCase(this.config, this.ui);

      // Configure validation options
      const validationOptions = {
        filePath: csvFile,
        strict: true, // Always use strict mode for import validation
        showDuplicates: true,
        maxErrors: args.getOption('maxRecords') || 1000,
        format: 'detailed'
      };

      // Execute validation
      const validationResult = await validateUseCase.execute(validationOptions);

      // Display detailed results
      this.displayDryRunResults(validationResult, args);

      // Export results if requested
      if (args.getOption('output')) {
        await this.exportResults(validationResult, args, true);
      }

      // Show import preview
      if (validationResult.isValid && validationResult.summary.validRecords > 0) {
        this.showImportPreview(validationResult, args);
      }

      if (validationResult.isValid) {
        return CommandResult.success(
          `✅ Dry run completed successfully. ${validationResult.summary.validRecords} records ready for import.`,
          validationResult
        );
      } else {
        return CommandResult.failure(
          `❌ Dry run failed with ${validationResult.summary.errorCount} errors.`,
          validationResult
        );
      }

    } catch (error) {
      return CommandResult.failure(`Dry run execution failed: ${error.message}`);
    }
  }

  /**
   * Perform actual import
   * @param {string} csvFile - CSV file path
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Import result
   * @private
   */
  async performImport(csvFile, args) {
    try {
      this.ui.info('🚀 Starting CSV import to Laylo...');

      // Import use case
      const { ImportCsvUseCase } = require('../../../application/useCases/ImportCsvUseCase');
      
      // Create import use case instance
      const importUseCase = new ImportCsvUseCase(this.config, this.ui);

      // Configure import options
      const importOptions = {
        filePath: csvFile,
        batchSize: args.getOption('batchSize', this.config.batchSize || 5),
        maxRecords: args.getOption('maxRecords'),
        skipValidation: args.getOption('skipValidation', false),
        force: args.getOption('force', false),
        apiKey: args.getOption('apiKey') || this.config.layloApiKey,
        rateLimit: args.getOption('rateLimit', this.config.rateLimit || 1000),
        outputFile: args.getOption('output'),
        format: args.getOption('format', 'json')
      };

      // Validate API key is available
      if (!importOptions.apiKey) {
        return CommandResult.failure('Laylo API key is required. Set LAYLO_API_KEY environment variable or use --api-key option.');
      }

      // Execute import
      const importResult = await importUseCase.execute(importOptions);

      // Display results
      this.displayImportResults(importResult);

      // Export results if requested
      if (args.getOption('output')) {
        await this.exportResults(importResult, args, false);
      }

      // Determine success/failure
      if (importResult.success) {
        return CommandResult.success(
          `✅ Import completed successfully. ${importResult.summary.successCount} records imported.`,
          importResult
        );
      } else {
        return CommandResult.failure(
          `❌ Import completed with errors. ${importResult.summary.successCount} successful, ${importResult.summary.errorCount} failed.`,
          importResult
        );
      }

    } catch (error) {
      return CommandResult.failure(`Import execution failed: ${error.message}`);
    }
  }

  /**
   * Display dry run results
   * @param {Object} validationResult - Validation result data
   * @param {ParsedArguments} args - Parsed arguments
   * @private
   */
  displayDryRunResults(validationResult, args) {
    const { summary, errors, warnings, duplicates } = validationResult;

    // Display summary
    this.ui.displaySummary('Dry Run Results', {
      'Total Records': summary.totalRecords,
      'Ready for Import': summary.validRecords,
      'Would Be Skipped': summary.invalidRecords,
      'Validation Errors': summary.errorCount,
      'Warnings': summary.warningCount,
      'Duplicates Found': summary.duplicatesFound || 0,
      'Estimated Import Time': this.estimateImportTime(summary.validRecords, args)
    });

    // Display top errors
    if (errors && errors.length > 0) {
      console.log('\n❌ Top Validation Issues:');
      errors.slice(0, 5).forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.message}`);
      });
      if (errors.length > 5) {
        console.log(`     ... and ${errors.length - 5} more issues`);
      }
    }

    // Show recommendations
    this.showDryRunRecommendations(validationResult);
  }

  /**
   * Display import results
   * @param {Object} importResult - Import result data
   * @private
   */
  displayImportResults(importResult) {
    const { summary, errors, successes } = importResult;

    // Display summary
    this.ui.displaySummary('Import Results', {
      'Total Processed': summary.totalProcessed,
      'Successfully Imported': summary.successCount,
      'Failed Imports': summary.errorCount,
      'Success Rate': `${Math.round((summary.successCount / summary.totalProcessed) * 100)}%`,
      'Total Duration': summary.duration,
      'Average Rate': `${Math.round(summary.successCount / (summary.duration / 1000))} records/sec`
    });

    // Display errors if any
    if (errors && errors.length > 0) {
      console.log('\n❌ Import Errors:');
      errors.slice(0, 10).forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.message}`);
        if (error.details) {
          console.log(`     Details: ${error.details}`);
        }
      });
      if (errors.length > 10) {
        console.log(`     ... and ${errors.length - 10} more errors`);
      }
    }

    // Show final recommendations
    this.showImportRecommendations(importResult);
  }

  /**
   * Show import preview for dry run
   * @param {Object} validationResult - Validation result
   * @param {ParsedArguments} args - Parsed arguments
   * @private
   */
  showImportPreview(validationResult, args) {
    const { summary } = validationResult;
    const batchSize = args.getOption('batchSize', this.config.batchSize || 5);
    const rateLimit = args.getOption('rateLimit', this.config.rateLimit || 1000);
    
    console.log('\n📊 Import Preview:');
    console.log(`  • ${summary.validRecords} records will be imported`);
    console.log(`  • Batch size: ${batchSize} records per batch`);
    console.log(`  • Rate limit: ${rateLimit}ms between batches`);
    console.log(`  • Estimated batches: ${Math.ceil(summary.validRecords / batchSize)}`);
    console.log(`  • Estimated time: ${this.estimateImportTime(summary.validRecords, args)}`);
    console.log('\n💡 To proceed with actual import, run the same command without --dry-run');
  }

  /**
   * Show dry run recommendations
   * @param {Object} validationResult - Validation result
   * @private
   */
  showDryRunRecommendations(validationResult) {
    const { summary } = validationResult;
    const recommendations = [];

    if (summary.errorCount > 0) {
      recommendations.push('Fix validation errors before importing');
    }

    if (summary.duplicatesFound > 0) {
      recommendations.push('Review and resolve duplicate records');
    }

    if (summary.validRecords > 100) {
      recommendations.push('Consider using smaller batch sizes for large imports');
    }

    if (recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  /**
   * Show import recommendations
   * @param {Object} importResult - Import result
   * @private
   */
  showImportRecommendations(importResult) {
    const { summary } = importResult;
    const recommendations = [];

    if (summary.errorCount > 0) {
      recommendations.push('Review failed imports and retry if necessary');
      recommendations.push('Check API rate limits if many requests failed');
    }

    if (summary.successCount > 0) {
      recommendations.push('Verify imported subscribers in Laylo dashboard');
    }

    if (recommendations.length > 0) {
      console.log('\n💡 Next Steps:');
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  /**
   * Estimate import time
   * @param {number} recordCount - Number of records
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {string} Estimated time
   * @private
   */
  estimateImportTime(recordCount, args) {
    const batchSize = args.getOption('batchSize', this.config.batchSize || 5);
    const rateLimit = args.getOption('rateLimit', this.config.rateLimit || 1000);
    
    const batches = Math.ceil(recordCount / batchSize);
    const totalTimeMs = batches * (rateLimit + 500); // Add 500ms for processing time
    
    const minutes = Math.floor(totalTimeMs / 60000);
    const seconds = Math.floor((totalTimeMs % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Export results to file
   * @param {Object} result - Result data
   * @param {ParsedArguments} args - Parsed arguments
   * @param {boolean} isDryRun - Whether this is a dry run
   * @private
   */
  async exportResults(result, args, isDryRun) {
    try {
      const outputFile = args.getOption('output');
      const format = args.getOption('format', 'json').toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Add prefix for dry run files
      const prefix = isDryRun ? 'dry-run-' : 'import-';
      const finalOutputFile = outputFile.includes('.') ? 
        outputFile.replace(/(.+)\.(.+)$/, `$1-${prefix}${timestamp}.$2`) :
        `${outputFile}-${prefix}${timestamp}.${format}`;

      let exportData;
      switch (format) {
        case 'json':
          exportData = JSON.stringify(result, null, 2);
          break;
        case 'csv':
          exportData = this.convertResultsToCsv(result, isDryRun);
          break;
        default:
          exportData = JSON.stringify(result, null, 2);
      }

      fs.writeFileSync(finalOutputFile, exportData, 'utf8');
      this.ui.success(`📄 ${isDryRun ? 'Validation' : 'Import'} results exported to: ${finalOutputFile}`);
    } catch (error) {
      this.ui.warning(`Failed to export results: ${error.message}`);
    }
  }

  /**
   * Convert results to CSV format
   * @param {Object} result - Result data
   * @param {boolean} isDryRun - Whether this is a dry run
   * @returns {string} CSV data
   * @private
   */
  convertResultsToCsv(result, isDryRun) {
    const headers = ['Type', 'Row', 'Email', 'Status', 'Message'];
    const rows = [headers.join(',')];

    if (isDryRun) {
      // For validation results
      if (result.errors) {
        result.errors.forEach(error => {
          rows.push([
            'Error',
            error.row || '',
            error.email || '',
            'Invalid',
            `"${error.message.replace(/"/g, '""')}"`
          ].join(','));
        });
      }
    } else {
      // For import results
      if (result.successes) {
        result.successes.forEach(success => {
          rows.push([
            'Success',
            success.row || '',
            success.email || '',
            'Imported',
            'Successfully imported'
          ].join(','));
        });
      }

      if (result.errors) {
        result.errors.forEach(error => {
          rows.push([
            'Error',
            error.row || '',
            error.email || '',
            'Failed',
            `"${error.message.replace(/"/g, '""')}"`
          ].join(','));
        });
      }
    }

    return rows.join('\n');
  }

  /**
   * Validate command arguments
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validate(args) {
    const validation = ValidationResult.valid();
    
    // Check if CSV file is provided
    const csvFile = args.getFirstArg();
    if (!csvFile) {
      validation.addError('CSV file path is required');
      return validation;
    }

    // Check if file exists
    if (!fs.existsSync(csvFile)) {
      validation.addError(`CSV file not found: ${csvFile}`);
      return validation;
    }

    // Validate batch size
    const batchSize = args.getOption('batchSize');
    if (batchSize && (isNaN(batchSize) || batchSize < 1 || batchSize > 50)) {
      validation.addError('batchSize must be between 1 and 50');
    }

    // Validate max records
    const maxRecords = args.getOption('maxRecords');
    if (maxRecords && (isNaN(maxRecords) || maxRecords < 1)) {
      validation.addError('maxRecords must be a positive number');
    }

    // Validate rate limit
    const rateLimit = args.getOption('rateLimit');
    if (rateLimit && (isNaN(rateLimit) || rateLimit < 100)) {
      validation.addError('rateLimit must be at least 100ms');
    }

    // Validate format
    const format = args.getOption('format');
    if (format && !['json', 'csv'].includes(format.toLowerCase())) {
      validation.addError('format must be json or csv');
    }

    return validation;
  }

  /**
   * Get action details for confirmation
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Object} Action details
   */
  getActionDetails(args) {
    const csvFile = args.getFirstArg();
    const isDryRun = args.getOption('dryRun', false);
    
    const details = {
      'CSV File': csvFile,
      'Mode': isDryRun ? 'Dry Run (Validation Only)' : 'Live Import',
      'Batch Size': args.getOption('batchSize', this.config.batchSize || 5),
      'Rate Limit': `${args.getOption('rateLimit', this.config.rateLimit || 1000)}ms`
    };

    if (args.getOption('maxRecords')) {
      details['Max Records'] = args.getOption('maxRecords');
    }

    if (args.getOption('output')) {
      details['Export Results'] = args.getOption('output');
    }

    if (args.getOption('force')) {
      details['Force Mode'] = 'Enabled (No additional confirmations)';
    }

    return details;
  }

  /**
   * Check if this is a destructive action
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {boolean} True if not dry run
   */
  isDestructiveAction(args) {
    return !args.getOption('dryRun', false);
  }
}

module.exports = ImportCommand; 