/**
 * Usage Examples for Coordinator Session Persistence
 *
 * This file demonstrates how to use the persistence module for:
 * - Saving and loading sessions
 * - Recovering from interruptions
 * - Managing session lifecycle
 * - Cleanup operations
 */

import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  canResume,
  getResumePoint,
  cleanupOldSessions,
} from '../persistence.js';
import { createSession } from '../types.js';

// =============================================================================
// Example 1: Basic Session Persistence
// =============================================================================

async function example1_BasicPersistence() {
  console.log('=== Example 1: Basic Session Persistence ===\n');

  // Create a new session
  const session = createSession(
    'session-' + Date.now(),
    'user@example.com',
    'household-123'
  );

  console.log('1. Created session:', session.sessionId);

  // Update session state
  session.status = 'authenticating';
  console.log('2. Updated status to:', session.status);

  // Save session to disk
  const filePath = await saveSession(session);
  console.log('3. Saved session to:', filePath);

  // Load session back
  const loaded = await loadSession(session.sessionId);
  console.log('4. Loaded session:', loaded?.sessionId);
  console.log('   Status:', loaded?.status);
  console.log('   Username:', loaded?.username);
}

// =============================================================================
// Example 2: Session Recovery After Interruption
// =============================================================================

async function example2_SessionRecovery() {
  console.log('\n=== Example 2: Session Recovery ===\n');

  // Simulate an interrupted session
  const session = createSession(
    'session-interrupted',
    'user@example.com',
    'household-123'
  );

  // Session was in progress when interrupted
  session.status = 'loading_cart';
  session.workers.cartBuilder = {
    success: false, // In progress
    durationMs: 0,
  };

  // Save the interrupted session
  await saveSession(session);
  console.log('1. Saved interrupted session (status: loading_cart)');

  // Later, on restart...
  const recovered = await loadSession(session.sessionId);

  if (recovered && canResume(recovered)) {
    console.log('2. Session can be resumed!');

    const resumePoint = getResumePoint(recovered);
    console.log('3. Resume from status:', resumePoint);

    // Resume execution from the appropriate state
    switch (resumePoint) {
      case 'initializing':
        console.log('   → Restart initialization');
        break;
      case 'authenticating':
        console.log('   → Retry authentication');
        break;
      case 'loading_cart':
        console.log('   → Continue cart loading');
        break;
      case 'generating_review':
        console.log('   → Regenerate review pack');
        break;
      case 'review_ready':
        console.log('   → Session already complete');
        break;
    }
  } else {
    console.log('2. Session cannot be resumed');
  }

  // Clean up
  await deleteSession(session.sessionId);
}

// =============================================================================
// Example 3: Complete Session Lifecycle
// =============================================================================

async function example3_CompleteLifecycle() {
  console.log('\n=== Example 3: Complete Session Lifecycle ===\n');

  const session = createSession('session-lifecycle', 'user@example.com', 'household-123');

  // 1. Initializing
  session.status = 'initializing';
  await saveSession(session);
  console.log('1. Session created:', session.sessionId);

  // 2. Authenticating
  session.status = 'authenticating';
  await saveSession(session);
  console.log('2. Authenticating...');

  // 3. Loading cart
  session.status = 'loading_cart';
  session.workers.cartBuilder = {
    success: true,
    durationMs: 5000,
    report: {
      timestamp: new Date(),
      sessionId: session.sessionId,
      ordersAnalyzed: ['order-1', 'order-2'],
      cart: {
        before: { timestamp: new Date(), items: [], itemCount: 0, totalPrice: 0 },
        after: {
          timestamp: new Date(),
          items: [
            {
              productId: 'prod-1',
              name: 'Test Product',
              quantity: 2,
              unitPrice: 5.99,
              available: true,
            },
          ],
          itemCount: 1,
          totalPrice: 11.98,
        },
      },
      diff: {
        added: [{ name: 'Test Product', quantity: 2, unitPrice: 5.99 }],
        removed: [],
        quantityChanged: [],
        unchanged: [],
        summary: {
          addedCount: 1,
          removedCount: 0,
          changedCount: 0,
          unchangedCount: 0,
          totalItems: 1,
          priceDifference: 11.98,
          newTotalPrice: 11.98,
        },
      },
      confidence: 0.95,
      warnings: [],
      screenshots: [],
    },
  };
  await saveSession(session);
  console.log('3. Cart loaded (1 item added)');

  // 4. Generating review
  session.status = 'generating_review';
  await saveSession(session);
  console.log('4. Generating review pack...');

  // 5. Review ready
  session.status = 'review_ready';
  session.endTime = new Date();
  await saveSession(session);
  console.log('5. Review ready - session complete!');

  // Verify final state
  const final = await loadSession(session.sessionId);
  console.log('\nFinal state:');
  console.log('  Status:', final?.status);
  console.log('  Duration:', final?.endTime && final.startTime ?
    `${(final.endTime.getTime() - final.startTime.getTime()) / 1000}s` : 'N/A');
  console.log('  CartBuilder success:', final?.workers.cartBuilder?.success);

  // Clean up
  await deleteSession(session.sessionId);
}

// =============================================================================
// Example 4: Listing and Managing Multiple Sessions
// =============================================================================

async function example4_ManageSessions() {
  console.log('\n=== Example 4: Managing Multiple Sessions ===\n');

  // Create multiple sessions
  const sessions = [];
  for (let i = 1; i <= 3; i++) {
    const session = createSession(`session-${i}`, 'user@example.com', 'household-123');
    session.status = i === 3 ? 'completed' : 'loading_cart';
    if (i === 3) {
      session.endTime = new Date();
    }
    await saveSession(session);
    sessions.push(session);
  }
  console.log('1. Created 3 sessions');

  // List all sessions
  const sessionIds = await listSessions();
  console.log('2. Found sessions:', sessionIds.length);
  sessionIds.forEach((id, i) => console.log(`   ${i + 1}. ${id}`));

  // Check resumability
  console.log('\n3. Checking resumability:');
  for (const id of sessionIds) {
    const session = await loadSession(id);
    if (session) {
      const resumable = canResume(session);
      console.log(`   ${id}: ${resumable ? 'Resumable' : 'Not resumable'} (${session.status})`);
    }
  }

  // Clean up all
  console.log('\n4. Cleaning up:');
  for (const id of sessionIds) {
    const deleted = await deleteSession(id);
    console.log(`   Deleted ${id}: ${deleted}`);
  }
}

// =============================================================================
// Example 5: Cleanup Old Sessions
// =============================================================================

async function example5_CleanupOldSessions() {
  console.log('\n=== Example 5: Cleanup Old Sessions ===\n');

  // Create old completed session
  const oldSession = createSession('old-session', 'user@example.com', 'household-123');
  oldSession.status = 'completed';
  oldSession.startTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
  oldSession.endTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await saveSession(oldSession);
  console.log('1. Created old session (10 days ago)');

  // Create recent session
  const recentSession = createSession('recent-session', 'user@example.com', 'household-123');
  recentSession.status = 'completed';
  recentSession.endTime = new Date();
  await saveSession(recentSession);
  console.log('2. Created recent session (today)');

  // List before cleanup
  let sessions = await listSessions();
  console.log('\n3. Before cleanup:', sessions.length, 'sessions');

  // Clean up sessions older than 7 days
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const deletedCount = await cleanupOldSessions(maxAge);
  console.log('4. Cleanup deleted:', deletedCount, 'sessions');

  // List after cleanup
  sessions = await listSessions();
  console.log('5. After cleanup:', sessions.length, 'sessions');
  sessions.forEach((id) => console.log(`   - ${id}`));

  // Clean up remaining
  await deleteSession(recentSession.sessionId);
}

// =============================================================================
// Example 6: Error Handling
// =============================================================================

async function example6_ErrorHandling() {
  console.log('\n=== Example 6: Error Handling ===\n');

  // 1. Loading non-existent session
  console.log('1. Loading non-existent session:');
  const notFound = await loadSession('does-not-exist');
  console.log('   Result:', notFound === null ? 'null (as expected)' : 'unexpected');

  // 2. Deleting non-existent session
  console.log('\n2. Deleting non-existent session:');
  const deleted = await deleteSession('does-not-exist');
  console.log('   Result:', deleted ? 'deleted' : 'false (as expected)');

  // 3. Checking resumability of completed session
  console.log('\n3. Resumability of completed session:');
  const completed = createSession('completed-session', 'user@example.com', 'household-123');
  completed.status = 'completed';
  completed.endTime = new Date();
  console.log('   Can resume:', canResume(completed) ? 'yes' : 'no (as expected)');

  // 4. Getting resume point for completed session
  console.log('\n4. Resume point for completed session:');
  try {
    getResumePoint(completed);
    console.log('   Unexpected: No error thrown');
  } catch (error) {
    console.log('   Expected error:', error instanceof Error ? error.message : 'unknown');
  }
}

// =============================================================================
// Run Examples
// =============================================================================

async function runAllExamples() {
  try {
    await example1_BasicPersistence();
    await example2_SessionRecovery();
    await example3_CompleteLifecycle();
    await example4_ManageSessions();
    await example5_CleanupOldSessions();
    await example6_ErrorHandling();

    console.log('\n=== All Examples Complete ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Only run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  example1_BasicPersistence,
  example2_SessionRecovery,
  example3_CompleteLifecycle,
  example4_ManageSessions,
  example5_CleanupOldSessions,
  example6_ErrorHandling,
};
