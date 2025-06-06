/**
 * Validate Command
 * Validate CSV data without importing (dry-run mode)
 * Following Command pattern and Phase 4 CLI guidelines
 */

const path = require('path');
const fs = require('fs');
const { BaseCommand, CommandResult, ValidationResult } = require('../CommandRegistry');

/**
 * Validate command implementation
 */
class ValidateCommand extends BaseCommand {
  constructor(config, ui) {
    super('validate', 'Validate CSV data without importing (dry-run mode)');
    this.config = config;
    this.ui = ui;
  }

  /**
   * Execute validate command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    try {
      const csvFile = args.getFirstArg();
      if (!csvFile) {
        return CommandResult.failure('CSV file path is required');
      }

      // Show action details and get confirmation
      const actionDetails = this.getActionDetails(args);
      const shouldProceed = await this.ui.confirmAction(
        'Validate CSV Data',
        actionDetails,
        { defaultValue: true }
      );

      if (!shouldProceed) {
        return CommandResult.success('Validation cancelled by user');
      }

      // Execute validation
      const result = await this.performValidation(csvFile, args);
      return result;

    } catch (error) {
      return CommandResult.failure(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Perform the actual validation
   * @param {string} csvFile - CSV file path
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Validation result
   * @private
   */
  async performValidation(csvFile, args) {
    try {
      // Import validation use case
      const { ValidateDataUseCase } = require('../../../application/useCases/ValidateDataUseCase');
      
      // Create validation use case instance
      const validateUseCase = new ValidateDataUseCase(this.config, this.ui);

      // Configure validation options
      const validationOptions = {
        filePath: csvFile,
        strict: args.getOption('strict', false),
        showDuplicates: args.getOption('showDuplicates', false),
        maxErrors: args.getOption('maxErrors', 10),
        format: args.getOption('format', 'text'),
        outputFile: args.getOption('output')
      };

      this.ui.info(`🔍 Starting validation of: ${csvFile}`);

      // Execute validation
      const validationResult = await validateUseCase.execute(validationOptions);

      // Display results
      this.displayValidationResults(validationResult);

      // Export results if requested
      if (args.getOption('output')) {
        await this.exportValidationResults(validationResult, args);
      }

      // Determine success/failure
      if (validationResult.isValid) {
        return CommandResult.success(
          `✅ Validation completed successfully. ${validationResult.summary.totalRecords} records validated.`,
          validationResult
        );
      } else {
        return CommandResult.failure(
          `❌ Validation failed with ${validationResult.summary.errorCount} errors.`,
          validationResult
        );
      }

    } catch (error) {
      return CommandResult.failure(`Validation execution failed: ${error.message}`);
    }
  }

  /**
   * Display validation results
   * @param {Object} validationResult - Validation result data
   * @private
   */
  displayValidationResults(validationResult) {
    const { summary, errors, warnings, duplicates } = validationResult;

    // Display summary
    this.ui.displaySummary('Validation Summary', {
      'Total Records': summary.totalRecords,
      'Valid Records': summary.validRecords,
      'Invalid Records': summary.invalidRecords,
      'Warnings': summary.warningCount,
      'Errors': summary.errorCount,
      'Duplicates Found': summary.duplicatesFound || 0,
      'Success Rate': `${Math.round((summary.validRecords / summary.totalRecords) * 100)}%`
    });

    // Display errors if any
    if (errors && errors.length > 0) {
      console.log('\n❌ Validation Errors:');
      errors.slice(0, 10).forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.message}`);
        if (error.field) {
          console.log(`     Field: ${error.field}, Value: "${error.value}"`);
        }
      });

      if (errors.length > 10) {
        console.log(`     ... and ${errors.length - 10} more errors`);
      }
    }

    // Display warnings if any
    if (warnings && warnings.length > 0) {
      console.log('\n⚠️  Validation Warnings:');
      warnings.slice(0, 5).forEach((warning, index) => {
        console.log(`  ${index + 1}. Row ${warning.row}: ${warning.message}`);
      });

      if (warnings.length > 5) {
        console.log(`     ... and ${warnings.length - 5} more warnings`);
      }
    }

    // Display duplicates if found
    if (duplicates && duplicates.length > 0) {
      console.log('\n🔄 Duplicate Records:');
      duplicates.slice(0, 5).forEach((duplicate, index) => {
        const rows = duplicate.rows || [duplicate.lineNumber];
        const field = duplicate.field || 'email';
        const value = duplicate.value || duplicate.email;
        console.log(`  ${index + 1}. Rows ${rows.join ? rows.join(', ') : rows}: ${field} = "${value}"`);
      });

      if (duplicates.length > 5) {
        console.log(`     ... and ${duplicates.length - 5} more duplicates`);
      }
    }

    // Display recommendations
    if (summary.recommendations && summary.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      summary.recommendations.forEach((recommendation, index) => {
        console.log(`  ${index + 1}. ${recommendation}`);
      });
    }
  }

  /**
   * Export validation results to file
   * @param {Object} validationResult - Validation result data
   * @param {ParsedArguments} args - Parsed arguments
   * @private
   */
  async exportValidationResults(validationResult, args) {
    try {
      const outputFile = args.getOption('output');
      const format = args.getOption('format', 'json').toLowerCase();

      let exportData;
      let fileExtension;

      switch (format) {
        case 'json':
          exportData = JSON.stringify(validationResult, null, 2);
          fileExtension = '.json';
          break;
          
        case 'csv':
          exportData = this.convertToCsv(validationResult);
          fileExtension = '.csv';
          break;
          
        case 'text':
        default:
          exportData = this.convertToText(validationResult);
          fileExtension = '.txt';
          break;
      }

      // Ensure file has correct extension
      const finalOutputFile = outputFile.endsWith(fileExtension) ? 
        outputFile : `${outputFile}${fileExtension}`;

      // Write to file
      fs.writeFileSync(finalOutputFile, exportData, 'utf8');
      
      this.ui.success(`📄 Validation report exported to: ${finalOutputFile}`);
    } catch (error) {
      this.ui.warning(`Failed to export validation results: ${error.message}`);
    }
  }

  /**
   * Convert validation results to CSV format
   * @param {Object} validationResult - Validation result data
   * @returns {string} CSV data
   * @private
   */
  convertToCsv(validationResult) {
    const { errors, warnings } = validationResult;
    const csvLines = ['Type,Row,Field,Value,Message'];

    // Add errors
    if (errors) {
      errors.forEach(error => {
        const row = [
          'Error',
          error.row || '',
          error.field || '',
          `"${(error.value || '').toString().replace(/"/g, '""')}"`,
          `"${error.message.replace(/"/g, '""')}"`
        ];
        csvLines.push(row.join(','));
      });
    }

    // Add warnings
    if (warnings) {
      warnings.forEach(warning => {
        const row = [
          'Warning',
          warning.row || '',
          warning.field || '',
          `"${(warning.value || '').toString().replace(/"/g, '""')}"`,
          `"${warning.message.replace(/"/g, '""')}"`
        ];
        csvLines.push(row.join(','));
      });
    }

    return csvLines.join('\n');
  }

  /**
   * Convert validation results to text format
   * @param {Object} validationResult - Validation result data
   * @returns {string} Text data
   * @private
   */
  convertToText(validationResult) {
    const lines = [];
    const { summary, errors, warnings, duplicates } = validationResult;

    // Add summary
    lines.push('VALIDATION SUMMARY');
    lines.push('='.repeat(50));
    lines.push(`Total Records: ${summary.totalRecords}`);
    lines.push(`Valid Records: ${summary.validRecords}`);
    lines.push(`Invalid Records: ${summary.invalidRecords}`);
    lines.push(`Errors: ${summary.errorCount}`);
    lines.push(`Warnings: ${summary.warningCount}`);
    lines.push(`Duplicates: ${summary.duplicatesFound || 0}`);
    lines.push('');

    // Add errors
    if (errors && errors.length > 0) {
      lines.push('ERRORS');
      lines.push('-'.repeat(30));
      errors.forEach((error, index) => {
        lines.push(`${index + 1}. Row ${error.row}: ${error.message}`);
        if (error.field) {
          lines.push(`   Field: ${error.field}, Value: "${error.value}"`);
        }
      });
      lines.push('');
    }

    // Add warnings
    if (warnings && warnings.length > 0) {
      lines.push('WARNINGS');
      lines.push('-'.repeat(30));
      warnings.forEach((warning, index) => {
        lines.push(`${index + 1}. Row ${warning.row}: ${warning.message}`);
      });
      lines.push('');
    }

    return lines.join('\n');
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

    // Check file extension
    const ext = path.extname(csvFile).toLowerCase();
    if (ext !== '.csv') {
      validation.addWarning(`File extension is '${ext}', expected '.csv'`);
    }

    // Validate format option
    const format = args.getOption('format');
    if (format && !['json', 'csv', 'text'].includes(format.toLowerCase())) {
      validation.addError('Format must be one of: json, csv, text');
    }

    // Validate maxErrors option
    const maxErrors = args.getOption('maxErrors');
    if (maxErrors && (isNaN(maxErrors) || maxErrors < 1)) {
      validation.addError('maxErrors must be a positive number');
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
    const options = {};
    
    if (args.hasOption('strict')) options['Strict Mode'] = 'Enabled';
    if (args.hasOption('showDuplicates')) options['Show Duplicates'] = 'Yes';
    if (args.getOption('format')) options['Output Format'] = args.getOption('format');
    if (args.getOption('output')) options['Export To'] = args.getOption('output');
    
    return {
      'CSV File': csvFile,
      'Max Errors to Display': args.getOption('maxErrors', 10),
      ...options
    };
  }

  /**
   * Check if this is a destructive action
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {boolean} Always false for validation
   */
  isDestructiveAction(args) {
    return false; // Validation is never destructive
  }
}

module.exports = ValidateCommand; 