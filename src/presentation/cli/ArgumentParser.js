/**
 * Argument Parser
 * Parse command line arguments using Commander.js
 * Following Phase 4.3 CLI Architecture Guidelines
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

/**
 * Parsed arguments result
 */
class ParsedArguments {
  constructor(command, options = {}, args = [], rawArgs = []) {
    this.command = command;
    this.options = options;
    this.args = args;
    this.rawArgs = rawArgs;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get option value with default
   * @param {string} name - Option name
   * @param {any} defaultValue - Default value
   * @returns {any} Option value or default
   */
  getOption(name, defaultValue = null) {
    return this.options[name] !== undefined ? this.options[name] : defaultValue;
  }

  /**
   * Check if option is present
   * @param {string} name - Option name
   * @returns {boolean} True if option is set
   */
  hasOption(name) {
    return this.options[name] !== undefined;
  }

  /**
   * Get first argument
   * @returns {string|null} First argument or null
   */
  getFirstArg() {
    return this.args.length > 0 ? this.args[0] : null;
  }

  /**
   * Validate required options and arguments
   * @param {Object} requirements - Requirements specification
   * @returns {ValidationResult} Validation result
   */
  validate(requirements = {}) {
    const errors = [];
    const warnings = [];

    // Check required arguments
    if (requirements.requiredArgs) {
      if (this.args.length < requirements.requiredArgs) {
        errors.push(`Expected at least ${requirements.requiredArgs} arguments, got ${this.args.length}`);
      }
    }

    // Check required options
    if (requirements.requiredOptions) {
      for (const option of requirements.requiredOptions) {
        if (!this.hasOption(option)) {
          errors.push(`Required option --${option} is missing`);
        }
      }
    }

    // Check file existence for file arguments
    if (requirements.fileArgs) {
      for (const index of requirements.fileArgs) {
        const filePath = this.args[index];
        if (filePath && !fs.existsSync(filePath)) {
          errors.push(`File not found: ${filePath}`);
        }
      }
    }

    // Check option ranges
    if (requirements.optionRanges) {
      for (const [option, range] of Object.entries(requirements.optionRanges)) {
        const value = this.getOption(option);
        if (value !== null) {
          if (range.min !== undefined && value < range.min) {
            errors.push(`Option --${option} must be at least ${range.min}, got ${value}`);
          }
          if (range.max !== undefined && value > range.max) {
            errors.push(`Option --${option} must be at most ${range.max}, got ${value}`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Argument parser using Commander.js
 */
class ArgumentParser {
  constructor() {
    this.program = new Command();
    this.setupProgram();
  }

  /**
   * Setup the base program configuration
   * @private
   */
  setupProgram() {
    const packageInfo = this.getPackageInfo();
    
    this.program
      .name('laylo-import')
      .description('CSV import tool for Laylo subscriber management')
      .version(packageInfo.version || '1.0.0')
      .option('-v, --verbose', 'Enable verbose output')
      .option('-q, --quiet', 'Suppress non-essential output')
      .option('--config <file>', 'Configuration file path')
      .option('--log-level <level>', 'Set log level (error, warn, info, debug)', 'info')
      .option('--no-color', 'Disable colored output')
      .helpOption('-h, --help', 'Display help information');

    // Setup import command
    this.setupImportCommand();
    
    // Setup validate command
    this.setupValidateCommand();
    
    // Setup resume command
    this.setupResumeCommand();
    
    // Setup status command
    this.setupStatusCommand();
  }

  /**
   * Setup import command
   * @private
   */
  setupImportCommand() {
    this.program
      .command('import')
      .description('Import CSV data to Laylo')
      .argument('<csv-file>', 'CSV file to import')
      .option('--dry-run', 'Validate data without importing')
      .option('--batch-size <size>', 'Records per batch', '5')
      .option('--max-records <count>', 'Maximum records to process')
      .option('--skip-validation', 'Skip data validation')
      .option('--force', 'Force import without confirmation')
      .option('--output <file>', 'Output report file')
      .option('--format <format>', 'Report format (json, csv, html)', 'json')
      .option('--api-key <key>', 'Laylo API key (overrides env)')
      .option('--rate-limit <delay>', 'Delay between batches (ms)', '1000')
      .action((csvFile, options, command) => {
        // Store parsed data for retrieval
        command.parent._parsedData = new ParsedArguments('import', {
          ...options,
          batchSize: parseInt(options.batchSize) || 5,
          maxRecords: options.maxRecords ? parseInt(options.maxRecords) : null,
          rateLimit: parseInt(options.rateLimit) || 1000
        }, [csvFile], process.argv);
      });
  }

  /**
   * Setup validate command
   * @private
   */
  setupValidateCommand() {
    this.program
      .command('validate')
      .description('Validate CSV data without importing')
      .argument('<csv-file>', 'CSV file to validate')
      .option('--output <file>', 'Output validation report')
      .option('--format <format>', 'Report format (json, csv, text)', 'text')
      .option('--strict', 'Enable strict validation mode')
      .option('--show-duplicates', 'Include duplicate analysis')
      .option('--max-errors <count>', 'Maximum errors to display', '10')
      .action((csvFile, options, command) => {
        command.parent._parsedData = new ParsedArguments('validate', {
          ...options,
          maxErrors: parseInt(options.maxErrors) || 10
        }, [csvFile], process.argv);
      });
  }

  /**
   * Setup resume command
   * @private
   */
  setupResumeCommand() {
    this.program
      .command('resume')
      .description('Resume an interrupted import session')
      .argument('[session-id]', 'Session ID to resume (optional)')
      .option('--list', 'List available sessions to resume')
      .option('--force', 'Force resume without confirmation')
      .option('--batch-size <size>', 'Override batch size for resume')
      .action((sessionId, options, command) => {
        command.parent._parsedData = new ParsedArguments('resume', {
          ...options,
          batchSize: options.batchSize ? parseInt(options.batchSize) : null
        }, sessionId ? [sessionId] : [], process.argv);
      });
  }

  /**
   * Setup status command
   * @private
   */
  setupStatusCommand() {
    this.program
      .command('status')
      .description('Show import session status')
      .argument('[session-id]', 'Session ID to check (optional)')
      .option('--watch', 'Watch for real-time updates')
      .option('--export <file>', 'Export status to file')
      .option('--format <format>', 'Export format (json, csv)', 'json')
      .action((sessionId, options, command) => {
        command.parent._parsedData = new ParsedArguments('status', options, 
          sessionId ? [sessionId] : [], process.argv);
      });
  }

  /**
   * Parse command line arguments
   * @param {Array<string>} argv - Command line arguments
   * @returns {ParsedArguments} Parsed arguments
   */
  parse(argv = process.argv) {
    try {
      // Reset parsed data
      this.program._parsedData = null;
      
      // Parse arguments
      this.program.parse(argv);
      
      // Return parsed data or default help command
      if (this.program._parsedData) {
        return this.program._parsedData;
      } else {
        // No command specified, show help
        return new ParsedArguments('help', {}, [], argv);
      }
    } catch (error) {
      throw new Error(`Argument parsing failed: ${error.message}`);
    }
  }

  /**
   * Get help for specific command
   * @param {string} commandName - Command name
   * @returns {string} Help text
   */
  getCommandHelp(commandName) {
    const command = this.program.commands.find(cmd => cmd.name() === commandName);
    if (command) {
      return command.helpInformation();
    }
    return this.program.helpInformation();
  }

  /**
   * Get all available commands
   * @returns {Array<Object>} Command information
   */
  getCommands() {
    return this.program.commands.map(cmd => ({
      name: cmd.name(),
      description: cmd.description(),
      usage: cmd.usage(),
      options: cmd.options.map(opt => ({
        flags: opt.flags,
        description: opt.description,
        defaultValue: opt.defaultValue
      }))
    }));
  }

  /**
   * Validate global options
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validateGlobalOptions(args) {
    const errors = [];
    
    // Validate log level
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    const logLevel = args.getOption('logLevel');
    if (logLevel && !validLogLevels.includes(logLevel)) {
      errors.push(`Invalid log level: ${logLevel}. Valid levels: ${validLogLevels.join(', ')}`);
    }

    // Validate config file if specified
    const configFile = args.getOption('config');
    if (configFile && !fs.existsSync(configFile)) {
      errors.push(`Configuration file not found: ${configFile}`);
    }

    // Check conflicting options
    if (args.hasOption('verbose') && args.hasOption('quiet')) {
      errors.push('Cannot use both --verbose and --quiet options');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Get package information
   * @returns {Object} Package info
   * @private
   */
  getPackageInfo() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      }
    } catch (error) {
      // Ignore errors, return default
    }
    return { version: '1.0.0' };
  }

  /**
   * Generate usage examples
   * @returns {string} Usage examples
   */
  getUsageExamples() {
    return `
Examples:
  Import CSV file:
    laylo-import import data.csv

  Dry run validation:
    laylo-import import data.csv --dry-run

  Import with custom batch size:
    laylo-import import data.csv --batch-size 10

  Validate data only:
    laylo-import validate data.csv --format json

  Resume interrupted import:
    laylo-import resume

  Check import status:
    laylo-import status session_123

  List available sessions:
    laylo-import resume --list
`;
  }
}

module.exports = {
  ArgumentParser,
  ParsedArguments
}; 