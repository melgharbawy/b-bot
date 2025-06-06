/**
 * DeduplicationService Domain Service
 * Handles duplicate detection and management for subscribers
 * Following Architecture Guidelines - Domain Layer
 */

const Subscriber = require('../entities/Subscriber');

/**
 * Duplicate detection result
 */
class DuplicateResult {
  constructor(isDuplicate = false, originalRecord = null, duplicateCount = 0) {
    this.isDuplicate = isDuplicate;
    this.originalRecord = originalRecord;
    this.duplicateCount = duplicateCount;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return {
      isDuplicate: this.isDuplicate,
      originalRecord: this.originalRecord ? this.originalRecord.toLogSafeJSON() : null,
      duplicateCount: this.duplicateCount,
      timestamp: this.timestamp
    };
  }
}

/**
 * Deduplication strategy interface
 */
class DeduplicationStrategy {
  /**
   * Generate unique key for subscriber
   * @param {Subscriber} subscriber - Subscriber to generate key for
   * @returns {string} Unique key
   */
  generateKey(subscriber) {
    throw new Error('DeduplicationStrategy.generateKey must be implemented');
  }

  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName() {
    throw new Error('DeduplicationStrategy.getName must be implemented');
  }
}

/**
 * Email-based deduplication strategy
 */
class EmailDeduplicationStrategy extends DeduplicationStrategy {
  /**
   * Generate key based on email address
   * @param {Subscriber} subscriber - Subscriber
   * @returns {string} Email-based key
   */
  generateKey(subscriber) {
    return subscriber.email ? subscriber.email.toLowerCase().trim() : '';
  }

  getName() {
    return 'EmailDeduplicationStrategy';
  }
}

/**
 * Email and phone combined deduplication strategy
 */
class EmailPhoneDeduplicationStrategy extends DeduplicationStrategy {
  /**
   * Generate key based on email and phone combination
   * @param {Subscriber} subscriber - Subscriber
   * @returns {string} Combined key
   */
  generateKey(subscriber) {
    const email = subscriber.email ? subscriber.email.toLowerCase().trim() : '';
    const phone = subscriber.phoneNumber ? subscriber.phoneNumber.trim() : '';
    return `${email}|${phone}`;
  }

  getName() {
    return 'EmailPhoneDeduplicationStrategy';
  }
}

/**
 * Strict deduplication strategy (email, phone, and name)
 */
class StrictDeduplicationStrategy extends DeduplicationStrategy {
  /**
   * Generate key based on email, phone, and name
   * @param {Subscriber} subscriber - Subscriber
   * @returns {string} Strict key
   */
  generateKey(subscriber) {
    const email = subscriber.email ? subscriber.email.toLowerCase().trim() : '';
    const phone = subscriber.phoneNumber ? subscriber.phoneNumber.trim() : '';
    const firstName = subscriber.firstName ? subscriber.firstName.toLowerCase().trim() : '';
    const lastName = subscriber.lastName ? subscriber.lastName.toLowerCase().trim() : '';
    return `${email}|${phone}|${firstName}|${lastName}`;
  }

  getName() {
    return 'StrictDeduplicationStrategy';
  }
}

/**
 * Main deduplication service
 */
class DeduplicationService {
  constructor(strategy = null) {
    this.strategy = strategy || new EmailDeduplicationStrategy();
    this.seenRecords = new Map(); // key -> {subscriber, count, firstSeen}
    this.duplicateGroups = new Map(); // key -> array of duplicates
    this.statistics = {
      totalRecords: 0,
      uniqueRecords: 0,
      duplicateRecords: 0,
      duplicateGroups: 0
    };
  }

  /**
   * Set deduplication strategy
   * @param {DeduplicationStrategy} strategy - Deduplication strategy
   */
  setStrategy(strategy) {
    if (!(strategy instanceof DeduplicationStrategy)) {
      throw new Error('Strategy must extend DeduplicationStrategy');
    }
    this.strategy = strategy;
  }

  /**
   * Check if subscriber is a duplicate
   * @param {Subscriber} subscriber - Subscriber to check
   * @returns {DuplicateResult} Duplicate detection result
   */
  checkDuplicate(subscriber) {
    if (!(subscriber instanceof Subscriber)) {
      throw new Error('Data must be a Subscriber instance');
    }

    this.statistics.totalRecords++;

    const key = this.strategy.generateKey(subscriber);
    
    // Empty key means we can't deduplicate
    if (!key || key.trim() === '') {
      this.statistics.uniqueRecords++;
      return new DuplicateResult(false);
    }

    const existingRecord = this.seenRecords.get(key);

    if (existingRecord) {
      // This is a duplicate
      existingRecord.count++;
      this.statistics.duplicateRecords++;

      // Add to duplicate group
      if (!this.duplicateGroups.has(key)) {
        this.duplicateGroups.set(key, []);
      }
      this.duplicateGroups.get(key).push({
        subscriber,
        timestamp: new Date().toISOString(),
        duplicateNumber: existingRecord.count
      });

      return new DuplicateResult(true, existingRecord.subscriber, existingRecord.count);
    } else {
      // This is unique
      this.seenRecords.set(key, {
        subscriber,
        count: 1,
        firstSeen: new Date().toISOString(),
        key
      });
      this.statistics.uniqueRecords++;

      return new DuplicateResult(false);
    }
  }

  /**
   * Process a batch of subscribers for duplicates
   * @param {Array<Subscriber>} subscribers - Array of subscribers
   * @returns {Object} Batch processing result
   */
  processBatch(subscribers) {
    const results = {
      unique: [],
      duplicates: [],
      errors: []
    };

    for (const subscriber of subscribers) {
      try {
        const duplicateResult = this.checkDuplicate(subscriber);
        
        if (duplicateResult.isDuplicate) {
          results.duplicates.push({
            subscriber,
            duplicateResult
          });
        } else {
          results.unique.push(subscriber);
        }
      } catch (error) {
        results.errors.push({
          subscriber,
          error: error.message
        });
      }
    }

    // Update group statistics
    this.statistics.duplicateGroups = this.duplicateGroups.size;

    return results;
  }

  /**
   * Get duplicate groups
   * @returns {Array} Array of duplicate groups
   */
  getDuplicateGroups() {
    const groups = [];
    
    for (const [key, duplicates] of this.duplicateGroups.entries()) {
      const originalRecord = this.seenRecords.get(key);
      groups.push({
        key,
        strategy: this.strategy.getName(),
        originalRecord: originalRecord ? originalRecord.subscriber : null,
        duplicates: duplicates,
        totalCount: duplicates.length + 1 // +1 for original
      });
    }

    return groups;
  }

  /**
   * Get specific duplicate group by key
   * @param {string} key - Deduplication key
   * @returns {Object|null} Duplicate group or null
   */
  getDuplicateGroup(key) {
    const duplicates = this.duplicateGroups.get(key);
    const originalRecord = this.seenRecords.get(key);

    if (!duplicates || !originalRecord) {
      return null;
    }

    return {
      key,
      strategy: this.strategy.getName(),
      originalRecord: originalRecord.subscriber,
      duplicates: duplicates,
      totalCount: duplicates.length + 1
    };
  }

  /**
   * Check if a key has duplicates
   * @param {string} key - Deduplication key
   * @returns {boolean} True if key has duplicates
   */
  hasDuplicates(key) {
    return this.duplicateGroups.has(key);
  }

  /**
   * Get all unique subscribers (first occurrence only)
   * @returns {Array<Subscriber>} Array of unique subscribers
   */
  getUniqueSubscribers() {
    return Array.from(this.seenRecords.values()).map(record => record.subscriber);
  }

  /**
   * Get all duplicate subscribers (excluding first occurrence)
   * @returns {Array<Subscriber>} Array of duplicate subscribers
   */
  getDuplicateSubscribers() {
    const duplicates = [];
    
    for (const duplicateGroup of this.duplicateGroups.values()) {
      duplicates.push(...duplicateGroup.map(item => item.subscriber));
    }

    return duplicates;
  }

  /**
   * Reset deduplication state
   */
  reset() {
    this.seenRecords.clear();
    this.duplicateGroups.clear();
    this.statistics = {
      totalRecords: 0,
      uniqueRecords: 0,
      duplicateRecords: 0,
      duplicateGroups: 0
    };
  }

  /**
   * Get deduplication statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    return {
      ...this.statistics,
      duplicateRate: this.statistics.totalRecords > 0 ? 
        Math.round((this.statistics.duplicateRecords / this.statistics.totalRecords) * 100) : 0,
      uniqueRate: this.statistics.totalRecords > 0 ? 
        Math.round((this.statistics.uniqueRecords / this.statistics.totalRecords) * 100) : 0,
      strategy: this.strategy.getName()
    };
  }

  /**
   * Export deduplication data for reporting
   * @returns {Object} Export data
   */
  export() {
    return {
      strategy: this.strategy.getName(),
      statistics: this.getStatistics(),
      duplicateGroups: this.getDuplicateGroups(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate deduplication report
   * @returns {Object} Detailed report
   */
  generateReport() {
    const duplicateGroups = this.getDuplicateGroups();
    const statistics = this.getStatistics();

    return {
      summary: {
        strategy: this.strategy.getName(),
        totalRecords: statistics.totalRecords,
        uniqueRecords: statistics.uniqueRecords,
        duplicateRecords: statistics.duplicateRecords,
        duplicateGroups: statistics.duplicateGroups,
        duplicateRate: statistics.duplicateRate,
        uniqueRate: statistics.uniqueRate
      },
      duplicateGroups: duplicateGroups.map(group => ({
        key: group.key,
        totalCount: group.totalCount,
        originalRecord: group.originalRecord ? group.originalRecord.toLogSafeJSON() : null,
        duplicates: group.duplicates.map(dup => ({
          subscriber: dup.subscriber.toLogSafeJSON(),
          timestamp: dup.timestamp,
          duplicateNumber: dup.duplicateNumber
        }))
      })),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Find potential duplicates using fuzzy matching
   * @param {Subscriber} subscriber - Subscriber to find matches for
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Array} Array of potential matches
   */
  findPotentialDuplicates(subscriber, threshold = 0.8) {
    const potentialMatches = [];
    const targetEmail = subscriber.email ? subscriber.email.toLowerCase() : '';
    
    for (const record of this.seenRecords.values()) {
      const recordEmail = record.subscriber.email ? record.subscriber.email.toLowerCase() : '';
      
      // Simple similarity check (can be enhanced with more sophisticated algorithms)
      const similarity = this.calculateSimilarity(targetEmail, recordEmail);
      
      if (similarity >= threshold && similarity < 1.0) {
        potentialMatches.push({
          subscriber: record.subscriber,
          similarity,
          reason: 'email_similarity'
        });
      }
    }

    return potentialMatches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate similarity between two strings (simple implementation)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const levenshteinDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - levenshteinDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

module.exports = {
  DeduplicationService,
  DeduplicationStrategy,
  EmailDeduplicationStrategy,
  EmailPhoneDeduplicationStrategy,
  StrictDeduplicationStrategy,
  DuplicateResult
}; 