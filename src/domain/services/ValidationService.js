/**
 * ValidationService Domain Service
 * Implements Strategy pattern for different validation strategies
 * Following Architecture Guidelines - Domain Layer, Strategy Pattern
 */

const ValidationResult = require('../entities/ValidationResult');
const Subscriber = require('../entities/Subscriber');

/**
 * Base validation strategy interface
 */
class ValidationStrategy {
  /**
   * Validate data according to strategy
   * @param {*} data - Data to validate
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    throw new Error('ValidationStrategy.validate must be implemented');
  }

  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName() {
    throw new Error('ValidationStrategy.getName must be implemented');
  }
}

/**
 * Email validation strategy
 */
class EmailValidationStrategy extends ValidationStrategy {
  /**
   * Validate email format and requirements
   * @param {Subscriber|Object} data - Data containing email
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    const result = new ValidationResult();
    const email = data.email || data.EMAIL;

    // Check if email exists
    if (!email) {
      result.addError('email', 'Email address is required', 'MISSING_EMAIL');
      return result;
    }

    // Check if email is a string
    if (typeof email !== 'string') {
      result.addError('email', 'Email must be a string', 'INVALID_EMAIL_TYPE', email);
      return result;
    }

    // Check email format using RFC 5322 compliant regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
      result.addError('email', 'Invalid email format', 'INVALID_EMAIL_FORMAT', email);
      return result;
    }

    // Check email length (reasonable limits)
    if (email.length > 254) {
      result.addError('email', 'Email address too long (max 254 characters)', 'EMAIL_TOO_LONG', email);
      return result;
    }

    // Check for common typos
    const commonTypos = [
      { pattern: /\.con$/, suggestion: '.com', message: 'Did you mean .com instead of .con?' },
      { pattern: /\.cmo$/, suggestion: '.com', message: 'Did you mean .com instead of .cmo?' },
      { pattern: /\.ocm$/, suggestion: '.com', message: 'Did you mean .com instead of .ocm?' },
      { pattern: /gmail\.co$/, suggestion: 'gmail.com', message: 'Did you mean gmail.com?' },
      { pattern: /yahoo\.co$/, suggestion: 'yahoo.com', message: 'Did you mean yahoo.com?' }
    ];

    for (const typo of commonTypos) {
      if (typo.pattern.test(email)) {
        result.addWarning('email', typo.message, 'POSSIBLE_TYPO', email);
        break;
      }
    }

    return result;
  }

  getName() {
    return 'EmailValidationStrategy';
  }
}

/**
 * Phone number validation strategy
 */
class PhoneValidationStrategy extends ValidationStrategy {
  /**
   * Validate phone number format
   * @param {Subscriber|Object} data - Data containing phone number
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    const result = new ValidationResult();
    const phoneNumber = data.phoneNumber || data.phone_number || data.PHONE_NUMBER;

    // Phone number is optional, but if provided should be valid
    if (!phoneNumber) {
      return result; // Valid - phone is optional
    }

    // Check if phone is a string
    if (typeof phoneNumber !== 'string') {
      result.addError('phoneNumber', 'Phone number must be a string', 'INVALID_PHONE_TYPE', phoneNumber);
      return result;
    }

    const cleanPhone = phoneNumber.trim();

    // Check if empty after trimming
    if (!cleanPhone) {
      return result; // Valid - empty phone is allowed
    }

    // International format validation: +[country code][number]
    const phoneRegex = /^\+\d{10,15}$/;
    
    if (!phoneRegex.test(cleanPhone)) {
      result.addError(
        'phoneNumber', 
        'Phone number must be in international format (+1234567890)', 
        'INVALID_PHONE_FORMAT', 
        phoneNumber
      );
      return result;
    }

    // Check reasonable length limits
    if (cleanPhone.length < 10) {
      result.addError('phoneNumber', 'Phone number too short', 'PHONE_TOO_SHORT', phoneNumber);
    } else if (cleanPhone.length > 16) {
      result.addError('phoneNumber', 'Phone number too long', 'PHONE_TOO_LONG', phoneNumber);
    }

    return result;
  }

  getName() {
    return 'PhoneValidationStrategy';
  }
}

/**
 * Required fields validation strategy
 */
class RequiredFieldsValidationStrategy extends ValidationStrategy {
  constructor(requiredFields = ['email']) {
    super();
    this.requiredFields = requiredFields;
  }

  /**
   * Validate required fields are present
   * @param {Subscriber|Object} data - Data to validate
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    const result = new ValidationResult();

    for (const field of this.requiredFields) {
      const value = data[field];
      
      if (value === undefined || value === null || value === '') {
        result.addError(field, `${field} is required`, 'MISSING_REQUIRED_FIELD', value);
      }
    }

    return result;
  }

  getName() {
    return 'RequiredFieldsValidationStrategy';
  }
}

/**
 * Name validation strategy
 */
class NameValidationStrategy extends ValidationStrategy {
  /**
   * Validate name fields
   * @param {Subscriber|Object} data - Data containing names
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    const result = new ValidationResult();
    const firstName = data.firstName || data.first_name || data.FIRST_NAME;
    const lastName = data.lastName || data.last_name || data.LAST_NAME;

    // Names are optional but should be reasonable if provided
    if (firstName && typeof firstName === 'string') {
      if (firstName.length > 50) {
        result.addWarning('firstName', 'First name is very long', 'NAME_TOO_LONG', firstName);
      }
      if (firstName.trim().length === 0) {
        result.addWarning('firstName', 'First name is empty', 'EMPTY_NAME', firstName);
      }
    }

    if (lastName && typeof lastName === 'string') {
      if (lastName.length > 50) {
        result.addWarning('lastName', 'Last name is very long', 'NAME_TOO_LONG', lastName);
      }
      if (lastName.trim().length === 0) {
        result.addWarning('lastName', 'Last name is empty', 'EMPTY_NAME', lastName);
      }
    }

    return result;
  }

  getName() {
    return 'NameValidationStrategy';
  }
}

/**
 * Data completeness validation strategy
 */
class CompletenessValidationStrategy extends ValidationStrategy {
  /**
   * Validate data completeness
   * @param {Subscriber|Object} data - Data to validate
   * @returns {ValidationResult} Validation result
   */
  validate(data) {
    const result = new ValidationResult();
    
    const email = data.email || data.EMAIL;
    const phone = data.phoneNumber || data.phone_number || data.PHONE_NUMBER;
    const firstName = data.firstName || data.first_name || data.FIRST_NAME;
    const lastName = data.lastName || data.last_name || data.LAST_NAME;

    // Warn if only email is provided (missing contact info)
    if (email && !phone) {
      result.addWarning('phoneNumber', 'No phone number provided - email only subscription', 'MISSING_PHONE');
    }

    // Warn if no name information
    if (!firstName && !lastName) {
      result.addWarning('name', 'No name information provided', 'MISSING_NAME');
    }

    return result;
  }

  getName() {
    return 'CompletenessValidationStrategy';
  }
}

/**
 * Main validation service implementing Strategy pattern
 */
class ValidationService {
  constructor() {
    this.strategies = new Map();
    this.defaultStrategies = [
      new EmailValidationStrategy(),
      new PhoneValidationStrategy(),
      new RequiredFieldsValidationStrategy(['email']),
      new NameValidationStrategy(),
      new CompletenessValidationStrategy()
    ];

    // Register default strategies
    this.defaultStrategies.forEach(strategy => {
      this.addStrategy(strategy.getName(), strategy);
    });
  }

  /**
   * Add a validation strategy
   * @param {string} name - Strategy name
   * @param {ValidationStrategy} strategy - Strategy instance
   */
  addStrategy(name, strategy) {
    if (!(strategy instanceof ValidationStrategy)) {
      throw new Error('Strategy must extend ValidationStrategy');
    }
    this.strategies.set(name, strategy);
  }

  /**
   * Remove a validation strategy
   * @param {string} name - Strategy name
   */
  removeStrategy(name) {
    this.strategies.delete(name);
  }

  /**
   * Get a validation strategy
   * @param {string} name - Strategy name
   * @returns {ValidationStrategy|null} Strategy or null if not found
   */
  getStrategy(name) {
    return this.strategies.get(name) || null;
  }

  /**
   * Validate data using all registered strategies
   * @param {Subscriber|Object} data - Data to validate
   * @param {Array<string>} strategyNames - Specific strategies to use (optional)
   * @returns {ValidationResult} Combined validation result
   */
  validate(data, strategyNames = null) {
    const result = new ValidationResult();
    const strategiesToUse = strategyNames ? 
      strategyNames.map(name => this.getStrategy(name)).filter(Boolean) :
      Array.from(this.strategies.values());

    for (const strategy of strategiesToUse) {
      try {
        const strategyResult = strategy.validate(data);
        result.merge(strategyResult);
      } catch (error) {
        result.addError(
          'validation', 
          `Strategy ${strategy.getName()} failed: ${error.message}`, 
          'STRATEGY_ERROR',
          strategy.getName()
        );
      }
    }

    return result;
  }

  /**
   * Validate a subscriber entity
   * @param {Subscriber} subscriber - Subscriber to validate
   * @returns {ValidationResult} Validation result
   */
  validateSubscriber(subscriber) {
    if (!(subscriber instanceof Subscriber)) {
      throw new Error('Data must be a Subscriber instance');
    }

    const result = this.validate(subscriber);
    
    // Add validation errors to subscriber
    if (result.hasErrors()) {
      result.errors.forEach(error => {
        subscriber.addValidationError(error.field, error.message);
      });
    }

    return result;
  }

  /**
   * Validate raw CSV data and create Subscriber
   * @param {Object} rawData - Raw CSV row data
   * @returns {Object} Object with subscriber and validation result
   */
  validateAndCreateSubscriber(rawData) {
    // Normalize field names
    const normalizedData = this.normalizeFieldNames(rawData);
    
    // Create subscriber
    const subscriber = new Subscriber(normalizedData);
    
    // Validate
    const validationResult = this.validateSubscriber(subscriber);
    
    return {
      subscriber,
      validationResult,
      isValid: validationResult.isValid && subscriber.isValid()
    };
  }

  /**
   * Normalize field names from CSV
   * @param {Object} rawData - Raw CSV data
   * @returns {Object} Normalized data
   */
  normalizeFieldNames(rawData) {
    const normalized = {};
    
    // Field mapping for common variations
    const fieldMappings = {
      email: ['email', 'EMAIL', 'Email', 'email_address', 'emailAddress'],
      firstName: ['first_name', 'firstName', 'FIRST_NAME', 'FirstName', 'fname'],
      lastName: ['last_name', 'lastName', 'LAST_NAME', 'LastName', 'lname'],
      phoneNumber: ['phone_number', 'phoneNumber', 'PHONE_NUMBER', 'PhoneNumber', 'phone', 'Phone', 'PHONE']
    };

    for (const [targetField, sourceFields] of Object.entries(fieldMappings)) {
      for (const sourceField of sourceFields) {
        if (rawData[sourceField] !== undefined) {
          normalized[targetField] = rawData[sourceField];
          break;
        }
      }
    }

    return normalized;
  }

  /**
   * Get list of available strategies
   * @returns {Array<string>} Strategy names
   */
  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }
}

module.exports = {
  ValidationService,
  ValidationStrategy,
  EmailValidationStrategy,
  PhoneValidationStrategy,
  RequiredFieldsValidationStrategy,
  NameValidationStrategy,
  CompletenessValidationStrategy
}; 