#!/usr/bin/env node

/**
 * Laylo CSV Import Tool - Main Entry Point
 * Following Clean Architecture principles and Phase 4 CLI implementation
 */

const path = require('path');
const { ArgumentParser } = require('./presentation/cli/ArgumentParser');
const { UserInterface } = require('./presentation/cli/UserInterface');
const { CommandRegistry } = require('./presentation/cli/CommandRegistry');
const { config } = require('./config');

// Import command implementations (to be created)
const ImportCommand = require('./presentation/cli/commands/ImportCommand');
const ValidateCommand = require('./presentation/cli/commands/ValidateCommand');
const ResumeCommand = require('./presentation/cli/commands/ResumeCommand');
const StatusCommand = require('./presentation/cli/commands/StatusCommand');
const HelpCommand = require('./presentation/cli/commands/HelpCommand');

/**
 * Application class following Dependency Injection pattern
 */
class LayloImportApplication {
  constructor() {
    this.config = null;
    this.ui = null;
    this.argumentParser = null;
    this.commandRegistry = null;
    this.initialized = false;
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      // Load configuration
      this.config = config;
      
      // Initialize UI
      this.ui = new UserInterface({
        colorEnabled: !this.config.noColor,
        confirmationTimeout: this.config.confirmationTimeout
      });

      // Initialize argument parser
      this.argumentParser = new ArgumentParser();

      // Initialize command registry
      this.commandRegistry = new CommandRegistry();

      // Register commands
      await this.registerCommands();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      this.initialized = true;
    } catch (error) {
      console.error(`❌ Application initialization failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Register all CLI commands
   * @private
   */
  async registerCommands() {
    try {
      // Create command instances with dependency injection
      const importCommand = new ImportCommand(this.config, this.ui);
      const validateCommand = new ValidateCommand(this.config, this.ui);
      const resumeCommand = new ResumeCommand(this.config, this.ui);
      const statusCommand = new StatusCommand(this.config, this.ui);
      const helpCommand = new HelpCommand(this.config, this.ui, this.commandRegistry);

      // Register commands with aliases
      this.commandRegistry.register(importCommand, ['i']);
      this.commandRegistry.register(validateCommand, ['v', 'check']);
      this.commandRegistry.register(resumeCommand, ['r', 'continue']);
      this.commandRegistry.register(statusCommand, ['s', 'info']);
      this.commandRegistry.register(helpCommand, ['h', '?']);

      // Set help as default command
      this.commandRegistry.setDefaultCommand('help');
    } catch (error) {
      throw new Error(`Command registration failed: ${error.message}`);
    }
  }

  /**
   * Run the application
   * @param {Array<string>} argv - Command line arguments
   */
  async run(argv = process.argv) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Parse arguments
      const parsedArgs = this.argumentParser.parse(argv);
      
      // Validate global options
      const globalValidation = this.argumentParser.validateGlobalOptions(parsedArgs);
      if (!globalValidation.isValid) {
        this.ui.error(`Invalid options: ${globalValidation.errors.join(', ')}`);
        return process.exit(1);
      }

      // Handle help command or no command
      let commandName = parsedArgs.command;
      if (commandName === 'help' || !commandName) {
        commandName = this.commandRegistry.getDefaultCommand() || 'help';
      }

      // Execute command
      const result = await this.commandRegistry.execute(commandName, parsedArgs);
      
      // Handle result
      if (result.success) {
        if (result.message) {
          this.ui.success(result.message);
        }
        process.exit(0);
      } else {
        this.ui.error(result.message);
        
        // Show suggestions for unknown commands
        if (result.message.includes('Unknown command')) {
          const suggestions = this.commandRegistry.getSuggestions(commandName);
          if (suggestions.length > 0) {
            this.ui.info(`Did you mean: ${suggestions.join(', ')}?`);
          }
        }
        
        process.exit(1);
      }
    } catch (error) {
      this.ui.error(`Application error: ${error.message}`);
      
      if (this.config && this.config.debug) {
        console.error(error.stack);
      }
      
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  setupGracefulShutdown() {
    const cleanup = async () => {
      if (this.ui) {
        this.ui.info('Shutting down gracefully...');
      }
      // Add any cleanup logic here
    };

    // Handle various termination signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGUSR2', cleanup); // For nodemon
    
    // Handle unhandled errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      cleanup().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      cleanup().then(() => process.exit(1));
    });
  }

  /**
   * Display application banner
   */
  displayBanner() {
    if (this.ui) {
      const packageInfo = require('../package.json');
      this.ui.displayBanner(packageInfo.version);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const app = new LayloImportApplication();
  
  // Display banner for interactive usage
  if (process.argv.length === 2) {
    app.displayBanner();
  }
  
  await app.run();
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = LayloImportApplication; 