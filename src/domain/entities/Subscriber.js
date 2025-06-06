/**
 * Subscriber Domain Entity
 * Core business entity representing a subscriber with validation logic
 * Following Architecture Guidelines - Domain Layer
 */

/**
 * Subscriber entity representing a person subscribing to Laylo
 */
class Subscriber {
  /**
   * Create a new Subscriber
   * @param {Object} data - Subscriber data
   * @param {string} data.email - Email address (required)
   * @param {string} [data.firstName] - First name
   * @param {string} [data.lastName] - Last name
   * @param {string} [data.phoneNumber] - Phone number in international format
   */
  constructor(data) {
    this.email = data.email;
    this.firstName = data.firstName || '';
    this.lastName = data.lastName || '';
    this.phoneNumber = data.phoneNumber || '';
    this.originalData = { ...data };
    this.metadata = {
      createdAt: new Date().toISOString(),
      source: 'csv_import',
      processed: false,
      validationErrors: []
    };
  }

  /**
   * Get the full name of the subscriber
   * @returns {string} Full name or email if no name provided
   */
  getFullName() {
    const fullName = `${this.firstName} ${this.lastName}`.trim();
    return fullName || this.email.split('@')[0];
  }

  /**
   * Check if subscriber has a valid email
   * @returns {boolean} True if email is valid
   */
  hasValidEmail() {
    return this.email && this.isValidEmail(this.email);
  }

  /**
   * Check if subscriber has a phone number
   * @returns {boolean} True if phone number exists
   */
  hasPhoneNumber() {
    return Boolean(this.phoneNumber && this.phoneNumber.trim());
  }

  /**
   * Check if subscriber has a valid phone number
   * @returns {boolean} True if phone number is valid
   */
  hasValidPhoneNumber() {
    return this.hasPhoneNumber() && this.isValidPhoneNumber(this.phoneNumber);
  }

  /**
   * Get subscriber data for API submission
   * @returns {Object} Clean data object for Laylo API
   */
  getApiData() {
    const data = {};
    
    if (this.hasValidEmail()) {
      data.email = this.email.toLowerCase().trim();
    }
    
    if (this.hasValidPhoneNumber()) {
      data.phoneNumber = this.phoneNumber.trim();
    }
    
    return data;
  }

  /**
   * Check if subscriber is valid for API submission
   * @returns {boolean} True if valid for submission
   */
  isValid() {
    return this.hasValidEmail() && this.metadata.validationErrors.length === 0;
  }

  /**
   * Add validation error
   * @param {string} field - Field name
   * @param {string} message - Error message
   */
  addValidationError(field, message) {
    this.metadata.validationErrors.push({
      field,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get validation errors
   * @returns {Array} Array of validation errors
   */
  getValidationErrors() {
    return [...this.metadata.validationErrors];
  }

  /**
   * Mark subscriber as processed
   * @param {boolean} success - Whether processing was successful
   * @param {string} [message] - Optional message
   */
  markProcessed(success, message = '') {
    this.metadata.processed = true;
    this.metadata.processedAt = new Date().toISOString();
    this.metadata.success = success;
    this.metadata.message = message;
  }

  /**
   * Check if subscriber was successfully processed
   * @returns {boolean} True if successfully processed
   */
  wasSuccessful() {
    return this.metadata.processed && this.metadata.success;
  }

  /**
   * Get unique identifier for deduplication
   * @returns {string} Unique identifier (email)
   */
  getUniqueId() {
    return this.email.toLowerCase().trim();
  }

  /**
   * Convert to string representation
   * @returns {string} String representation
   */
  toString() {
    return `Subscriber{email: ${this.email}, name: ${this.getFullName()}}`;
  }

  /**
   * Convert to JSON object
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      phoneNumber: this.phoneNumber,
      fullName: this.getFullName(),
      isValid: this.isValid(),
      hasPhoneNumber: this.hasPhoneNumber(),
      validationErrors: this.getValidationErrors(),
      metadata: this.metadata
    };
  }

  /**
   * Create sanitized version for logging (masks sensitive data)
   * @returns {Object} Sanitized data
   */
  toLogSafeJSON() {
    return {
      email: this.maskEmail(this.email),
      firstName: this.firstName,
      lastName: this.lastName,
      phoneNumber: this.maskPhoneNumber(this.phoneNumber),
      fullName: this.getFullName(),
      isValid: this.isValid(),
      hasPhoneNumber: this.hasPhoneNumber(),
      validationErrors: this.getValidationErrors(),
      metadata: {
        ...this.metadata,
        createdAt: this.metadata.createdAt,
        processed: this.metadata.processed
      }
    };
  }

  // Validation helper methods

  /**
   * Validate email format (RFC 5322 compliant)
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format (international format)
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') return false;
    
    // International format: +[country code][number]
    const phoneRegex = /^\+\d{10,15}$/;
    return phoneRegex.test(phoneNumber.trim());
  }

  // Data masking for logging

  /**
   * Mask email for logging
   * @param {string} email - Email to mask
   * @returns {string} Masked email
   */
  maskEmail(email) {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Mask phone number for logging
   * @param {string} phoneNumber - Phone number to mask
   * @returns {string} Masked phone number
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 4) return phoneNumber;
    return `+***${cleaned.slice(-4)}`;
  }
}

module.exports = Subscriber; 