/**
 * Resume Command
 * Resume interrupted import sessions
 * Following Command pattern and Phase 4 CLI guidelines
 */

const fs = require('fs');
const path = require('path');
const { BaseCommand, CommandResult, ValidationResult } = require('../CommandRegistry');

/**
 * Resume command implementation
 */
class ResumeCommand extends BaseCommand {
  constructor(config, ui) {
    super('resume', 'Resume an interrupted import session');
    this.config = config;
    this.ui = ui;
  }

  /**
   * Execute resume command
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   */
  async execute(args) {
    try {
      const sessionId = args.getFirstArg();
      const shouldList = args.getOption('list', false);

      if (shouldList) {
        return await this.listResumableSessions(args);
      } else if (sessionId) {
        return await this.resumeSpecificSession(sessionId, args);
      } else {
        return await this.resumeLatestSession(args);
      }

    } catch (error) {
      return CommandResult.failure(`Resume operation failed: ${error.message}`);
    }
  }

  /**
   * List all resumable sessions
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async listResumableSessions(args) {
    try {
      const resumableSessions = await this.getResumableSessions();

      if (resumableSessions.length === 0) {
        this.ui.info('No resumable import sessions found.');
        this.ui.info('💡 Resumable sessions are those that were paused, failed, or interrupted.');
        return CommandResult.success('No resumable sessions to display');
      }

      // Display resumable sessions
      this.ui.displaySummary('Resumable Import Sessions', {
        'Total Resumable': resumableSessions.length,
        'Paused Sessions': resumableSessions.filter(s => s.status === 'paused').length,
        'Failed Sessions': resumableSessions.filter(s => s.status === 'failed').length,
        'Interrupted Sessions': resumableSessions.filter(s => s.status === 'interrupted').length
      });

      // Display sessions table
      this.displayResumableSessionsTable(resumableSessions);

      this.ui.info('\n💡 To resume a specific session, use: laylo-import resume <session-id>');
      this.ui.info('💡 To resume the latest session, use: laylo-import resume');

      return CommandResult.success(`Found ${resumableSessions.length} resumable sessions`);

    } catch (error) {
      return CommandResult.failure(`Failed to list resumable sessions: ${error.message}`);
    }
  }

  /**
   * Resume specific session by ID
   * @param {string} sessionId - Session ID to resume
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async resumeSpecificSession(sessionId, args) {
    try {
      const session = await this.getSessionById(sessionId);

      if (!session) {
        return CommandResult.failure(`Session not found: ${sessionId}`);
      }

      if (!this.isResumable(session)) {
        return CommandResult.failure(`Session ${sessionId} is not resumable (status: ${session.status})`);
      }

      // Show resume details and get confirmation
      const actionDetails = this.getResumeActionDetails(session, args);
      const shouldProceed = await this.ui.confirmAction(
        'Resume Import Session',
        actionDetails,
        { 
          defaultValue: false,
          destructive: true 
        }
      );

      if (!shouldProceed) {
        return CommandResult.success('Resume operation cancelled by user');
      }

      // Execute resume
      const result = await this.performResume(session, args);
      return result;

    } catch (error) {
      return CommandResult.failure(`Failed to resume session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Resume the latest resumable session
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Command result
   * @private
   */
  async resumeLatestSession(args) {
    try {
      const resumableSessions = await this.getResumableSessions();

      if (resumableSessions.length === 0) {
        this.ui.info('No resumable import sessions found.');
        this.ui.info('💡 Use "laylo-import resume --list" to see all sessions');
        return CommandResult.success('No sessions available to resume');
      }

      // Get the most recent session
      const latestSession = resumableSessions[0];

      this.ui.info(`🔄 Found latest resumable session: ${latestSession.id.substring(0, 8)}`);

      // Show session details
      this.displaySessionSummary(latestSession);

      // Show resume details and get confirmation
      const actionDetails = this.getResumeActionDetails(latestSession, args);
      const shouldProceed = await this.ui.confirmAction(
        'Resume Latest Import Session',
        actionDetails,
        { 
          defaultValue: false,
          destructive: true 
        }
      );

      if (!shouldProceed) {
        return CommandResult.success('Resume operation cancelled by user');
      }

      // Execute resume
      const result = await this.performResume(latestSession, args);
      return result;

    } catch (error) {
      return CommandResult.failure(`Failed to resume latest session: ${error.message}`);
    }
  }

  /**
   * Perform the actual resume operation
   * @param {Object} session - Session to resume
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Promise<CommandResult>} Resume result
   * @private
   */
  async performResume(session, args) {
    try {
      this.ui.info(`🚀 Resuming import session: ${session.id}`);

      // Import use case for resuming
      const { ImportCsvUseCase } = require('../../../application/useCases/ImportCsvUseCase');
      
      // Create import use case instance
      const importUseCase = new ImportCsvUseCase(this.config, this.ui);

      // Prepare resume options
      const resumeOptions = {
        sessionId: session.id,
        resumeMode: true,
        filePath: session.csvFile,
        batchSize: args.getOption('batchSize') || session.options?.batchSize || this.config.batchSize || 5,
        rateLimit: args.getOption('rateLimit') || session.options?.rateLimit || this.config.rateLimit || 1000,
        apiKey: args.getOption('apiKey') || this.config.layloApiKey,
        force: args.getOption('force', false)
      };

      // Validate API key is available
      if (!resumeOptions.apiKey) {
        return CommandResult.failure('Laylo API key is required. Set LAYLO_API_KEY environment variable or use --api-key option.');
      }

      // Update session status to running
      await this.updateSessionStatus(session.id, 'running', {
        resumedAt: new Date().toISOString(),
        resumeOptions
      });

      // Execute resume
      const importResult = await importUseCase.resume(resumeOptions);

      // Display results
      this.displayResumeResults(importResult);

      // Determine success/failure
      if (importResult.success) {
        return CommandResult.success(
          `✅ Resume completed successfully. ${importResult.summary.successCount} total records imported.`,
          importResult
        );
      } else {
        return CommandResult.failure(
          `❌ Resume completed with errors. ${importResult.summary.successCount} successful, ${importResult.summary.errorCount} failed.`,
          importResult
        );
      }

    } catch (error) {
      // Mark session as failed
      if (session && session.id) {
        await this.updateSessionStatus(session.id, 'failed', {
          resumeError: error.message,
          failedAt: new Date().toISOString()
        });
      }
      
      return CommandResult.failure(`Resume execution failed: ${error.message}`);
    }
  }

  /**
   * Get all resumable sessions
   * @returns {Promise<Array>} List of resumable sessions
   * @private
   */
  async getResumableSessions() {
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
          
          // Only include resumable sessions
          if (this.isResumable(sessionData)) {
            sessions.push(sessionData);
          }
        } catch (error) {
          // Skip invalid session files
          console.warn(`Warning: Could not load session file ${file}`);
        }
      }

      return sessions;
    } catch (error) {
      throw new Error(`Failed to load resumable sessions: ${error.message}`);
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
   * Check if session is resumable
   * @param {Object} session - Session data
   * @returns {boolean} True if resumable
   * @private
   */
  isResumable(session) {
    const resumableStatuses = ['paused', 'failed', 'interrupted'];
    return resumableStatuses.includes(session.status) && 
           session.summary && 
           session.summary.processed < session.summary.total;
  }

  /**
   * Display resumable sessions table
   * @param {Array} sessions - List of sessions
   * @private
   */
  displayResumableSessionsTable(sessions) {
    const tableData = sessions.map(session => ({
      'Session ID': session.id.substring(0, 8),
      'Status': this.formatStatus(session.status),
      'CSV File': path.basename(session.csvFile || 'Unknown'),
      'Progress': session.summary ? 
        `${session.summary.processed}/${session.summary.total} (${Math.round((session.summary.processed / session.summary.total) * 100)}%)` : 
        'N/A',
      'Remaining': session.summary ? (session.summary.total - session.summary.processed) : 'N/A',
      'Last Activity': new Date(session.lastActivity || session.startTime).toLocaleString()
    }));

    this.ui.displayTable(tableData);
  }

  /**
   * Display session summary
   * @param {Object} session - Session data
   * @private
   */
  displaySessionSummary(session) {
    this.ui.displaySummary('Session Summary', {
      'Session ID': session.id,
      'Status': this.formatStatus(session.status),
      'CSV File': session.csvFile || 'Unknown',
      'Total Records': session.summary?.total || 0,
      'Processed': session.summary?.processed || 0,
      'Remaining': session.summary ? (session.summary.total - session.summary.processed) : 0,
      'Success Rate': session.summary && session.summary.processed > 0 ? 
        `${Math.round((session.summary.successful || 0) / session.summary.processed * 100)}%` : 'N/A',
      'Started': new Date(session.startTime).toLocaleString(),
      'Last Activity': new Date(session.lastActivity || session.startTime).toLocaleString()
    });
  }

  /**
   * Display resume results
   * @param {Object} importResult - Import result data
   * @private
   */
  displayResumeResults(importResult) {
    const { summary, errors } = importResult;

    // Display summary
    this.ui.displaySummary('Resume Results', {
      'Total Records': summary.totalRecords || 0,
      'Previously Processed': summary.previouslyProcessed || 0,
      'Newly Processed': summary.newlyProcessed || 0,
      'Total Successful': summary.successCount || 0,
      'Total Failed': summary.errorCount || 0,
      'Overall Success Rate': summary.totalRecords > 0 ? 
        `${Math.round((summary.successCount || 0) / summary.totalRecords * 100)}%` : 'N/A',
      'Resume Duration': summary.resumeDuration || 'N/A',
      'Total Duration': summary.totalDuration || 'N/A'
    });

    // Display errors if any
    if (errors && errors.length > 0) {
      console.log('\n❌ Errors During Resume:');
      errors.slice(0, 10).forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.message}`);
      });
      if (errors.length > 10) {
        console.log(`     ... and ${errors.length - 10} more errors`);
      }
    }

    // Show recommendations
    this.showResumeRecommendations(importResult);
  }

  /**
   * Show resume recommendations
   * @param {Object} importResult - Import result
   * @private
   */
  showResumeRecommendations(importResult) {
    const { summary } = importResult;
    const recommendations = [];

    if (summary.errorCount > 0) {
      recommendations.push('Review failed imports and consider manual intervention');
    }

    if (summary.successCount > 0) {
      recommendations.push('Verify newly imported subscribers in Laylo dashboard');
    }

    if (summary.newlyProcessed === 0) {
      recommendations.push('No new records were processed - session may have been already completed');
    }

    if (recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  /**
   * Format session status with icons
   * @param {string} status - Session status
   * @returns {string} Formatted status
   * @private
   */
  formatStatus(status) {
    const statusMap = {
      'paused': '⏸️ Paused',
      'failed': '❌ Failed',
      'interrupted': '🔄 Interrupted',
      'running': '🔄 Running',
      'completed': '✅ Completed'
    };
    
    return statusMap[status] || status;
  }

  /**
   * Update session status
   * @param {string} sessionId - Session ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to merge
   * @private
   */
  async updateSessionStatus(sessionId, status, additionalData = {}) {
    try {
      const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
      const sessionFile = path.join(sessionsDir, `${sessionId}.json`);

      if (fs.existsSync(sessionFile)) {
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        
        // Update status and merge additional data
        sessionData.status = status;
        sessionData.lastActivity = new Date().toISOString();
        Object.assign(sessionData, additionalData);

        fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf8');
      }
    } catch (error) {
      console.warn(`Failed to update session status: ${error.message}`);
    }
  }

  /**
   * Get resume action details
   * @param {Object} session - Session to resume
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {Object} Action details
   * @private
   */
  getResumeActionDetails(session, args) {
    const remaining = session.summary ? (session.summary.total - session.summary.processed) : 0;
    const progressPercent = session.summary && session.summary.total > 0 ? 
      Math.round((session.summary.processed / session.summary.total) * 100) : 0;

    const details = {
      'Session ID': session.id,
      'Current Status': this.formatStatus(session.status),
      'CSV File': session.csvFile || 'Unknown',
      'Progress': `${progressPercent}% complete`,
      'Records Remaining': remaining,
      'Batch Size': args.getOption('batchSize') || session.options?.batchSize || this.config.batchSize || 5,
      'Rate Limit': `${args.getOption('rateLimit') || session.options?.rateLimit || this.config.rateLimit || 1000}ms`
    };

    if (session.lastError) {
      details['Last Error'] = session.lastError;
    }

    return details;
  }

  /**
   * Validate command arguments
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {ValidationResult} Validation result
   */
  validate(args) {
    const validation = ValidationResult.valid();
    
    // Validate batch size if provided
    const batchSize = args.getOption('batchSize');
    if (batchSize && (isNaN(batchSize) || batchSize < 1 || batchSize > 50)) {
      validation.addError('batchSize must be between 1 and 50');
    }

    // Validate rate limit if provided
    const rateLimit = args.getOption('rateLimit');
    if (rateLimit && (isNaN(rateLimit) || rateLimit < 100)) {
      validation.addError('rateLimit must be at least 100ms');
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
    const shouldList = args.getOption('list', false);

    if (shouldList) {
      return {
        'Action': 'List resumable sessions',
        'Scope': 'All paused, failed, or interrupted sessions'
      };
    } else if (sessionId) {
      return {
        'Action': 'Resume specific session',
        'Session ID': sessionId
      };
    } else {
      return {
        'Action': 'Resume latest session',
        'Target': 'Most recent resumable session'
      };
    }
  }

  /**
   * Check if this is a destructive action
   * @param {ParsedArguments} args - Parsed arguments
   * @returns {boolean} True if resuming (not listing)
   */
  isDestructiveAction(args) {
    return !args.getOption('list', false); // Only listing is non-destructive
  }
}

module.exports = ResumeCommand; 