/**
 * Status Command
 * Check import session status and progress
 * Following Command pattern and Phase 4 CLI guidelines
 */

const fs = require('fs');
const path = require('path');
const { BaseCommand, CommandResult, ValidationResult } = require('../CommandRegistry');

/**
 * Status command implementation
 */
class StatusCommand extends BaseCommand {
  constructor(config, ui) {
    super('status', 'Show import session status and progress');
    this.config = config;
    this.ui = ui;
  }

  /**
   * Execute status command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    try {
      const sessionId = args.getFirstArg();
      const shouldWatch = args.getOption('watch', false);
      const exportFile = args.getOption('export');

      if (sessionId) {
        return await this.showSessionStatus(sessionId, args);
      } else if (shouldWatch) {
        return await this.watchAllSessions(args);
      } else {
        return await this.showAllSessions(args);
      }

    } catch (error) {
      return CommandResult.failure(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Show status for all sessions
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async showAllSessions(args) {
    try {
      const sessions = await this.getAllSessions();

      if (sessions.length === 0) {
        this.ui.info('No import sessions found.');
        return CommandResult.success('No sessions to display');
      }

      // Display sessions overview
      this.ui.displaySummary('Import Sessions Overview', {
        'Total Sessions': sessions.length,
        'Active Sessions': sessions.filter(s => s.status === 'running').length,
        'Completed Sessions': sessions.filter(s => s.status === 'completed').length,
        'Failed Sessions': sessions.filter(s => s.status === 'failed').length,
        'Latest Session': sessions[0] ? sessions[0].id : 'None'
      });

      // Display sessions table
      this.displaySessionsTable(sessions);

      // Export if requested
      if (args.getOption('export')) {
        await this.exportSessionData(sessions, args);
      }

      return CommandResult.success(`Found ${sessions.length} import sessions`);

    } catch (error) {
      return CommandResult.failure(`Failed to retrieve sessions: ${error.message}`);
    }
  }

  /**
   * Show status for specific session
   * @param {string} sessionId - Session ID
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async showSessionStatus(sessionId, args) {
    try {
      const session = await this.getSessionById(sessionId);

      if (!session) {
        return CommandResult.failure(`Session not found: ${sessionId}`);
      }

      // Display detailed session information
      this.displayDetailedSession(session);

      // Show progress if running
      if (session.status === 'running') {
        this.displayProgressDetails(session);
      }

      // Show results if completed
      if (session.status === 'completed' || session.status === 'failed') {
        this.displaySessionResults(session);
      }

      // Export if requested
      if (args.getOption('export')) {
        await this.exportSessionData([session], args);
      }

      return CommandResult.success(`Session ${sessionId} status displayed`);

    } catch (error) {
      return CommandResult.failure(`Failed to retrieve session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Watch all sessions for real-time updates
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async watchAllSessions(args) {
    try {
      this.ui.info('🔄 Watching for session updates (Press Ctrl+C to stop)...\n');

      let previousSessions = [];
      const watchInterval = 2000; // 2 seconds

      const updateDisplay = async () => {
        try {
          const currentSessions = await this.getAllSessions();
          
          // Check for changes
          if (this.sessionsChanged(previousSessions, currentSessions)) {
            // Clear screen and redisplay
            this.ui.clear();
            this.ui.info(`🔄 Session Status (Updated: ${new Date().toLocaleTimeString()})\n`);
            
            if (currentSessions.length === 0) {
              this.ui.info('No import sessions found.');
            } else {
              this.displaySessionsTable(currentSessions);
              
              // Show active session details
              const activeSessions = currentSessions.filter(s => s.status === 'running');
              if (activeSessions.length > 0) {
                console.log('\n📊 Active Session Details:');
                activeSessions.forEach(session => {
                  this.displayProgressSummary(session);
                });
              }
            }
            
            previousSessions = currentSessions;
          }
        } catch (error) {
          this.ui.error(`Watch update failed: ${error.message}`);
        }
      };

      // Initial display
      await updateDisplay();

      // Setup interval
      const interval = setInterval(updateDisplay, watchInterval);

      // Setup cleanup on interrupt
      this.ui.handleInterrupt(() => {
        clearInterval(interval);
      });

      return CommandResult.success('Session watching started');

    } catch (error) {
      return CommandResult.failure(`Failed to start watching: ${error.message}`);
    }
  }

  /**
   * Get all sessions from session storage
   * @returns {Promise<Array>} List of sessions
   * @private
   */
  async getAllSessions() {
    try {
      const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
      
      if (!fs.existsSync(sessionsDir)) {
        return [];
      }

      const sessionFiles = fs.readdirSync(sessionsDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => {
          const aTime = fs.statSync(path.join(sessionsDir, a)).mtime;
          const bTime = fs.statSync(path.join(sessionsDir, b)).mtime;
          return bTime - aTime; // Most recent first
        });

      const sessions = [];
      for (const file of sessionFiles) {
        try {
          const sessionPath = path.join(sessionsDir, file);
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
          sessions.push(sessionData);
        } catch (error) {
          // Skip invalid session files
          console.warn(`Warning: Could not load session file ${file}`);
        }
      }

      return sessions;
    } catch (error) {
      throw new Error(`Failed to load sessions: ${error.message}`);
    }
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session data or null
   * @private
   */
  async getSessionById(sessionId) {
    try {
      const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
      const sessionFile = path.join(sessionsDir, `${sessionId}.json`);

      if (!fs.existsSync(sessionFile)) {
        return null;
      }

      return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (error) {
      throw new Error(`Failed to load session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Display sessions in table format
   * @param {Array} sessions - List of sessions
   * @private
   */
  displaySessionsTable(sessions) {
    const tableData = sessions.map(session => ({
      'Session ID': session.id.substring(0, 8),
      'Status': this.formatStatus(session.status),
      'Type': session.type || 'import',
      'Records': session.summary ? `${session.summary.processed || 0}/${session.summary.total || 0}` : 'N/A',
      'Success Rate': session.summary && session.summary.total > 0 ? 
        `${Math.round((session.summary.successful || 0) / session.summary.total * 100)}%` : 'N/A',
      'Started': new Date(session.startTime).toLocaleString(),
      'Duration': this.formatDuration(session)
    }));

    this.ui.displayTable(tableData);
  }

  /**
   * Display detailed session information
   * @param {Object} session - Session data
   * @private
   */
  displayDetailedSession(session) {
    this.ui.displaySummary(`Session Details: ${session.id}`, {
      'Status': this.formatStatus(session.status),
      'Type': session.type || 'import',
      'CSV File': session.csvFile || 'N/A',
      'Started': new Date(session.startTime).toLocaleString(),
      'Duration': this.formatDuration(session),
      'Batch Size': session.options ? session.options.batchSize : 'N/A',
      'Rate Limit': session.options ? `${session.options.rateLimit}ms` : 'N/A'
    });

    if (session.summary) {
      this.ui.displaySummary('Progress Summary', {
        'Total Records': session.summary.total || 0,
        'Processed': session.summary.processed || 0,
        'Successful': session.summary.successful || 0,
        'Failed': session.summary.failed || 0,
        'Remaining': (session.summary.total || 0) - (session.summary.processed || 0),
        'Success Rate': session.summary.total > 0 ? 
          `${Math.round((session.summary.successful || 0) / session.summary.total * 100)}%` : 'N/A'
      });
    }
  }

  /**
   * Display progress details for running session
   * @param {Object} session - Session data
   * @private
   */
  displayProgressDetails(session) {
    if (!session.progress) return;

    const progress = session.progress;
    console.log('\n📊 Current Progress:');
    
    // Progress bar
    const totalWidth = 40;
    const percentage = progress.total > 0 ? (progress.processed / progress.total) : 0;
    const filled = Math.round(totalWidth * percentage);
    const empty = totalWidth - filled;
    
    const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
    console.log(`  [${progressBar}] ${Math.round(percentage * 100)}%`);
    console.log(`  ${progress.processed}/${progress.total} records`);
    
    if (progress.currentBatch) {
      console.log(`  Current batch: ${progress.currentBatch.index}/${progress.currentBatch.total}`);
      console.log(`  Batch progress: ${progress.currentBatch.processed}/${progress.currentBatch.size}`);
    }

    if (progress.eta) {
      console.log(`  Estimated completion: ${new Date(progress.eta).toLocaleTimeString()}`);
    }
  }

  /**
   * Display session results
   * @param {Object} session - Session data
   * @private
   */
  displaySessionResults(session) {
    if (!session.results) return;

    const results = session.results;
    
    // Display errors if any
    if (results.errors && results.errors.length > 0) {
      console.log('\n❌ Recent Errors:');
      results.errors.slice(-5).forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.message}`);
      });
      
      if (results.errors.length > 5) {
        console.log(`     ... and ${results.errors.length - 5} more errors`);
      }
    }

    // Display warnings if any
    if (results.warnings && results.warnings.length > 0) {
      console.log('\n⚠️  Recent Warnings:');
      results.warnings.slice(-3).forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning.message}`);
      });
    }
  }

  /**
   * Display progress summary for active sessions
   * @param {Object} session - Session data
   * @private
   */
  displayProgressSummary(session) {
    const percentage = session.summary && session.summary.total > 0 ? 
      Math.round((session.summary.processed || 0) / session.summary.total * 100) : 0;
    
    console.log(`  ${session.id.substring(0, 8)}: ${percentage}% complete (${session.summary?.processed || 0}/${session.summary?.total || 0})`);
  }

  /**
   * Format session status with colors
   * @param {string} status - Session status
   * @returns {string} Formatted status
   * @private
   */
  formatStatus(status) {
    const statusMap = {
      'running': '🔄 Running',
      'completed': '✅ Completed',
      'failed': '❌ Failed',
      'paused': '⏸️ Paused',
      'cancelled': '🚫 Cancelled'
    };
    
    return statusMap[status] || status;
  }

  /**
   * Format session duration
   * @param {Object} session - Session data
   * @returns {string} Formatted duration
   * @private
   */
  formatDuration(session) {
    const startTime = new Date(session.startTime);
    const endTime = session.endTime ? new Date(session.endTime) : new Date();
    const duration = endTime - startTime;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if sessions have changed
   * @param {Array} previous - Previous sessions
   * @param {Array} current - Current sessions
   * @returns {boolean} True if changed
   * @private
   */
  sessionsChanged(previous, current) {
    if (previous.length !== current.length) return true;
    
    for (let i = 0; i < current.length; i++) {
      const prev = previous[i];
      const curr = current[i];
      
      if (!prev || 
          prev.status !== curr.status || 
          prev.summary?.processed !== curr.summary?.processed) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Export session data
   * @param {Array} sessions - Sessions to export
   * @param {ParsedArguments} args - Parsed arguments
   * @private
   */
  async exportSessionData(sessions, args) {
    try {
      const exportFile = args.getOption('export');
      const format = args.getOption('format', 'json').toLowerCase();
      
      let exportData;
      switch (format) {
        case 'csv':
          exportData = this.convertSessionsToCsv(sessions);
          break;
        case 'json':
        default:
          exportData = JSON.stringify(sessions, null, 2);
          break;
      }

      fs.writeFileSync(exportFile, exportData, 'utf8');
      this.ui.success(`📄 Session data exported to: ${exportFile}`);
    } catch (error) {
      this.ui.warning(`Failed to export session data: ${error.message}`);
    }
  }

  /**
   * Convert sessions to CSV format
   * @param {Array} sessions - Sessions data
   * @returns {string} CSV data
   * @private
   */
  convertSessionsToCsv(sessions) {
    const headers = ['Session ID', 'Status', 'Type', 'CSV File', 'Total Records', 'Processed', 'Successful', 'Failed', 'Success Rate', 'Started', 'Duration'];
    const rows = [headers.join(',')];

    sessions.forEach(session => {
      const row = [
        session.id,
        session.status,
        session.type || 'import',
        `"${(session.csvFile || '').replace(/"/g, '""')}"`,
        session.summary?.total || 0,
        session.summary?.processed || 0,
        session.summary?.successful || 0,
        session.summary?.failed || 0,
        session.summary?.total > 0 ? Math.round((session.summary.successful || 0) / session.summary.total * 100) : 0,
        new Date(session.startTime).toISOString(),
        this.formatDuration(session)
      ];
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  /**
   * Validate command arguments
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validate(args) {
    const validation = ValidationResult.valid();
    
    // Validate format if export is specified
    const exportFile = args.getOption('export');
    const format = args.getOption('format');
    
    if (exportFile && format && !['json', 'csv'].includes(format.toLowerCase())) {
      validation.addError('Export format must be json or csv');
    }

    return validation;
  }

  /**
   * Get action details for confirmation
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Object} Action details
   */
  getActionDetails(args) {
    const sessionId = args.getFirstArg();
    const shouldWatch = args.getOption('watch', false);
    
    const details = {
      'Action': shouldWatch ? 'Watch sessions in real-time' : 'Show session status'
    };

    if (sessionId) {
      details['Target Session'] = sessionId;
    } else {
      details['Scope'] = 'All sessions';
    }

    if (args.getOption('export')) {
      details['Export To'] = args.getOption('export');
      details['Format'] = args.getOption('format', 'json');
    }

    return details;
  }

  /**
   * Check if this is a destructive action
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {boolean} Always false for status
   */
  isDestructiveAction(args) {
    return false; // Status checking is never destructive
  }
}

module.exports = StatusCommand; 