/**
 * Progress Display
 * Console progress display with animated progress bars and real-time statistics
 * Following Phase 4 Architecture Guidelines - Observer Pattern Implementation
 */

const { ProgressEventType } = require('./ProgressTracker');

/**
 * ANSI color codes for console output
 */
const Colors = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  
  // Foreground colors
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  
  // Background colors
  BG_BLACK: '\x1b[40m',
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
  BG_MAGENTA: '\x1b[45m',
  BG_CYAN: '\x1b[46m',
  BG_WHITE: '\x1b[47m'
};

/**
 * Progress bar component
 */
class ProgressBar {
  constructor(width = 40) {
    this.width = width;
    this.fillChar = '█';
    this.emptyChar = '░';
  }

  /**
   * Generate progress bar string
   * @param {number} percentage - Completion percentage (0-100)
   * @param {string} color - Color for filled portion
   * @returns {string} Progress bar string
   */
  generate(percentage, color = Colors.GREEN) {
    const filled = Math.round((percentage / 100) * this.width);
    const empty = this.width - filled;
    
    const filledBar = color + this.fillChar.repeat(filled) + Colors.RESET;
    const emptyBar = Colors.DIM + this.emptyChar.repeat(empty) + Colors.RESET;
    
    return `[${filledBar}${emptyBar}]`;
  }

  /**
   * Generate mini progress bar
   * @param {number} percentage - Completion percentage
   * @returns {string} Mini progress bar
   */
  generateMini(percentage) {
    const miniWidth = 10;
    const filled = Math.round((percentage / 100) * miniWidth);
    const empty = miniWidth - filled;
    
    return `[${Colors.CYAN}${'▓'.repeat(filled)}${Colors.DIM}${'░'.repeat(empty)}${Colors.RESET}]`;
  }
}

/**
 * Statistics formatter
 */
class StatisticsFormatter {
  /**
   * Format duration in human-readable format
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds)}ms`;
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format rate (records per second)
   * @param {number} rate - Rate value
   * @returns {string} Formatted rate
   */
  static formatRate(rate) {
    if (rate < 1) {
      return `${(rate * 60).toFixed(1)}/min`;
    } else if (rate < 100) {
      return `${rate.toFixed(1)}/sec`;
    } else {
      return `${Math.round(rate)}/sec`;
    }
  }

  /**
   * Format memory usage
   * @param {number} megabytes - Memory in MB
   * @returns {string} Formatted memory
   */
  static formatMemory(megabytes) {
    if (megabytes < 1024) {
      return `${megabytes.toFixed(1)}MB`;
    } else {
      return `${(megabytes / 1024).toFixed(2)}GB`;
    }
  }

  /**
   * Format percentage
   * @param {number} percentage - Percentage value
   * @returns {string} Formatted percentage
   */
  static formatPercentage(percentage) {
    if (percentage >= 99.9) {
      return '100%';
    } else if (percentage < 0.1) {
      return '0.0%';
    } else {
      return `${percentage.toFixed(1)}%`;
    }
  }
}

/**
 * Console progress display observer
 */
class ProgressDisplay {
  constructor(options = {}) {
    this.options = {
      width: options.width || 80,
      showDetailedStats: options.showDetailedStats !== false,
      showErrors: options.showErrors !== false,
      showWarnings: options.showWarnings !== false,
      updateFrequency: options.updateFrequency || 500,
      colorized: options.colorized !== false,
      compact: options.compact || false,
      ...options
    };

    this.progressBar = new ProgressBar(40);
    this.lastUpdate = 0;
    this.currentLine = 0;
    this.isActive = false;
    this.lastProgress = null;
    
    // Animation state
    this.spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.spinnerIndex = 0;
    
    // Performance tracking
    this.displayStats = {
      updates: 0,
      errors: 0,
      lastErrorTime: null
    };
  }

  /**
   * Observer method - called on progress updates
   * @param {Object} progressData - Progress data from tracker
   */
  onProgressUpdate(progressData) {
    // Throttle updates to prevent flickering
    const now = Date.now();
    if (now - this.lastUpdate < this.updateFrequency) {
      return;
    }
    this.lastUpdate = now;

    this.displayStats.updates++;
    this.lastProgress = progressData;

    try {
      this.updateDisplay(progressData);
    } catch (error) {
      this.displayStats.errors++;
      this.displayStats.lastErrorTime = now;
      console.error('Display update error:', error.message);
    }
  }

  /**
   * Handle phase change events
   * @param {Object} progressData - Progress data
   */
  onPhaseChange(progressData) {
    if (this.options.showPhaseChanges !== false) {
      this.displayPhaseChange(progressData);
    }
  }

  /**
   * Handle error events
   * @param {Object} progressData - Progress data
   */
  onErrorOccurred(progressData) {
    if (this.options.showErrors) {
      this.displayError(progressData);
    }
  }

  /**
   * Handle warning events
   * @param {Object} progressData - Progress data
   */
  onWarningOccurred(progressData) {
    if (this.options.showWarnings) {
      this.displayWarning(progressData);
    }
  }

  /**
   * Handle milestone events
   * @param {Object} progressData - Progress data
   */
  onMilestoneReached(progressData) {
    if (this.options.showMilestones !== false) {
      this.displayMilestone(progressData);
    }
  }

  /**
   * Handle session complete events
   * @param {Object} progressData - Progress data
   */
  onSessionComplete(progressData) {
    this.displaySessionComplete(progressData);
    this.isActive = false;
  }

  /**
   * Start displaying progress
   */
  start() {
    this.isActive = true;
    this.clearDisplay();
    
    if (!this.options.compact) {
      this.displayHeader();
    }
  }

  /**
   * Stop displaying progress
   */
  stop() {
    this.isActive = false;
    this.clearLine();
  }

  /**
   * Update the main progress display
   * @param {Object} progressData - Progress data from tracker
   * @private
   */
  updateDisplay(progressData) {
    if (!this.isActive) return;

    const { state } = progressData;
    
    if (this.options.compact) {
      this.displayCompact(state);
    } else {
      this.displayDetailed(state);
    }
  }

  /**
   * Display compact progress (single line)
   * @param {Object} state - Progress state
   * @private
   */
  displayCompact(state) {
    const spinner = this.getSpinner();
    const progressBar = this.progressBar.generate(state.completion);
    const percentage = StatisticsFormatter.formatPercentage(state.completion);
    const rate = StatisticsFormatter.formatRate(state.throughput);
    const eta = state.eta > 0 ? StatisticsFormatter.formatDuration(state.eta * 1000) : 'Unknown';
    
    const statusColor = this.getStatusColor(state.status);
    const phaseColor = this.getPhaseColor(state.phase);
    
    const line = [
      `${spinner}`,
      `${phaseColor}${state.phase}${Colors.RESET}`,
      `${progressBar} ${percentage}`,
      `${state.processed}/${state.total}`,
      `${statusColor}${rate}${Colors.RESET}`,
      `ETA: ${eta}`
    ].join(' │ ');

    this.clearLine();
    process.stdout.write(line);
  }

  /**
   * Display detailed progress (multi-line)
   * @param {Object} state - Progress state
   * @private
   */
  displayDetailed(state) {
    this.clearDisplay();

    // Header with session info
    this.writeLine(`${Colors.BOLD}${Colors.CYAN}Progress: ${state.sessionId}${Colors.RESET}`);
    this.writeLine('─'.repeat(this.options.width));

    // Phase and status
    const phaseColor = this.getPhaseColor(state.phase);
    const statusColor = this.getStatusColor(state.status);
    this.writeLine(`Phase: ${phaseColor}${state.phase}${Colors.RESET} │ Status: ${statusColor}${state.status}${Colors.RESET}`);

    // Main progress bar
    const progressBar = this.progressBar.generate(state.completion);
    const percentage = StatisticsFormatter.formatPercentage(state.completion);
    this.writeLine(`\n${progressBar} ${percentage}`);

    // Statistics
    this.displayStatistics(state);

    // Current operation info
    if (state.currentBatch > 0) {
      this.writeLine(`\nBatch: ${state.currentBatch}/${state.totalBatches || '?'}`);
    }

    // Error and warning counts
    if (state.errors > 0 || state.warnings > 0) {
      const errorText = state.errors > 0 ? `${Colors.RED}${state.errors} errors${Colors.RESET}` : '';
      const warningText = state.warnings > 0 ? `${Colors.YELLOW}${state.warnings} warnings${Colors.RESET}` : '';
      const separator = (state.errors > 0 && state.warnings > 0) ? ' │ ' : '';
      this.writeLine(`\n${errorText}${separator}${warningText}`);
    }
  }

  /**
   * Display statistics section
   * @param {Object} state - Progress state
   * @private
   */
  displayStatistics(state) {
    if (!this.options.showDetailedStats) return;

    const stats = [
      `Records: ${Colors.GREEN}${state.successful}${Colors.RESET}/${Colors.RED}${state.failed}${Colors.RESET}/${state.total}`,
      `Rate: ${StatisticsFormatter.formatRate(state.throughput)}`,
      `Duration: ${StatisticsFormatter.formatDuration(state.statistics.duration)}`,
      `ETA: ${state.eta > 0 ? StatisticsFormatter.formatDuration(state.eta * 1000) : 'Unknown'}`
    ];

    if (state.statistics.memoryUsage > 0) {
      stats.push(`Memory: ${StatisticsFormatter.formatMemory(state.statistics.memoryUsage)}`);
    }

    this.writeLine(`\n${stats.join(' │ ')}`);
  }

  /**
   * Display phase change notification
   * @param {Object} progressData - Progress data
   * @private
   */
  displayPhaseChange(progressData) {
    const { event } = progressData;
    this.writeLine(`\n${Colors.BLUE}▶ Phase Change:${Colors.RESET} ${event.previousPhase} → ${Colors.BOLD}${event.phase}${Colors.RESET}`);
  }

  /**
   * Display error notification
   * @param {Object} progressData - Progress data
   * @private
   */
  displayError(progressData) {
    const { event } = progressData;
    this.writeLine(`\n${Colors.RED}✖ Error:${Colors.RESET} ${event.error.message}`);
  }

  /**
   * Display warning notification
   * @param {Object} progressData - Progress data
   * @private
   */
  displayWarning(progressData) {
    const { event } = progressData;
    this.writeLine(`\n${Colors.YELLOW}⚠ Warning:${Colors.RESET} ${event.warning}`);
  }

  /**
   * Display milestone notification
   * @param {Object} progressData - Progress data
   * @private
   */
  displayMilestone(progressData) {
    const { event } = progressData;
    this.writeLine(`\n${Colors.GREEN}★ Milestone:${Colors.RESET} ${event.milestone}`);
  }

  /**
   * Display session completion
   * @param {Object} progressData - Progress data
   * @private
   */
  displaySessionComplete(progressData) {
    const { state, event } = progressData;
    
    this.clearDisplay();
    
    if (event.success) {
      this.writeLine(`${Colors.GREEN}${Colors.BOLD}✓ Import Completed Successfully!${Colors.RESET}`);
    } else {
      this.writeLine(`${Colors.RED}${Colors.BOLD}✖ Import Failed${Colors.RESET}`);
    }
    
    this.writeLine('═'.repeat(this.options.width));
    
    // Final statistics
    const duration = StatisticsFormatter.formatDuration(state.statistics.duration);
    const successRate = StatisticsFormatter.formatPercentage(state.statistics.successRate);
    const avgRate = StatisticsFormatter.formatRate(state.throughput);
    
    this.writeLine(`Total Records: ${state.processed} │ Successful: ${Colors.GREEN}${state.successful}${Colors.RESET} │ Failed: ${Colors.RED}${state.failed}${Colors.RESET}`);
    this.writeLine(`Success Rate: ${successRate} │ Average Rate: ${avgRate} │ Duration: ${duration}`);
    
    if (state.statistics.memoryUsage > 0) {
      this.writeLine(`Peak Memory: ${StatisticsFormatter.formatMemory(state.statistics.memoryUsage)}`);
    }
    
    this.writeLine('');
  }

  /**
   * Display header
   * @private
   */
  displayHeader() {
    this.writeLine(`${Colors.BOLD}${Colors.CYAN}Laylo CSV Import Progress${Colors.RESET}`);
    this.writeLine('═'.repeat(this.options.width));
  }

  /**
   * Get spinner character for animation
   * @returns {string} Spinner character
   * @private
   */
  getSpinner() {
    const char = this.spinnerChars[this.spinnerIndex];
    this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerChars.length;
    return `${Colors.CYAN}${char}${Colors.RESET}`;
  }

  /**
   * Get color for status
   * @param {string} status - Status string
   * @returns {string} Color code
   * @private
   */
  getStatusColor(status) {
    if (!this.options.colorized) return '';
    
    switch (status) {
      case 'active': return Colors.GREEN;
      case 'paused': return Colors.YELLOW;
      case 'completed': return Colors.GREEN;
      case 'failed': return Colors.RED;
      default: return Colors.WHITE;
    }
  }

  /**
   * Get color for phase
   * @param {string} phase - Phase string
   * @returns {string} Color code
   * @private
   */
  getPhaseColor(phase) {
    if (!this.options.colorized) return '';
    
    switch (phase) {
      case 'initialization': return Colors.BLUE;
      case 'data_loading': return Colors.CYAN;
      case 'data_validation': return Colors.YELLOW;
      case 'api_import': return Colors.MAGENTA;
      case 'completion': return Colors.GREEN;
      default: return Colors.WHITE;
    }
  }

  /**
   * Write a line to console
   * @param {string} text - Text to write
   * @private
   */
  writeLine(text = '') {
    console.log(text);
    this.currentLine++;
  }

  /**
   * Clear current line
   * @private
   */
  clearLine() {
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[K');
    }
  }

  /**
   * Clear display
   * @private
   */
  clearDisplay() {
    if (process.stdout.isTTY && this.currentLine > 0) {
      // Move cursor up and clear lines
      process.stdout.write(`\x1b[${this.currentLine}A`);
      for (let i = 0; i < this.currentLine; i++) {
        process.stdout.write('\x1b[K\x1b[B');
      }
      process.stdout.write(`\x1b[${this.currentLine}A`);
    }
    this.currentLine = 0;
  }

  /**
   * Get display statistics
   * @returns {Object} Display statistics
   */
  getDisplayStats() {
    return {
      ...this.displayStats,
      isActive: this.isActive,
      lastUpdateTime: this.lastUpdate,
      options: this.options
    };
  }
}

module.exports = {
  ProgressDisplay,
  ProgressBar,
  StatisticsFormatter,
  Colors
}; 