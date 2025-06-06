/**
 * ValidationResult Value Object
 * Encapsulates validation results with error details
 * Following Architecture Guidelines - Domain Layer
 */

/**
 * ValidationResult value object representing the outcome of validation
 */
class ValidationResult {
  /**
   * Create a new ValidationResult
   * @param {boolean} isValid - Whether validation passed
   * @param {Array<Object>} errors - Array of validation errors
   * @param {Array<Object>} warnings - Array of validation warnings
   */
  constructor(isValid = true, errors = [], warnings = []) {
    this.isValid = Boolean(isValid);
    this.errors = [...errors];
    this.warnings = [...warnings];
    this.timestamp = new Date().toISOString();
  }

  /**
   * Add a validation error
   * @param {string} field - Field name that failed validation
   * @param {string} message - Error message
   * @param {string} code - Error code for programmatic handling
   * @param {*} value - The invalid value
   */
  addError(field, message, code = 'VALIDATION_ERROR', value = null) {
    this.errors.push({
      field,
      message,
      code,
      value,
      timestamp: new Date().toISOString()
    });
    this.isValid = false;
  }

  /**
   * Add a validation warning
   * @param {string} field - Field name
   * @param {string} message - Warning message
   * @param {string} code - Warning code
   * @param {*} value - The value that caused warning
   */
  addWarning(field, message, code = 'VALIDATION_WARNING', value = null) {
    this.warnings.push({
      field,
      message,
      code,
      value,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if there are any errors
   * @returns {boolean} True if errors exist
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * Check if there are any warnings
   * @returns {boolean} True if warnings exist
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Get all error messages
   * @returns {Array<string>} Array of error messages
   */
  getErrorMessages() {
    return this.errors.map(error => error.message);
  }

  /**
   * Get all warning messages
   * @returns {Array<string>} Array of warning messages
   */
  getWarningMessages() {
    return this.warnings.map(warning => warning.message);
  }

  /**
   * Get errors for a specific field
   * @param {string} field - Field name
   * @returns {Array<Object>} Array of errors for the field
   */
  getErrorsForField(field) {
    return this.errors.filter(error => error.field === field);
  }

  /**
   * Get warnings for a specific field
   * @param {string} field - Field name
   * @returns {Array<Object>} Array of warnings for the field
   */
  getWarningsForField(field) {
    return this.warnings.filter(warning => warning.field === field);
  }

  /**
   * Check if a specific field has errors
   * @param {string} field - Field name
   * @returns {boolean} True if field has errors
   */
  hasErrorsForField(field) {
    return this.getErrorsForField(field).length > 0;
  }

  /**
   * Merge another validation result into this one
   * @param {ValidationResult} other - Another validation result
   * @returns {ValidationResult} This instance for chaining
   */
  merge(other) {
    if (!(other instanceof ValidationResult)) {
      throw new Error('Can only merge with another ValidationResult');
    }

    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
    
    if (!other.isValid) {
      this.isValid = false;
    }

    return this;
  }

  /**
   * Get a summary of the validation result
   * @returns {Object} Summary object
   */
  getSummary() {
    return {
      isValid: this.isValid,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      fieldWithErrors: [...new Set(this.errors.map(e => e.field))],
      fieldsWithWarnings: [...new Set(this.warnings.map(w => w.field))]
    };
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return {
      isValid: this.isValid,
      timestamp: this.timestamp,
      errors: this.errors,
      warnings: this.warnings,
      summary: this.getSummary()
    };
  }

  /**
   * Create a string representation
   * @returns {string} String representation
   */
  toString() {
    if (this.isValid) {
      return `ValidationResult: VALID (${this.warnings.length} warnings)`;
    }
    return `ValidationResult: INVALID (${this.errors.length} errors, ${this.warnings.length} warnings)`;
  }

  /**
   * Create a successful validation result
   * @param {Array<Object>} warnings - Optional warnings
   * @returns {ValidationResult} Valid result
   */
  static success(warnings = []) {
    return new ValidationResult(true, [], warnings);
  }

  /**
   * Create a failed validation result
   * @param {Array<Object>} errors - Validation errors
   * @param {Array<Object>} warnings - Optional warnings
   * @returns {ValidationResult} Invalid result
   */
  static failure(errors = [], warnings = []) {
    return new ValidationResult(false, errors, warnings);
  }

  /**
   * Create a validation result with a single error
   * @param {string} field - Field name
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {*} value - Invalid value
   * @returns {ValidationResult} Invalid result
   */
  static error(field, message, code = 'VALIDATION_ERROR', value = null) {
    const result = new ValidationResult(false);
    result.addError(field, message, code, value);
    return result;
  }

  /**
   * Create a validation result with a single warning
   * @param {string} field - Field name
   * @param {string} message - Warning message
   * @param {string} code - Warning code
   * @param {*} value - Value that caused warning
   * @returns {ValidationResult} Valid result with warning
   */
  static warning(field, message, code = 'VALIDATION_WARNING', value = null) {
    const result = new ValidationResult(true);
    result.addWarning(field, message, code, value);
    return result;
  }
}

module.exports = ValidationResult; 