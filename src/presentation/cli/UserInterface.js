/**
 * User Interface
 * Interactive prompts and confirmations using Inquirer.js and Chalk
 * Following Phase 4.3 CLI Architecture Guidelines
 */

const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Action details for user confirmation
 */
class ActionDetails {
  constructor(title, details = {}) {
    this.title = title;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Format details for display
   * @returns {string} Formatted details
   */
  format() {
    const lines = [
      chalk.bold.cyan(`\n📋 ${this.title}`),
      chalk.gray('─'.repeat(50))
    ];

    for (const [key, value] of Object.entries(this.details)) {
      if (value !== null && value !== undefined) {
        const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
        const capitalizedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
        lines.push(`${chalk.yellow(capitalizedKey + ':')} ${chalk.white(value)}`);
      }
    }

    lines.push(chalk.gray('─'.repeat(50)));
    return lines.join('\n');
  }
}

/**
 * User interface for CLI interactions
 */
class UserInterface {
  constructor(options = {}) {
    this.options = {
      colorEnabled: options.colorEnabled !== false,
      confirmationTimeout: options.confirmationTimeout || 30000,
      defaultChoiceTimeout: options.defaultChoiceTimeout || 10000,
      ...options
    };

    // Configure chalk based on options
    if (!this.options.colorEnabled) {
      chalk.level = 0;
    }
  }

  /**
   * Display a message with formatting
   * @param {string} message - Message to display
   * @param {string} type - Message type (info, success, warning, error)
   */
  message(message, type = 'info') {
    const icons = {
      info: '📘',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red
    };

    const color = colors[type] || chalk.white;
    const icon = icons[type] || '📘';

    console.log(`${icon} ${color(message)}`);
  }

  /**
   * Display success message
   * @param {string} message - Success message
   */
  success(message) {
    this.message(message, 'success');
  }

  /**
   * Display warning message
   * @param {string} message - Warning message
   */
  warning(message) {
    this.message(message, 'warning');
  }

  /**
   * Display error message
   * @param {string} message - Error message
   */
  error(message) {
    this.message(message, 'error');
  }

  /**
   * Display info message
   * @param {string} message - Info message
   */
  info(message) {
    this.message(message, 'info');
  }

  /**
   * Confirm an action with user
   * @param {string} action - Action name
   * @param {Object|ActionDetails} details - Action details
   * @param {Object} options - Confirmation options
   * @returns {Promise<boolean>} User confirmation
   */
  async confirmAction(action, details = {}, options = {}) {
    try {
      // Format action details
      const actionDetails = details instanceof ActionDetails ? 
        details : new ActionDetails(action, details);

      // Display action details
      console.log(actionDetails.format());

      // Show warning if this is a destructive action
      if (options.destructive) {
        console.log(chalk.red.bold('\n⚠️  WARNING: This action cannot be undone!\n'));
      }

      // Create confirmation prompt
      const prompt = {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.bold(`Do you want to proceed with "${action}"?`),
        default: options.defaultValue !== undefined ? options.defaultValue : false
      };

      // Add timeout if specified
      if (this.options.confirmationTimeout) {
        setTimeout(() => {
          console.log(chalk.yellow('\n⏰ Confirmation timeout reached. Defaulting to "no".'));
          process.exit(1);
        }, this.options.confirmationTimeout);
      }

      const answer = await inquirer.prompt([prompt]);
      return answer.confirmed;
    } catch (error) {
      // Handle Ctrl+C gracefully
      if (error.isTtyError) {
        console.log(chalk.yellow('\n\n👋 Operation cancelled by user.'));
        process.exit(0);
      }
      throw error;
    }
  }

  /**
   * Select from a list of options
   * @param {string} prompt - Prompt message
   * @param {Array} options - Available options
   * @param {Object} config - Selection configuration
   * @returns {Promise<any>} Selected option
   */
  async selectFromOptions(prompt, options, config = {}) {
    try {
      if (!options || options.length === 0) {
        throw new Error('No options provided for selection');
      }

      // Format options for inquirer
      const choices = options.map((option, index) => {
        if (typeof option === 'string') {
          return { name: option, value: option };
        } else if (option.name && option.value !== undefined) {
          return option;
        } else {
          return { name: `Option ${index + 1}`, value: option };
        }
      });

      const question = {
        type: config.multiple ? 'checkbox' : 'list',
        name: 'selection',
        message: chalk.bold(prompt),
        choices,
        pageSize: config.pageSize || 10
      };

      // Add default if specified
      if (config.defaultValue !== undefined) {
        question.default = config.defaultValue;
      }

      const answer = await inquirer.prompt([question]);
      return answer.selection;
    } catch (error) {
      if (error.isTtyError) {
        console.log(chalk.yellow('\n\n👋 Selection cancelled by user.'));
        process.exit(0);
      }
      throw error;
    }
  }

  /**
   * Get text input from user
   * @param {string} prompt - Prompt message
   * @param {Object} options - Input options
   * @returns {Promise<string>} User input
   */
  async getInput(prompt, options = {}) {
    try {
      const question = {
        type: options.password ? 'password' : 'input',
        name: 'input',
        message: chalk.bold(prompt),
        validate: options.validate || (() => true),
        default: options.defaultValue
      };

      if (options.mask) {
        question.mask = options.mask;
      }

      const answer = await inquirer.prompt([question]);
      return answer.input;
    } catch (error) {
      if (error.isTtyError) {
        console.log(chalk.yellow('\n\n👋 Input cancelled by user.'));
        process.exit(0);
      }
      throw error;
    }
  }

  /**
   * Display a progress indicator (for quick operations)
   * @param {string} message - Progress message
   * @param {Function} operation - Async operation to perform
   * @returns {Promise<any>} Operation result
   */
  async withProgress(message, operation) {
    const spinner = this.createSpinner(message);
    
    try {
      spinner.start();
      const result = await operation();
      spinner.succeed(chalk.green(`${message} ✓`));
      return result;
    } catch (error) {
      spinner.fail(chalk.red(`${message} ✗`));
      throw error;
    }
  }

  /**
   * Create a simple spinner for progress indication
   * @param {string} message - Spinner message
   * @returns {Object} Spinner object
   * @private
   */
  createSpinner(message) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let currentFrame = 0;
    let interval = null;

    return {
      start: () => {
        process.stdout.write(`${chalk.cyan(frames[0])} ${message}`);
        interval = setInterval(() => {
          currentFrame = (currentFrame + 1) % frames.length;
          process.stdout.write(`\r${chalk.cyan(frames[currentFrame])} ${message}`);
        }, 100);
      },
      succeed: (successMessage) => {
        if (interval) clearInterval(interval);
        process.stdout.write(`\r${successMessage}\n`);
      },
      fail: (failMessage) => {
        if (interval) clearInterval(interval);
        process.stdout.write(`\r${failMessage}\n`);
      }
    };
  }

  /**
   * Display a formatted table
   * @param {Array<Object>} data - Table data
   * @param {Object} options - Table options
   */
  displayTable(data, options = {}) {
    if (!data || data.length === 0) {
      console.log(chalk.gray('No data to display.'));
      return;
    }

    const headers = options.headers || Object.keys(data[0]);
    const maxWidths = this.calculateColumnWidths(data, headers);

    // Display header
    const headerRow = headers.map((header, i) => 
      chalk.bold.cyan(header.padEnd(maxWidths[i]))
    ).join(' │ ');
    
    console.log(headerRow);
    console.log(chalk.gray('─'.repeat(headerRow.length - 20))); // Approximate length adjustment for ANSI codes

    // Display rows
    data.forEach(row => {
      const displayRow = headers.map((header, i) => {
        const value = row[header] || '';
        return String(value).padEnd(maxWidths[i]);
      }).join(' │ ');
      
      console.log(displayRow);
    });
  }

  /**
   * Calculate column widths for table display
   * @param {Array<Object>} data - Table data
   * @param {Array<string>} headers - Column headers
   * @returns {Array<number>} Column widths
   * @private
   */
  calculateColumnWidths(data, headers) {
    const widths = headers.map(header => header.length);

    data.forEach(row => {
      headers.forEach((header, i) => {
        const value = row[header] || '';
        widths[i] = Math.max(widths[i], String(value).length);
      });
    });

    return widths;
  }

  /**
   * Display a summary box
   * @param {string} title - Summary title
   * @param {Object} data - Summary data
   * @param {Object} options - Display options
   */
  displaySummary(title, data, options = {}) {
    const width = options.width || 60;
    const border = '═'.repeat(width);
    
    console.log(chalk.cyan(`\n╭${border}╮`));
    console.log(chalk.cyan(`│ ${chalk.bold.white(title.padEnd(width - 1))}│`));
    console.log(chalk.cyan(`├${'─'.repeat(width)}┤`));

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
        const capitalizedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
        const line = `${capitalizedKey}: ${chalk.bold(value)}`;
        const padding = width - line.length + chalk.bold(value).length - String(value).length;
        console.log(chalk.cyan(`│ ${line.padEnd(padding > 0 ? padding : 0)}│`));
      }
    }

    console.log(chalk.cyan(`╰${border}╯\n`));
  }

  /**
   * Handle keyboard interrupts gracefully
   * @param {Function} cleanup - Cleanup function to call
   */
  handleInterrupt(cleanup) {
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n🛑 Interrupt received. Cleaning up...'));
      
      try {
        if (cleanup && typeof cleanup === 'function') {
          await cleanup();
        }
        console.log(chalk.green('✅ Cleanup completed.'));
      } catch (error) {
        console.log(chalk.red(`❌ Cleanup failed: ${error.message}`));
      }
      
      console.log(chalk.blue('👋 Goodbye!'));
      process.exit(0);
    });
  }

  /**
   * Pause for user to read output
   * @param {string} message - Pause message
   * @returns {Promise<void>}
   */
  async pause(message = 'Press Enter to continue...') {
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: chalk.gray(message)
    }]);
  }

  /**
   * Clear console screen
   */
  clear() {
    console.clear();
  }

  /**
   * Display application banner
   * @param {string} version - Application version
   */
  displayBanner(version = '1.0.0') {
    const banner = `
╭─────────────────────────────────────────────────────────╮
│                                                         │
│   ${chalk.bold.cyan('🚀 Laylo CSV Import Tool')}                          │
│   ${chalk.gray(`Version ${version}`)}                                     │
│                                                         │
│   ${chalk.yellow('Streamlined CSV importing for Laylo subscribers')}     │
│                                                         │
╰─────────────────────────────────────────────────────────╯
`;
    console.log(banner);
  }
}

module.exports = {
  UserInterface,
  ActionDetails
}; 