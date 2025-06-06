/**
 * Help Command
 * Display help information and command usage
 * Following Command pattern and Phase 4 CLI guidelines
 */

const { BaseCommand, CommandResult } = require('../CommandRegistry');

/**
 * Help command implementation
 */
class HelpCommand extends BaseCommand {
  constructor(config, ui, commandRegistry) {
    super('help', 'Display help information and command usage');
    this.config = config;
    this.ui = ui;
    this.commandRegistry = commandRegistry;
  }

  /**
   * Execute help command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    try {
      const specificCommand = args.getFirstArg();

      if (specificCommand) {
        // Show help for specific command
        return this.showCommandHelp(specificCommand);
      } else {
        // Show general help
        return this.showGeneralHelp();
      }
    } catch (error) {
      return CommandResult.failure(`Help display failed: ${error.message}`);
    }
  }

  /**
   * Show general help information
   * @returns {CommandResult} Success result
   * @private
   */
  showGeneralHelp() {
    // Display banner
    this.ui.displayBanner(require('../../../../package.json').version);

    // Display description
    this.ui.info('\n🚀 Automated CSV import tool for Laylo subscriber management via GraphQL API\n');

    // Display usage
    console.log('Usage:');
    console.log('  laylo-import [command] [options] [arguments]\n');

    // Display available commands
    const commands = this.commandRegistry.getCommands();
    if (commands.length > 0) {
      console.log('Available Commands:');
      
      // Calculate max width for alignment
      const maxNameLength = Math.max(...commands.map(cmd => cmd.name.length));
      
      commands.forEach(command => {
        const padding = ' '.repeat(maxNameLength - command.name.length + 2);
        const aliases = command.aliases.length > 0 ? 
          ` (aliases: ${command.aliases.join(', ')})` : '';
        
        console.log(`  ${command.name}${padding}${command.description}${aliases}`);
      });
      console.log('');
    }

    // Display global options
    console.log('Global Options:');
    console.log('  -h, --help           Display help information');
    console.log('  -v, --verbose        Enable verbose output');
    console.log('  -q, --quiet          Suppress non-essential output');
    console.log('  --version            Show version information');
    console.log('  --config <file>      Configuration file path');
    console.log('  --log-level <level>  Set log level (error, warn, info, debug)');
    console.log('  --no-color           Disable colored output\n');

    // Display examples
    console.log('Examples:');
    console.log('  # Import CSV file');
    console.log('  laylo-import import data.csv\n');
    console.log('  # Validate data without importing');
    console.log('  laylo-import import data.csv --dry-run\n');
    console.log('  # Resume interrupted import');
    console.log('  laylo-import resume\n');
    console.log('  # Check import status');
    console.log('  laylo-import status\n');
    console.log('  # Get help for specific command');
    console.log('  laylo-import help import\n');

    // Display additional information
    console.log('Documentation:');
    console.log('  📚 README.md - Complete setup and usage guide');
    console.log('  🏗️  ARCHITECTURE_GUIDELINES.md - Technical implementation details');
    console.log('  📋 LAYLO_IMPORT_PROJECT_PLAN.md - Project roadmap and progress\n');

    console.log('Legal Compliance:');
    console.log('  📄 Laylo Terms and Conditions: https://laylo.com/terms');
    console.log('  🔒 Laylo Privacy Policy: https://laylo.com/privacy\n');

    return CommandResult.success('Help information displayed successfully');
  }

  /**
   * Show help for specific command
   * @param {string} commandName - Command name
   * @returns {CommandResult} Command result
   * @private
   */
  showCommandHelp(commandName) {
    const command = this.commandRegistry.getCommand(commandName);
    
    if (!command) {
      const suggestions = this.commandRegistry.getSuggestions(commandName);
      let message = `Unknown command: ${commandName}`;
      
      if (suggestions.length > 0) {
        message += `\nDid you mean: ${suggestions.join(', ')}?`;
      }
      
      return CommandResult.failure(message);
    }

    // Display command-specific help
    console.log(`\nHelp for command: ${command.getName()}\n`);
    console.log(`Description: ${command.getDescription()}\n`);
    
    // Get detailed help from argument parser if available
    const detailedHelp = this.getDetailedCommandHelp(commandName);
    if (detailedHelp) {
      console.log(detailedHelp);
    } else {
      console.log(command.getHelp());
    }

    return CommandResult.success(`Help for ${commandName} displayed successfully`);
  }

  /**
   * Get detailed help from argument parser
   * @param {string} commandName - Command name
   * @returns {string|null} Detailed help or null
   * @private
   */
  getDetailedCommandHelp(commandName) {
    try {
      // This would use the ArgumentParser to get detailed help
      // Implementation depends on ArgumentParser capabilities
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate help command arguments
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validate(args) {
    // Help command is always valid
    return super.validate(args);
  }

  /**
   * Get action details for confirmation
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Object} Action details
   */
  getActionDetails(args) {
    const specificCommand = args.getFirstArg();
    return {
      command: 'help',
      target: specificCommand || 'general help',
      action: 'Display help information'
    };
  }
}

module.exports = HelpCommand; 