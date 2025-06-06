/**
 * CsvRepository Infrastructure
 * Implements Repository pattern for CSV file operations
 * Following Architecture Guidelines - Infrastructure Layer, Repository Pattern
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Transform } = require('stream');

/**
 * CSV reading result
 */
class CsvReadResult {
  constructor() {
    this.totalRows = 0;
    this.validRows = 0;
    this.invalidRows = 0;
    this.errors = [];
    this.headers = [];
    this.startTime = new Date();
    this.endTime = null;
  }

  /**
   * Mark reading as complete
   */
  complete() {
    this.endTime = new Date();
  }

  /**
   * Get processing duration
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Add an error
   * @param {string} message - Error message
   * @param {number} lineNumber - Line number where error occurred
   * @param {Object} data - Raw data that caused error
   */
  addError(message, lineNumber = null, data = null) {
    this.errors.push({
      message,
      lineNumber,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Convert to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      totalRows: this.totalRows,
      validRows: this.validRows,
      invalidRows: this.invalidRows,
      errors: this.errors,
      headers: this.headers,
      duration: this.getDuration(),
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString()
    };
  }
}

/**
 * CSV Repository implementing Repository pattern
 */
class CsvRepository {
  constructor(logger = null) {
    this.logger = logger;
  }

  /**
   * Log a message
   * @param {string} level - Log level
   * @param {string} message - Message
   * @param {Object} meta - Metadata
   */
  log(level, message, meta = {}) {
    if (this.logger) {
      this.logger[level](message, meta);
    }
  }

  /**
   * Check if file exists and is readable
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<boolean>} True if file is accessible
   */
  async isAccessible(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      this.log('error', 'File access check failed', { filePath, error: error.message });
      return false;
    }
  }

  /**
   * Get file statistics
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Object>} File stats
   */
  async getFileStats(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        sizeHuman: this.formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile()
      };
    } catch (error) {
      this.log('error', 'Failed to get file stats', { filePath, error: error.message });
      throw new Error(`Cannot access file: ${error.message}`);
    }
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Validate CSV headers
   * @param {Array<string>} headers - CSV headers
   * @param {Array<string>} requiredHeaders - Required headers
   * @returns {Object} Validation result
   */
  validateHeaders(headers, requiredHeaders = ['email']) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      mapping: {}
    };

    // Normalize headers for comparison
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    
    // Common field mappings
    const fieldMappings = {
      email: ['email', 'email_address', 'emailaddress', 'e-mail'],
      firstName: ['first_name', 'firstname', 'fname', 'given_name'],
      lastName: ['last_name', 'lastname', 'lname', 'family_name', 'surname'],
      phoneNumber: ['phone_number', 'phonenumber', 'phone', 'mobile', 'cell']
    };

    // Check for required fields
    for (const required of requiredHeaders) {
      const possibleFields = fieldMappings[required] || [required.toLowerCase()];
      let found = false;

      for (const possible of possibleFields) {
        const index = normalizedHeaders.indexOf(possible);
        if (index !== -1) {
          result.mapping[required] = headers[index];
          found = true;
          break;
        }
      }

      if (!found) {
        result.isValid = false;
        result.errors.push(`Required header '${required}' not found. Expected one of: ${possibleFields.join(', ')}`);
      }
    }

    // Check for unexpected headers
    const expectedFields = Object.values(fieldMappings).flat();
    for (const header of normalizedHeaders) {
      if (!expectedFields.includes(header)) {
        result.warnings.push(`Unexpected header '${header}' will be ignored`);
      }
    }

    return result;
  }

  /**
   * Read entire CSV file into memory
   * @param {string} filePath - Path to CSV file
   * @param {Object} options - Read options
   * @returns {Promise<Array<Object>>} Array of CSV records
   */
  async readAll(filePath, options = {}) {
    const {
      maxRows = null,
      requiredHeaders = ['email'],
      skipEmptyLines = true,
      encoding = 'utf8'
    } = options;

    this.log('info', 'Starting CSV file read', { filePath, options });

    // Check file accessibility
    if (!(await this.isAccessible(filePath))) {
      throw new Error(`Cannot access file: ${filePath}`);
    }

    const fileStats = await this.getFileStats(filePath);
    this.log('info', 'File stats retrieved', { filePath, stats: fileStats });

    const result = new CsvReadResult();
    const records = [];
    let lineNumber = 0;
    let headerValidated = false;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding })
        .pipe(csv({ skipEmptyLines }))
        .on('headers', (headers) => {
          result.headers = headers;
          
          // Validate headers
          const headerValidation = this.validateHeaders(headers, requiredHeaders);
          if (!headerValidation.isValid) {
            stream.destroy();
            reject(new Error(`Invalid CSV headers: ${headerValidation.errors.join(', ')}`));
            return;
          }

          if (headerValidation.warnings.length > 0) {
            headerValidation.warnings.forEach(warning => {
              this.log('warn', 'Header validation warning', { warning });
            });
          }

          headerValidated = true;
          this.log('info', 'CSV headers validated', { headers, mapping: headerValidation.mapping });
        })
        .on('data', (data) => {
          lineNumber++;
          result.totalRows++;

          try {
            // Check max rows limit
            if (maxRows && result.totalRows > maxRows) {
              this.log('warn', 'Max rows limit reached', { maxRows, currentRow: result.totalRows });
              // Don't count this row since we're over the limit
              result.totalRows--;
              stream.destroy();
              return;
            }

            // Validate row has some data
            const hasData = Object.values(data).some(value => value && value.trim());
            if (!hasData) {
              result.invalidRows++;
              result.addError('Empty row', lineNumber, data);
              return;
            }

            // Add line number and original data for tracking
            const record = {
              ...data,
              _lineNumber: lineNumber,
              _originalData: { ...data }
            };

            records.push(record);
            result.validRows++;

          } catch (error) {
            result.invalidRows++;
            result.addError(error.message, lineNumber, data);
            this.log('error', 'Error processing CSV row', { 
              lineNumber, 
              error: error.message, 
              data: this.sanitizeDataForLogging(data) 
            });
          }
        })
        .on('end', () => {
          result.complete();
          this.log('info', 'CSV file read completed', {
            filePath,
            totalRows: result.totalRows,
            validRows: result.validRows,
            invalidRows: result.invalidRows,
            duration: result.getDuration()
          });
          resolve({ records, result });
        })
        .on('close', () => {
          // Handle case where stream was destroyed due to max rows limit
          if (!result.endTime) {
            result.complete();
            this.log('info', 'CSV file read completed (stream closed)', {
              filePath,
              totalRows: result.totalRows,
              validRows: result.validRows,
              invalidRows: result.invalidRows,
              duration: result.getDuration()
            });
            resolve({ records, result });
          }
        })
        .on('error', (error) => {
          result.addError(error.message);
          this.log('error', 'CSV reading failed', { filePath, error: error.message });
          reject(error);
        });
    });
  }

  /**
   * Create a readable stream for large CSV files
   * @param {string} filePath - Path to CSV file
   * @param {Object} options - Stream options
   * @returns {Transform} Transform stream for processing records
   */
  createReadStream(filePath, options = {}) {
    const {
      requiredHeaders = ['email'],
      skipEmptyLines = true,
      encoding = 'utf8',
      batchSize = 100
    } = options;

    this.log('info', 'Creating CSV read stream', { filePath, options });

    let lineNumber = 0;
    let batchCount = 0;
    let currentBatch = [];
    let headerValidated = false;

    const transformStream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        lineNumber++;

        try {
          // Validate row has some data
          const hasData = Object.values(chunk).some(value => value && value.trim());
          if (!hasData) {
            callback(); // Skip empty rows
            return;
          }

          // Add metadata to record
          const record = {
            ...chunk,
            _lineNumber: lineNumber,
            _originalData: { ...chunk }
          };

          currentBatch.push(record);

          // Emit batch when size reached
          if (currentBatch.length >= batchSize) {
            this.push({
              type: 'batch',
              batchNumber: ++batchCount,
              records: currentBatch,
              lineNumber
            });
            currentBatch = [];
          }

          callback();
        } catch (error) {
          this.emit('error', error);
        }
      },
      flush(callback) {
        // Emit remaining records
        if (currentBatch.length > 0) {
          this.push({
            type: 'batch',
            batchNumber: ++batchCount,
            records: currentBatch,
            lineNumber
          });
        }

        // Emit completion
        this.push({
          type: 'complete',
          totalLines: lineNumber,
          totalBatches: batchCount
        });

        callback();
      }
    });

    // Create file stream with header validation
    const fileStream = fs.createReadStream(filePath, { encoding })
      .pipe(csv({ skipEmptyLines }))
      .on('headers', (headers) => {
        // Validate headers
        const headerValidation = this.validateHeaders(headers, requiredHeaders);
        if (!headerValidation.isValid) {
          transformStream.emit('error', new Error(`Invalid CSV headers: ${headerValidation.errors.join(', ')}`));
          return;
        }

        headerValidated = true;
        transformStream.emit('headers', { headers, validation: headerValidation });
      })
      .pipe(transformStream);

    return transformStream;
  }

  /**
   * Write records to CSV file
   * @param {string} filePath - Output file path
   * @param {Array<Object>} records - Records to write
   * @param {Object} options - Write options
   * @returns {Promise<Object>} Write result
   */
  async writeRecords(filePath, records, options = {}) {
    const {
      headers = null,
      append = false,
      encoding = 'utf8'
    } = options;

    this.log('info', 'Writing records to CSV', { filePath, recordCount: records.length, options });

    if (!records || records.length === 0) {
      throw new Error('No records to write');
    }

    // Determine headers
    const csvHeaders = headers || Object.keys(records[0]);
    
    // Prepare CSV content
    let csvContent = '';
    
    if (!append) {
      csvContent += csvHeaders.join(',') + '\n';
    }

    // Convert records to CSV rows
    for (const record of records) {
      const row = csvHeaders.map(header => {
        const value = record[header] || '';
        // Escape values containing commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Write file
    const writeOptions = append ? { flag: 'a', encoding } : { encoding };
    await fs.promises.writeFile(filePath, csvContent, writeOptions);

    this.log('info', 'CSV file written successfully', { 
      filePath, 
      recordCount: records.length,
      headers: csvHeaders.length,
      fileSize: Buffer.byteLength(csvContent, encoding)
    });

    return {
      filePath,
      recordCount: records.length,
      headers: csvHeaders,
      fileSize: Buffer.byteLength(csvContent, encoding),
      sizeHuman: this.formatFileSize(Buffer.byteLength(csvContent, encoding))
    };
  }

  /**
   * Count rows in CSV file without loading into memory
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<number>} Number of rows
   */
  async countRows(filePath) {
    this.log('info', 'Counting CSV rows', { filePath });

    return new Promise((resolve, reject) => {
      let rowCount = 0;

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', () => {
          rowCount++;
        })
        .on('end', () => {
          this.log('info', 'Row count completed', { filePath, rowCount });
          resolve(rowCount);
        })
        .on('error', (error) => {
          this.log('error', 'Row counting failed', { filePath, error: error.message });
          reject(error);
        });
    });
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeDataForLogging(data) {
    const sanitized = { ...data };
    
    // Mask email addresses
    if (sanitized.email) {
      const [local, domain] = sanitized.email.split('@');
      if (local && domain) {
        sanitized.email = `${local.substring(0, 2)}***@${domain}`;
      }
    }
    
    // Mask phone numbers
    if (sanitized.phoneNumber || sanitized.phone_number) {
      const phone = sanitized.phoneNumber || sanitized.phone_number;
      if (phone && phone.length > 4) {
        sanitized.phoneNumber = `***${phone.slice(-4)}`;
        sanitized.phone_number = `***${phone.slice(-4)}`;
      }
    }

    return sanitized;
  }
}

module.exports = CsvRepository; 