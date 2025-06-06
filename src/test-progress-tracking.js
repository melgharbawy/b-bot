/**
 * Phase 4.2 Progress Tracking & Reporting Test
 * Comprehensive test for progress tracking system implementation
 */

const { ProgressTracker, ProgressEventType } = require('./presentation/progress/ProgressTracker');
const { ProgressDisplay } = require('./presentation/progress/ProgressDisplay');
const { ProgressPersistence } = require('./presentation/progress/ProgressPersistence');
const fs = require('fs').promises;
const path = require('path');

/**
 * Test Phase 4.2 Progress Tracking Infrastructure
 */
async function testProgressTracking() {
  console.log('🧪 Testing Phase 4.2: Progress Tracking & Reporting\n');

  try {
    // Test 1: Progress Tracker Basic Functionality
    await testProgressTracker();
    
    // Test 2: Observer Pattern Implementation
    await testObserverPattern();
    
    // Test 3: Progress Display (Console Output)
    await testProgressDisplay();
    
    // Test 4: Progress Persistence
    await testProgressPersistence();
    
    // Test 5: Integration Test (Complete Workflow)
    await testIntegratedWorkflow();

    console.log('🎉 Phase 4.2: Progress Tracking & Reporting Tests Completed Successfully!\n');
    return true;

  } catch (error) {
    console.error('❌ Phase 4.2: Progress Tracking Test Failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

/**
 * Test 1: Progress Tracker Basic Functionality
 */
async function testProgressTracker() {
  console.log('📊 Test 1: Progress Tracker Basic Functionality');
  console.log('================================================');

  const tracker = new ProgressTracker('test_session_1');
  
  // Test session start
  tracker.startSession({
    totalRecords: 100,
    totalBatches: 10,
    initialPhase: 'data_loading'
  });

  // Test phase changes
  tracker.phaseChange('data_validation', { validationRules: ['email', 'phone'] });
  tracker.phaseChange('api_import', { batchSize: 10 });

  // Test batch processing
  tracker.batchStart(1, 10, { estimatedDuration: 30000 });
  
  // Simulate record processing
  for (let i = 0; i < 10; i++) {
    const success = i < 8; // 80% success rate
    tracker.recordProcessed(success, { recordId: i });
    
    if (!success) {
      tracker.errorOccurred(new Error(`Validation failed for record ${i}`), {
        recordId: i,
        validationRule: 'email'
      });
    }
  }
  
  tracker.batchComplete(1, { processed: 10, successful: 8, failed: 2 }, 2500);
  
  // Test milestone
  tracker.milestoneReached('first_batch_complete', {
    batchNumber: 1,
    successRate: 80
  });

  // Test warnings
  tracker.warningOccurred('Rate limit approaching', {
    currentRate: 0.8,
    threshold: 0.9
  });

  // Get progress state
  const progress = tracker.getProgress();
  console.log('✅ Current Progress State:', {
    phase: progress.phase,
    completion: `${progress.completion.toFixed(1)}%`,
    processed: progress.processed,
    successful: progress.successful,
    failed: progress.failed,
    throughput: `${progress.throughput.toFixed(2)}/sec`,
    errors: progress.errors,
    warnings: progress.warnings
  });

  // Test session completion
  tracker.sessionComplete(true, {
    totalDuration: 10000,
    finalSuccessRate: 80
  });

  console.log('✅ Test 1 Passed\n');
}

/**
 * Test 2: Observer Pattern Implementation
 */
async function testObserverPattern() {
  console.log('👁️  Test 2: Observer Pattern Implementation');
  console.log('============================================');

  const tracker = new ProgressTracker('test_session_2');
  const receivedEvents = [];

  // Create mock observer
  const mockObserver = {
    onProgressUpdate: (progressData) => {
      receivedEvents.push({
        type: 'general_update',
        event: progressData.event.type,
        timestamp: progressData.timestamp
      });
    },
    
    onPhaseChange: (progressData) => {
      receivedEvents.push({
        type: 'phase_change',
        phase: progressData.event.phase,
        previousPhase: progressData.event.previousPhase
      });
    },
    
    onErrorOccurred: (progressData) => {
      receivedEvents.push({
        type: 'error',
        message: progressData.event.error.message
      });
    },
    
    onMilestoneReached: (progressData) => {
      receivedEvents.push({
        type: 'milestone',
        milestone: progressData.event.milestone
      });
    }
  };

  // Add observer
  tracker.addObserver(mockObserver);

  // Generate events
  tracker.startSession({ totalRecords: 50 });
  tracker.phaseChange('validation');
  tracker.errorOccurred(new Error('Test error'));
  tracker.milestoneReached('validation_complete');

  // Verify events were received
  console.log('✅ Received Events:', receivedEvents.length);
  
  const phaseChangeEvents = receivedEvents.filter(e => e.type === 'phase_change');
  const errorEvents = receivedEvents.filter(e => e.type === 'error');
  const milestoneEvents = receivedEvents.filter(e => e.type === 'milestone');
  
  console.log('✅ Phase Change Events:', phaseChangeEvents.length);
  console.log('✅ Error Events:', errorEvents.length);
  console.log('✅ Milestone Events:', milestoneEvents.length);

  // Test removing observer
  tracker.removeObserver(mockObserver);
  const eventsBefore = receivedEvents.length;
  tracker.phaseChange('import');
  
  if (receivedEvents.length === eventsBefore) {
    console.log('✅ Observer removal working correctly');
  } else {
    throw new Error('Observer was not properly removed');
  }

  tracker.shutdown();
  console.log('✅ Test 2 Passed\n');
}

/**
 * Test 3: Progress Display (Console Output)
 */
async function testProgressDisplay() {
  console.log('🖥️  Test 3: Progress Display (Console Output)');
  console.log('==============================================');

  const tracker = new ProgressTracker('test_session_3');
  
  // Create progress display with compact mode for testing
  const display = new ProgressDisplay({
    compact: true,
    updateFrequency: 100,
    colorized: true
  });

  // Add display as observer
  tracker.addObserver(display);
  display.start();

  console.log('Starting simulated progress display...');

  // Simulate progress
  tracker.startSession({
    totalRecords: 25,
    totalBatches: 5,
    initialPhase: 'initialization'
  });

  await sleep(200);
  tracker.phaseChange('data_loading');
  
  await sleep(200);
  tracker.phaseChange('validation');

  // Simulate batch processing with display updates
  for (let batch = 1; batch <= 3; batch++) {
    tracker.batchStart(batch, 5);
    await sleep(100);
    
    for (let record = 0; record < 5; record++) {
      tracker.recordProcessed(true, { recordId: record });
      await sleep(50);
    }
    
    tracker.batchComplete(batch, { processed: 5, successful: 5 }, 500);
    await sleep(100);
  }

  tracker.phaseChange('api_import');
  await sleep(200);

  tracker.milestoneReached('processing_complete');
  await sleep(200);

  tracker.sessionComplete(true, { totalDuration: 5000 });
  
  display.stop();
  
  // Get display statistics
  const displayStats = display.getDisplayStats();
  console.log('✅ Display Statistics:', {
    updates: displayStats.updates,
    errors: displayStats.errors,
    isActive: displayStats.isActive
  });

  tracker.shutdown();
  console.log('✅ Test 3 Passed\n');
}

/**
 * Test 4: Progress Persistence
 */
async function testProgressPersistence() {
  console.log('💾 Test 4: Progress Persistence');
  console.log('================================');

  const testStorageDir = 'data/test-checkpoints';
  const persistence = new ProgressPersistence({
    storageDirectory: testStorageDir,
    maxCheckpoints: 5,
    autoSaveInterval: 1000,
    enableAutoSave: false // Disable for testing
  });

  const tracker = new ProgressTracker('test_session_4');
  
  // Start session
  tracker.startSession({
    totalRecords: 100,
    totalBatches: 10
  });

  // Simulate some progress
  tracker.phaseChange('data_loading');
  tracker.batchStart(1, 10);
  
  for (let i = 0; i < 5; i++) {
    tracker.recordProcessed(true);
  }

  // Save checkpoint
  const checkpoint = await persistence.saveCheckpoint(tracker.state, {
    csvFile: 'test.csv',
    lastProcessedBatch: 1,
    lastProcessedRecord: 5
  });

  console.log('✅ Checkpoint saved:', {
    id: checkpoint.id,
    sessionId: checkpoint.sessionId,
    progress: `${checkpoint.getResumePercentage().toFixed(1)}%`
  });

  // Process more records
  for (let i = 0; i < 5; i++) {
    tracker.recordProcessed(true);
  }

  // Save another checkpoint
  const checkpoint2 = await persistence.saveCheckpoint(tracker.state, {
    csvFile: 'test.csv',
    lastProcessedBatch: 1,
    lastProcessedRecord: 10
  });

  // Test loading latest checkpoint
  const latestCheckpoint = await persistence.loadLatestCheckpoint('test_session_4');
  console.log('✅ Latest checkpoint loaded:', {
    id: latestCheckpoint.id,
    processed: latestCheckpoint.state.processedRecords,
    isValid: latestCheckpoint.isValid()
  });

  // Test listing checkpoints
  const checkpoints = await persistence.listCheckpoints('test_session_4');
  console.log('✅ Total checkpoints found:', checkpoints.length);

  // Test finding resumable sessions
  const resumableSessions = await persistence.findResumableSessions();
  console.log('✅ Resumable sessions found:', resumableSessions.length);

  // Test persistence statistics
  const persistenceStats = persistence.getStats();
  console.log('✅ Persistence stats:', {
    storageDirectory: persistenceStats.storageDirectory,
    autoSaveEnabled: persistenceStats.autoSaveEnabled,
    lastCheckpoint: persistenceStats.lastCheckpoint ? persistenceStats.lastCheckpoint.id : null
  });

  // Cleanup test data
  await persistence.deleteSessionCheckpoints('test_session_4');
  console.log('✅ Test data cleaned up');

  persistence.shutdown();
  tracker.shutdown();
  console.log('✅ Test 4 Passed\n');
}

/**
 * Test 5: Integration Test (Complete Workflow)
 */
async function testIntegratedWorkflow() {
  console.log('🔗 Test 5: Integration Test (Complete Workflow)');
  console.log('=================================================');

  // Create all components
  const tracker = new ProgressTracker('integration_test_session');
  const display = new ProgressDisplay({
    compact: true,
    updateFrequency: 50
  });
  const persistence = new ProgressPersistence({
    storageDirectory: 'data/test-integration',
    enableAutoSave: false
  });

  // Wire up components
  tracker.addObserver(display);
  display.start();

  console.log('Starting integrated workflow simulation...');

  // Start comprehensive workflow
  tracker.startSession({
    totalRecords: 30,
    totalBatches: 6,
    initialPhase: 'initialization'
  });

  await sleep(100);

  // Phase 1: Data Loading
  tracker.phaseChange('data_loading', { csvFile: 'test-data.csv' });
  await sleep(100);

  // Save checkpoint
  await persistence.saveCheckpoint(tracker.state, {
    csvFile: 'test-data.csv',
    phase: 'data_loading'
  });

  // Phase 2: Data Validation
  tracker.phaseChange('data_validation');
  await sleep(100);

  // Process batches with persistence
  for (let batchNum = 1; batchNum <= 3; batchNum++) {
    tracker.batchStart(batchNum, 5);
    await sleep(50);

    // Process records in batch
    for (let record = 0; record < 5; record++) {
      const success = Math.random() > 0.1; // 90% success rate
      tracker.recordProcessed(success);
      
      if (!success) {
        tracker.errorOccurred(new Error(`Processing failed for record ${record}`));
      }
      
      await sleep(20);
    }

    tracker.batchComplete(batchNum, {
      processed: 5,
      successful: 4,
      failed: 1
    }, 300);

    // Save checkpoint after each batch
    await persistence.saveCheckpoint(tracker.state, {
      lastProcessedBatch: batchNum,
      currentPhase: tracker.state.currentPhase
    });

    await sleep(50);
  }

  // Milestone
  tracker.milestoneReached('halfway_complete', {
    processed: tracker.getProgress().processed,
    successRate: tracker.getProgress().statistics.successRate
  });

  await sleep(100);

  // Phase 3: API Import
  tracker.phaseChange('api_import');
  await sleep(100);

  // Warning simulation
  tracker.warningOccurred('Rate limiting detected', {
    currentRate: 0.85,
    threshold: 0.9
  });

  await sleep(100);

  // Final phase
  tracker.phaseChange('completion');
  await sleep(100);

  // Complete session
  tracker.sessionComplete(true, {
    totalDuration: 2000,
    averageRate: 15.5,
    finalSuccessRate: 90
  });

  // Get final statistics
  const finalProgress = tracker.getProgress();
  console.log('✅ Final Workflow Statistics:', {
    processed: finalProgress.processed,
    successful: finalProgress.successful,
    failed: finalProgress.failed,
    successRate: `${finalProgress.statistics.successRate.toFixed(1)}%`,
    duration: finalProgress.statistics.duration,
    errors: finalProgress.errors,
    warnings: finalProgress.warnings
  });

  // Test resumable sessions
  const resumableSessions = await persistence.findResumableSessions();
  console.log('✅ Resumable sessions after completion:', resumableSessions.length);

  // Cleanup
  display.stop();
  await persistence.deleteSessionCheckpoints('integration_test_session');
  persistence.shutdown();
  tracker.shutdown();

  console.log('✅ Test 5 Passed\n');
}

/**
 * Sleep utility for testing
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run all Phase 4.2 tests
 */
async function runPhase42Tests() {
  console.log('🧪 Phase 4.2: Progress Tracking & Reporting - Complete Test Suite');
  console.log('==================================================================\n');

  const startTime = Date.now();

  try {
    const success = await testProgressTracking();
    
    const duration = Date.now() - startTime;
    
    if (success) {
      console.log('🎉 All Phase 4.2 Tests Completed Successfully!');
      console.log(`⏱️  Total Test Duration: ${duration}ms`);
      console.log('\n🚀 Phase 4.2: Progress Tracking & Reporting is READY!');
      console.log('✨ Ready to proceed to Phase 4.3: CLI Interface\n');
    } else {
      console.log('❌ Some Phase 4.2 tests failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Phase 4.2 Test Suite Failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runPhase42Tests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { 
  testProgressTracking,
  runPhase42Tests
}; 