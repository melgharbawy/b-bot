/**
 * Command Registry
 * Register and route CLI commands using Command pattern
 * Following Phase 4.3 CLI Architecture Guidelines
 */

/**
 * Command result for standardized responses
 */
class CommandResult {
  constructor(success, message, data = {}) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.duration = 0;
  }

  /**
   * Set execution duration
   * @param {number} startTime - Start time in milliseconds
   */
  setDuration(startTime) {
    this.duration = Date.now() - startTime;
  }

  /**
   * Create success result
   * @param {string} message - Success message
   * @param {Object} data - Result data
   * @returns {CommandResult} Success result
   */
  static success(message, data = {}) {
    return new CommandResult(true, message, data);
  }

  /**
   * Create failure result
   * @param {string} message - Error message
   * @param {Object} data - Error data
   * @returns {CommandResult} Failure result
   */
  static failure(message, data = {}) {
    return new CommandResult(false, message, data);
  }
}

/**
 * Validation result for command validation
 */
class ValidationResult {
  constructor(isValid = true, errors = [], warnings = []) {
    this.isValid = isValid;
    this.errors = errors;
    this.warnings = warnings;
  }

  /**
   * Add error
   * @param {string} error - Error message
   */
  addError(error) {
    this.errors.push(error);
    this.isValid = false;
  }

  /**
   * Add warning
   * @param {string} warning - Warning message
   */
  addWarning(warning) {
    this.warnings.push(warning);
  }

  /**
   * Create valid result
   * @returns {ValidationResult} Valid result
   */
  static valid() {
    return new ValidationResult(true, [], []);
  }

  /**
   * Create invalid result
   * @param {Array<string>} errors - Error messages
   * @param {Array<string>} warnings - Warning messages
   * @returns {ValidationResult} Invalid result
   */
  static invalid(errors, warnings = []) {
    return new ValidationResult(false, errors, warnings);
  }
}

/**
 * Base command interface
 */
class BaseCommand {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * Execute the command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    throw new Error('execute method must be implemented by subclasses');
  }

  /**
   * Validate command arguments
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validate(args) {
    return ValidationResult.valid();
  }

  /**
   * Get command help
   * @returns {string} Help text
   */
  getHelp() {
    return `${this.name}: ${this.description}`;
  }

  /**
   * Get command name
   * @returns {string} Command name
   */
  getName() {
    return this.name;
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  getDescription() {
    return this.description;
  }

  /**
   * Check if action is destructive
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {boolean} True if destructive
   */
  isDestructiveAction(args) {
    return false; // Override in subclasses
  }

  /**
   * Get action details for confirmation
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Object} Action details
   */
  getActionDetails(args) {
    return {
      command: this.name,
      arguments: args.args.join(', '),
      options: Object.keys(args.options).length
    };
  }
}

/**
 * Command registry for managing CLI commands
 */
class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.defaultCommand = null;
  }

  /**
   * Register a command
   * @param {BaseCommand} command - Command to register
   * @param {Array<string>} aliases - Command aliases
   */
  register(command, aliases = []) {
    if (!(command instanceof BaseCommand)) {
      throw new Error('Command must extend BaseCommand');
    }

    const name = command.getName();
    
    if (this.commands.has(name)) {
      throw new Error(`Command '${name}' is already registered`);
    }

    this.commands.set(name, command);

    // Register aliases
    aliases.forEach(alias => {
      if (this.aliases.has(alias) || this.commands.has(alias)) {
        throw new Error(`Alias '${alias}' conflicts with existing command or alias`);
      }
      this.aliases.set(alias, name);
    });
  }

  /**
   * Unregister a command
   * @param {string} name - Command name
   * @returns {boolean} True if command was removed
   */
  unregister(name) {
    if (!this.commands.has(name)) {
      return false;
    }

    // Remove command
    this.commands.delete(name);

    // Remove aliases pointing to this command
    for (const [alias, commandName] of this.aliases.entries()) {
      if (commandName === name) {
        this.aliases.delete(alias);
      }
    }

    return true;
  }

  /**
   * Get command by name or alias
   * @param {string} name - Command name or alias
   * @returns {BaseCommand|null} Command instance or null
   */
  getCommand(name) {
    // Check direct command name
    if (this.commands.has(name)) {
      return this.commands.get(name);
    }

    // Check aliases
    if (this.aliases.has(name)) {
      const commandName = this.aliases.get(name);
      return this.commands.get(commandName);
    }

    return null;
  }

  /**
   * Check if command exists
   * @param {string} name - Command name or alias
   * @returns {boolean} True if command exists
   */
  hasCommand(name) {
    return this.commands.has(name) || this.aliases.has(name);
  }

  /**
   * Execute a command
   * @param {string} commandName - Command name
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(commandName, args) {
    const startTime = Date.now();

    try {
      const command = this.getCommand(commandName);
      
      if (!command) {
        const result = CommandResult.failure(`Unknown command: ${commandName}`);
        result.setDuration(startTime);
        return result;
      }

      // Validate arguments
      const validation = command.validate(args);
      if (!validation.isValid) {
        const result = CommandResult.failure(
          `Validation failed: ${validation.errors.join(', ')}`,
          { errors: validation.errors, warnings: validation.warnings }
        );
        result.setDuration(startTime);
        return result;
      }

      // Execute command
      const result = await command.execute(args);
      result.setDuration(startTime);
      
      return result;
    } catch (error) {
      const result = CommandResult.failure(
        `Command execution failed: ${error.message}`,
        { error: error.stack }
      );
      result.setDuration(startTime);
      return result;
    }
  }

  /**
   * Get all registered commands
   * @returns {Array<Object>} Command information
   */
  getCommands() {
    const commands = [];
    
    for (const [name, command] of this.commands.entries()) {
      // Find aliases for this command
      const aliases = [];
      for (const [alias, commandName] of this.aliases.entries()) {
        if (commandName === name) {
          aliases.push(alias);
        }
      }

      commands.push({
        name: command.getName(),
        description: command.getDescription(),
        aliases: aliases,
        help: command.getHelp()
      });
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Set default command (when no command is specified)
   * @param {string} commandName - Default command name
   */
  setDefaultCommand(commandName) {
    if (!this.hasCommand(commandName)) {
      throw new Error(`Cannot set non-existent command '${commandName}' as default`);
    }
    this.defaultCommand = commandName;
  }

  /**
   * Get default command
   * @returns {string|null} Default command name or null
   */
  getDefaultCommand() {
    return this.defaultCommand;
  }

  /**
   * Generate help text for all commands
   * @returns {string} Help text
   */
  generateHelp() {
    const commands = this.getCommands();
    
    const lines = [
      'Available commands:',
      ''
    ];

    // Find max command name length for alignment
    const maxNameLength = Math.max(...commands.map(cmd => cmd.name.length));

    commands.forEach(command => {
      const nameWithAliases = command.aliases.length > 0 ? 
        `${command.name} (${command.aliases.join(', ')})` : 
        command.name;
      
      const padding = ' '.repeat(Math.max(0, maxNameLength - command.name.length + 2));
      lines.push(`  ${command.name}${padding}${command.description}`);
      
      if (command.aliases.length > 0) {
        lines.push(`    ${' '.repeat(maxNameLength)}Aliases: ${command.aliases.join(', ')}`);
      }
    });

    lines.push('');
    lines.push('Use "laylo-import <command> --help" for more information about a command.');

    return lines.join('\n');
  }

  /**
   * Validate a command exists and can be executed
   * @param {string} commandName - Command name
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validateCommand(commandName, args) {
    const command = this.getCommand(commandName);
    
    if (!command) {
      return ValidationResult.invalid([`Unknown command: ${commandName}`]);
    }

    return command.validate(args);
  }

  /**
   * Get command suggestions for unknown commands
   * @param {string} unknownCommand - Unknown command name
   * @returns {Array<string>} Suggested commands
   */
  getSuggestions(unknownCommand) {
    const allNames = [
      ...this.commands.keys(),
      ...this.aliases.keys()
    ];

    // Simple string distance calculation for suggestions
    return allNames
      .map(name => ({
        name,
        distance: this.calculateLevenshteinDistance(unknownCommand, name)
      }))
      .filter(item => item.distance <= 3) // Only suggest close matches
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3) // Top 3 suggestions
      .map(item => item.name);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Distance
   * @private
   */
  calculateLevenshteinDistance(a, b) {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Clear all registered commands
   */
  clear() {
    this.commands.clear();
    this.aliases.clear();
    this.defaultCommand = null;
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStats() {
    return {
      commandCount: this.commands.size,
      aliasCount: this.aliases.size,
      defaultCommand: this.defaultCommand,
      commands: Array.from(this.commands.keys()),
      aliases: Array.from(this.aliases.keys())
    };
  }
}

module.exports = {
  CommandRegistry,
  BaseCommand,
  CommandResult,
  ValidationResult
}; 