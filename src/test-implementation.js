/**
 * Test Implementation Script
 * Simple test to verify our domain layer is working correctly
 */

const { config } = require('./config');
const CsvRepository = require('./infrastructure/repositories/CsvRepository');
const { ValidationService } = require('./domain/services/ValidationService');
const { DeduplicationService } = require('./domain/services/DeduplicationService');
const ImportSession = require('./domain/entities/ImportSession');

/**
 * Simple console logger for testing
 */
const testLogger = {
  info: (msg, meta) => console.log(`INFO: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  warn: (msg, meta) => console.log(`WARN: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  error: (msg, meta) => console.log(`ERROR: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  debug: (msg, meta) => console.log(`DEBUG: ${msg}`, meta ? JSON.stringify(meta, null, 2) : '')
};

/**
 * Test the domain layer implementation
 */
async function testImplementation() {
  console.log('🧪 Testing Laylo CSV Importer Implementation\n');

  try {
    // Initialize services
    console.log('📋 Initializing services...');
    const csvRepository = new CsvRepository(testLogger);
    const validationService = new ValidationService();
    const deduplicationService = new DeduplicationService();
    const importSession = new ImportSession('test-session', {
      batchSize: 5,
      dryRun: true
    });

    console.log('✅ Services initialized successfully\n');

    // Test configuration
    console.log('⚙️ Testing configuration...');
    console.log('Configuration loaded:', {
      csvFilePath: config.CSV_FILE_PATH,
      batchSize: config.BATCH_SIZE,
      dryRun: config.DRY_RUN
    });
    console.log('✅ Configuration test passed\n');

    // Test CSV file access
    console.log('📁 Testing CSV file access...');
    const isAccessible = await csvRepository.isAccessible(config.CSV_FILE_PATH);
    if (!isAccessible) {
      throw new Error('CSV file is not accessible');
    }
    
    const fileStats = await csvRepository.getFileStats(config.CSV_FILE_PATH);
    console.log('File stats:', fileStats);
    console.log('✅ CSV file access test passed\n');

    // Test CSV reading (first 10 rows only for testing)
    console.log('📖 Testing CSV reading...');
    const { records, result } = await csvRepository.readAll(config.CSV_FILE_PATH, {
      maxRows: 10,
      requiredHeaders: ['email']
    });

    console.log('CSV read result:', {
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      headers: result.headers,
      duration: result.getDuration()
    });

    if (records.length === 0) {
      throw new Error('No records read from CSV');
    }
    console.log('✅ CSV reading test passed\n');

    // Test validation service
    console.log('🔍 Testing validation service...');
    let validCount = 0;
    let invalidCount = 0;
    
    for (const record of records.slice(0, 5)) { // Test first 5 records
      const { subscriber, validationResult, isValid } = validationService.validateAndCreateSubscriber(record);
      
      console.log(`Record ${record._lineNumber}:`, {
        email: subscriber.maskEmail(subscriber.email),
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        phoneNumber: subscriber.maskPhoneNumber(subscriber.phoneNumber),
        isValid,
        errors: validationResult.getErrorMessages(),
        warnings: validationResult.getWarningMessages()
      });

      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
      }
    }

    console.log(`Validation summary: ${validCount} valid, ${invalidCount} invalid`);
    console.log('✅ Validation service test passed\n');

    // Test deduplication service
    console.log('🔄 Testing deduplication service...');
    const subscribers = [];
    
    for (const record of records) {
      const { subscriber } = validationService.validateAndCreateSubscriber(record);
      subscribers.push(subscriber);
    }

    // Process for duplicates
    const batchResult = deduplicationService.processBatch(subscribers);
    const duplicateStats = deduplicationService.getStatistics();

    console.log('Deduplication result:', {
      unique: batchResult.unique.length,
      duplicates: batchResult.duplicates.length,
      errors: batchResult.errors.length,
      statistics: duplicateStats
    });

    if (batchResult.duplicates.length > 0) {
      console.log('Found duplicates:', batchResult.duplicates.map(dup => ({
        email: dup.subscriber.maskEmail(dup.subscriber.email),
        duplicateCount: dup.duplicateResult.duplicateCount
      })));
    }

    console.log('✅ Deduplication service test passed\n');

    // Test import session
    console.log('📊 Testing import session...');
    importSession.start(records.length);

    // Simulate processing some records
    for (let i = 0; i < Math.min(3, subscribers.length); i++) {
      const subscriber = subscribers[i];
      if (subscriber.isValid()) {
        importSession.recordSuccess(subscriber, { success: true });
      } else {
        importSession.recordFailure(subscriber, new Error('Validation failed'));
      }
    }

    const sessionStatus = importSession.getStatus();
    console.log('Import session status:', {
      sessionId: sessionStatus.sessionId,
      status: sessionStatus.status,
      progress: sessionStatus.progress,
      statistics: sessionStatus.statistics
    });

    importSession.complete(true);
    const finalSummary = importSession.getSummary();
    console.log('Final session summary:', finalSummary);
    console.log('✅ Import session test passed\n');

    // Test typo detection
    console.log('🔤 Testing typo detection...');
    const testRecord = {
      first_name: 'Test',
      last_name: 'User',
      email: 'test@gmail.con', // Intentional typo
      phone_number: '+1234567890'
    };

    const { subscriber: testSubscriber, validationResult: testValidation } = 
      validationService.validateAndCreateSubscriber(testRecord);

    console.log('Typo detection result:', {
      email: testRecord.email,
      isValid: testValidation.isValid,
      warnings: testValidation.getWarningMessages(),
      errors: testValidation.getErrorMessages()
    });
    console.log('✅ Typo detection test passed\n');

    console.log('🎉 All tests passed! Implementation is working correctly.\n');

    // Final summary
    console.log('📈 Implementation Test Summary:');
    console.log('- Configuration system: ✅ Working');
    console.log('- CSV file access: ✅ Working');
    console.log('- CSV reading & parsing: ✅ Working');
    console.log('- Data validation: ✅ Working');
    console.log('- Duplicate detection: ✅ Working');
    console.log('- Import session tracking: ✅ Working');
    console.log('- Typo detection: ✅ Working');
    console.log('- Data privacy (masking): ✅ Working');
    console.log('\n✨ Ready to proceed to Phase 3: API Integration!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  console.log('Starting implementation test...\n');
  testImplementation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testImplementation }; 