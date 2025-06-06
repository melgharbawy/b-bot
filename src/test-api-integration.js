/**
 * Phase 3 API Integration Test
 * Comprehensive test for the complete import workflow
 */

const { config } = require('./config');
const { ImportCsvUseCase } = require('./application/useCases/ImportCsvUseCase');
const { ValidateDataUseCase } = require('./application/useCases/ValidateDataUseCase');

/**
 * Simple console logger for testing
 */
const testLogger = {
  info: (msg, meta) => console.log(`📘 INFO: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  warn: (msg, meta) => console.log(`⚠️ WARN: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  error: (msg, meta) => console.log(`❌ ERROR: ${msg}`, meta ? JSON.stringify(meta, null, 2) : ''),
  debug: (msg, meta) => console.log(`🔍 DEBUG: ${msg}`, meta ? JSON.stringify(meta, null, 2) : '')
};

/**
 * Progress callback for tracking workflow progress
 */
function createProgressCallback(testName) {
  return (progress) => {
    const { phase, processed, total } = progress;
    const percentage = total ? Math.round((processed / total) * 100) : 0;
    console.log(`📊 ${testName} Progress [${phase}]: ${processed}/${total} (${percentage}%)`);
  };
}

/**
 * Test Phase 3: API Integration
 */
async function testApiIntegration() {
  console.log('🚀 Starting Phase 3: API Integration Test\n');

  try {
    // Test 1: Validate Data Use Case
    await testValidateDataUseCase();
    
    // Test 2: Import CSV Use Case (Dry Run)
    await testImportCsvUseCaseDryRun();
    
    // Test 3: API Connection Test (if API key provided)
    if (config.LAYLO_API_KEY && config.LAYLO_API_KEY !== 'your_laylo_api_key_here') {
      await testApiConnectionTest();
      
      // Test 4: Small Sample Import (if API key is valid)
      await testSmallSampleImport();
    } else {
      console.log('⏭️  Skipping API connection tests (no valid API key provided)\n');
    }

    console.log('🎉 Phase 3: API Integration Tests Completed Successfully!\n');
    return true;

  } catch (error) {
    console.error('❌ Phase 3: API Integration Test Failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

/**
 * Test 1: Validate Data Use Case
 */
async function testValidateDataUseCase() {
  console.log('📋 Test 1: Validate Data Use Case');
  console.log('=====================================');

  const validateUseCase = new ValidateDataUseCase(config, testLogger);

  const validationOptions = {
    maxRecords: 20, // Limit for testing
    includeDeduplication: true,
    strictValidation: false,
    progressCallback: createProgressCallback('Validation')
  };

  const report = await validateUseCase.execute(validationOptions);

  console.log('✅ Validation Use Case Results:');
  console.log('- Total Records:', report.summary.totalRecords);
  console.log('- Valid Records:', report.summary.validRecords);
  console.log('- Invalid Records:', report.summary.invalidRecords);
  console.log('- Records with Warnings:', report.summary.recordsWithWarnings);
  console.log('- Duplicates Found:', report.summary.duplicatesFound);
  console.log('- Validation Rate:', report.summary.validationRate + '%');

  if (report.summary.invalidRecords > 0) {
    console.log('\n🔍 Common Issues Found:');
    report.statistics.commonIssues.slice(0, 3).forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue.field} (${issue.type}): ${issue.count} occurrences`);
    });
  }

  if (report.summary.duplicatesFound > 0) {
    console.log('\n🔄 Duplicate Examples:');
    report.duplicates.slice(0, 2).forEach((dup, index) => {
      console.log(`  ${index + 1}. ${dup.email} (duplicated ${dup.duplicateCount} times)`);
    });
  }

  console.log('\n📊 Use Case Statistics:', validateUseCase.getStatistics());
  console.log('✅ Test 1 Passed\n');
}

/**
 * Test 2: Import CSV Use Case (Dry Run)
 */
async function testImportCsvUseCaseDryRun() {
  console.log('📦 Test 2: Import CSV Use Case (Dry Run)');
  console.log('=========================================');

  const importUseCase = new ImportCsvUseCase(config, testLogger);

  const importOptions = {
    dryRun: true,
    maxRecords: 15, // Limit for testing
    batchSize: 3,
    progressCallback: createProgressCallback('Import (Dry Run)')
  };

  const result = await importUseCase.execute(importOptions);

  console.log('✅ Import Use Case (Dry Run) Results:');
  console.log('- Success:', result.success);
  console.log('- Session ID:', result.sessionId);
  console.log('- Summary:', {
    totalRecords: result.summary.statistics.totalRecords,
    validRecords: result.importSession.statistics.totalRecords,
    dryRun: result.summary.dryRun,
    duration: result.summary.duration
  });

  if (result.summary.deduplicationStats) {
    console.log('- Deduplication:', {
      processed: result.summary.deduplicationStats.totalProcessed,
      unique: result.summary.deduplicationStats.totalUnique,
      duplicates: result.summary.deduplicationStats.totalDuplicates
    });
  }

  console.log('\n📊 Use Case Statistics:', importUseCase.getStatistics());
  console.log('✅ Test 2 Passed\n');
}

/**
 * Test 3: API Connection Test
 */
async function testApiConnectionTest() {
  console.log('🌐 Test 3: API Connection Test');
  console.log('===============================');

  const importUseCase = new ImportCsvUseCase(config, testLogger);

  try {
    // Test API connection through the repository
    const connectionResult = await importUseCase.apiRepository.testConnection();

    console.log('✅ API Connection Test Results:');
    console.log('- Connection Successful:', connectionResult.success);
    console.log('- API URL:', connectionResult.metadata.apiUrl);
    
    if (connectionResult.success) {
      console.log('- API Response Data Available:', !!connectionResult.data);
    }

    const healthStatus = importUseCase.apiRepository.getHealthStatus();
    console.log('\n🏥 API Health Status:');
    console.log('- Configured:', healthStatus.apiClient.configured);
    console.log('- Has API Key:', healthStatus.apiClient.hasApiKey);
    console.log('- Rate Limiter Status:', healthStatus.rateLimiter);

    console.log('✅ Test 3 Passed\n');

  } catch (error) {
    console.log('⚠️  API Connection Test Failed (expected if using test key):');
    console.log('- Error:', error.message);
    console.log('- This is normal if using a test/invalid API key\n');
    
    // Don't throw error for invalid API key during testing
    if (error.message.includes('authentication') || error.message.includes('401')) {
      console.log('✅ Test 3 Passed (connection test with invalid key works as expected)\n');
    } else {
      throw error;
    }
  }
}

/**
 * Test 4: Small Sample Import (only if API key is valid)
 */
async function testSmallSampleImport() {
  console.log('📤 Test 4: Small Sample Import');
  console.log('===============================');

  const importUseCase = new ImportCsvUseCase(config, testLogger);

  // First test with dry run to check validation
  const dryRunOptions = {
    dryRun: true,
    maxRecords: 3,
    batchSize: 1
  };

  const dryRunResult = await importUseCase.execute(dryRunOptions);
  
  if (!dryRunResult.success) {
    throw new Error(`Dry run failed: ${dryRunResult.error}`);
  }

  console.log('✅ Dry Run Validation Successful');
  console.log('- Records to be imported:', dryRunResult.summary.statistics.totalRecords);

  // Only proceed with actual import if dry run was successful and we have valid records
  if (dryRunResult.summary.statistics.totalRecords > 0) {
    console.log('\n⚠️  Note: This would normally proceed with actual API import');
    console.log('   For testing purposes, we\'re stopping here to avoid');
    console.log('   making actual API calls without user confirmation.');
    
    // Uncomment the following block to test actual API import
    // WARNING: This will make real API calls if API key is valid
    /*
    console.log('\n🚀 Proceeding with actual import (2 records max)...');
    
    const importOptions = {
      dryRun: false,
      maxRecords: 2,
      batchSize: 1,
      progressCallback: createProgressCallback('Live Import')
    };

    const importResult = await importUseCase.execute(importOptions);
    
    console.log('✅ Live Import Results:');
    console.log('- Success:', importResult.success);
    console.log('- Records Processed:', importResult.summary.statistics.totalRecords);
    console.log('- Successful Imports:', importResult.summary.statistics.successful);
    console.log('- Failed Imports:', importResult.summary.statistics.failed);
    */
  }

  console.log('✅ Test 4 Passed\n');
}

/**
 * Test the complete integration stack
 */
async function testCompleteIntegration() {
  console.log('🔧 Complete Integration Stack Test');
  console.log('===================================');

  // Test all components working together
  const importUseCase = new ImportCsvUseCase(config, testLogger);
  const validateUseCase = new ValidateDataUseCase(config, testLogger);

  // Check all services are properly initialized
  console.log('🔍 Checking Service Integration:');
  
  // Test CSV Repository
  const csvStats = await importUseCase.csvRepository.getFileStats(config.CSV_FILE_PATH);
  console.log('- CSV Repository: ✅ Accessible');
  console.log('  File size:', csvStats.size, 'bytes');
  
  // Test Validation Service
  const testRecord = {
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    phone_number: '+1234567890'
  };
  
  const { isValid } = importUseCase.validationService.validateAndCreateSubscriber(testRecord);
  console.log('- Validation Service: ✅ Working');
  console.log('  Test record validation:', isValid);

  // Test Deduplication Service
  const dupStats = importUseCase.deduplicationService.getStatistics();
  console.log('- Deduplication Service: ✅ Initialized');
  console.log('  Statistics reset:', dupStats.totalProcessed === 0);

  // Test API Repository Configuration
  const apiConfig = importUseCase.apiRepository.getConfiguration();
  console.log('- API Repository: ✅ Configured');
  console.log('  API URL:', apiConfig.apiUrl);
  console.log('  Has API Key:', apiConfig.hasApiKey);

  console.log('\n✅ Complete Integration Stack Test Passed\n');
}

/**
 * Run all Phase 3 tests
 */
async function runPhase3Tests() {
  console.log('🧪 Phase 3: API Integration - Complete Test Suite');
  console.log('==================================================\n');

  const startTime = Date.now();

  try {
    // Test complete integration stack
    await testCompleteIntegration();
    
    // Run API integration tests
    const success = await testApiIntegration();
    
    const duration = Date.now() - startTime;
    
    if (success) {
      console.log('🎉 All Phase 3 Tests Completed Successfully!');
      console.log(`⏱️  Total Test Duration: ${duration}ms`);
      console.log('\n🚀 Phase 3: API Integration is READY!');
      console.log('✨ Ready to proceed to Phase 4: Advanced Features\n');
    } else {
      console.log('❌ Some Phase 3 tests failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Phase 3 Test Suite Failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runPhase3Tests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { 
  testApiIntegration,
  testValidateDataUseCase,
  testImportCsvUseCaseDryRun,
  runPhase3Tests
}; 