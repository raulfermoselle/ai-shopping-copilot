/**
 * Tests for Coordinator Session Persistence
 *
 * Validates serialization, storage, recovery, and cleanup operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  serializeSession,
  deserializeSession,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  canResume,
  getResumePoint,
  cleanupOldSessions,
} from '../persistence.js';
import { createSession, createError } from '../types.js';
import type { CoordinatorSession } from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal test session.
 */
function createTestSession(overrides?: Partial<CoordinatorSession>): CoordinatorSession {
  const base = createSession('test-session-123', 'test@example.com', 'household-1');
  return {
    ...base,
    ...overrides,
  };
}

/**
 * Create a session with CartBuilder results.
 */
function createSessionWithCartBuilder(): CoordinatorSession {
  const session = createTestSession();
  session.status = 'loading_cart';
  session.workers.cartBuilder = {
    success: true,
    durationMs: 5000,
    report: {
      timestamp: new Date('2024-01-15T10:00:00Z'),
      sessionId: session.sessionId,
      ordersAnalyzed: ['order-1', 'order-2'],
      cart: {
        before: {
          timestamp: new Date('2024-01-15T09:58:00Z'),
          items: [],
          itemCount: 0,
          totalPrice: 0,
        },
        after: {
          timestamp: new Date('2024-01-15T10:00:00Z'),
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
        added: [
          {
            name: 'Test Product',
            quantity: 2,
            unitPrice: 5.99,
            sourceOrders: ['order-1'],
          },
        ],
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
  return session;
}

/**
 * Create a session with errors.
 */
function createSessionWithErrors(): CoordinatorSession {
  const session = createTestSession();
  session.status = 'authenticating';
  session.errors.push(
    createError('AUTH_FAILED', 'Invalid credentials', 'error', 'login', {
      username: 'test@example.com',
    })
  );
  return session;
}

/**
 * Create a completed session with review pack.
 */
function createCompletedSession(): CoordinatorSession {
  const session = createSessionWithCartBuilder();
  session.status = 'review_ready';
  session.endTime = new Date('2024-01-15T10:05:00Z');
  session.reviewPack = {
    sessionId: session.sessionId,
    generatedAt: new Date('2024-01-15T10:04:00Z'),
    householdId: session.householdId,
    cart: {
      summary: {
        itemCount: 1,
        totalPrice: 11.98,
        currency: 'EUR',
      },
      diff: {
        added: [
          {
            name: 'Test Product',
            quantity: 2,
            unitPrice: 5.99,
            sourceOrders: ['order-1'],
          },
        ],
        removed: [],
        quantityChanged: [],
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
      before: [],
      after: [
        {
          name: 'Test Product',
          quantity: 2,
          unitPrice: 5.99,
          totalPrice: 11.98,
          available: true,
        },
      ],
    },
    warnings: [],
    actions: [
      {
        id: 'approve',
        type: 'approve_cart',
        description: 'Approve cart',
        enabled: true,
      },
    ],
    confidence: {
      cartAccuracy: 0.95,
      dataQuality: 0.9,
      sourceOrders: ['order-1'],
    },
  };
  return session;
}

// =============================================================================
// Test Setup
// =============================================================================

describe('Coordinator Persistence', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    testDir = path.join(tmpdir(), `test-sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Serialization Tests
  // ===========================================================================

  describe('serializeSession', () => {
    it('should serialize a minimal session', () => {
      const session = createTestSession();
      const serialized = serializeSession(session);

      expect(serialized.sessionId).toBe(session.sessionId);
      expect(serialized.username).toBe(session.username);
      expect(serialized.householdId).toBe(session.householdId);
      expect(serialized.status).toBe(session.status);
      expect(serialized.startTime).toBe(session.startTime.toISOString());
      expect(serialized.endTime).toBeUndefined();
      expect(serialized.workers.cartBuilder).toBeNull();
      expect(serialized.reviewPack).toBeNull();
      expect(serialized.errors).toEqual([]);
      expect(serialized.screenshots).toEqual([]);
    });

    it('should serialize Date objects to ISO strings', () => {
      const session = createTestSession({
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
      });
      const serialized = serializeSession(session);

      expect(serialized.startTime).toBe('2024-01-15T10:00:00.000Z');
      expect(serialized.endTime).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should serialize session with CartBuilder results', () => {
      const session = createSessionWithCartBuilder();
      const serialized = serializeSession(session);

      expect(serialized.workers.cartBuilder).toBeDefined();
      expect(serialized.workers.cartBuilder?.success).toBe(true);
      expect(serialized.workers.cartBuilder?.durationMs).toBe(5000);
      expect(serialized.workers.cartBuilder?.report).toBeDefined();

      // Check that report dates are serialized
      const report = serialized.workers.cartBuilder?.report as any;
      expect(typeof report.timestamp).toBe('string');
    });

    it('should serialize session with errors', () => {
      const session = createSessionWithErrors();
      const serialized = serializeSession(session);

      expect(serialized.errors).toHaveLength(1);
      const error = serialized.errors[0];
      if (!error) {
        throw new Error('Expected error to be defined');
      }
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.message).toBe('Invalid credentials');
      expect(error.severity).toBe('error');
      expect(error.source).toBe('login');
      expect(typeof error.timestamp).toBe('string');
    });

    it('should serialize completed session with review pack', () => {
      const session = createCompletedSession();
      const serialized = serializeSession(session);

      expect(serialized.status).toBe('review_ready');
      expect(serialized.endTime).toBeDefined();
      expect(serialized.reviewPack).toBeDefined();

      // Check that review pack generatedAt is serialized
      const reviewPack = serialized.reviewPack as any;
      expect(typeof reviewPack.generatedAt).toBe('string');
    });

    it('should handle null/undefined fields', () => {
      const session = createTestSession({
        endTime: undefined,
      });
      session.workers.cartBuilder = null;
      session.reviewPack = null;

      const serialized = serializeSession(session);

      expect(serialized.endTime).toBeUndefined();
      expect(serialized.workers.cartBuilder).toBeNull();
      expect(serialized.reviewPack).toBeNull();
    });
  });

  // ===========================================================================
  // Deserialization Tests
  // ===========================================================================

  describe('deserializeSession', () => {
    it('should deserialize a minimal session', () => {
      const original = createTestSession();
      const serialized = serializeSession(original);
      const deserialized = deserializeSession(serialized);

      expect(deserialized.sessionId).toBe(original.sessionId);
      expect(deserialized.username).toBe(original.username);
      expect(deserialized.householdId).toBe(original.householdId);
      expect(deserialized.status).toBe(original.status);
      expect(deserialized.startTime).toBeInstanceOf(Date);
      expect(deserialized.startTime.getTime()).toBe(original.startTime.getTime());
    });

    it('should restore Date objects from ISO strings', () => {
      const original = createTestSession({
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
      });
      const serialized = serializeSession(original);
      const deserialized = deserializeSession(serialized);

      expect(deserialized.startTime).toBeInstanceOf(Date);
      expect(deserialized.endTime).toBeInstanceOf(Date);
      expect(deserialized.startTime.toISOString()).toBe('2024-01-15T10:00:00.000Z');
      expect(deserialized.endTime?.toISOString()).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should deserialize session with CartBuilder results', () => {
      const original = createSessionWithCartBuilder();
      const serialized = serializeSession(original);
      const deserialized = deserializeSession(serialized);

      expect(deserialized.workers.cartBuilder).toBeDefined();
      expect(deserialized.workers.cartBuilder?.success).toBe(true);
      expect(deserialized.workers.cartBuilder?.report).toBeDefined();

      // Check that report dates are restored
      const report = deserialized.workers.cartBuilder?.report as any;
      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it('should deserialize session with errors', () => {
      const original = createSessionWithErrors();
      const serialized = serializeSession(original);
      const deserialized = deserializeSession(serialized);

      expect(deserialized.errors).toHaveLength(1);
      const error = deserialized.errors[0];
      if (!error) {
        throw new Error('Expected error to be defined');
      }
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.code).toBe('AUTH_FAILED');
    });

    it('should roundtrip serialize/deserialize without data loss', () => {
      const original = createCompletedSession();
      const serialized = serializeSession(original);
      const deserialized = deserializeSession(serialized);

      // Compare key fields
      expect(deserialized.sessionId).toBe(original.sessionId);
      expect(deserialized.status).toBe(original.status);
      expect(deserialized.startTime.getTime()).toBe(original.startTime.getTime());
      expect(deserialized.endTime?.getTime()).toBe(original.endTime?.getTime());
      expect(deserialized.workers.cartBuilder?.success).toBe(
        original.workers.cartBuilder?.success
      );
      expect(deserialized.reviewPack).toBeDefined();
    });

    it('should throw on invalid session data', () => {
      const invalid = {
        sessionId: 'test',
        // Missing required fields
      };

      expect(() => deserializeSession(invalid as any)).toThrow();
    });
  });

  // ===========================================================================
  // Storage Tests
  // ===========================================================================

  describe('saveSession', () => {
    it('should save session to disk', async () => {
      const session = createTestSession();
      const filePath = await saveSession(session, testDir);

      expect(filePath).toContain(session.sessionId);
      expect(filePath).toContain('.json');

      // Verify file exists
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const session = createTestSession();
      const newDir = path.join(testDir, 'nested', 'dir');
      const filePath = await saveSession(session, newDir);

      // Verify file was created in nested directory
      expect(filePath).toContain('nested');
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('should overwrite existing session file', async () => {
      const session1 = createTestSession();
      const filePath1 = await saveSession(session1, testDir);

      // Modify session and save again
      const session2 = { ...session1, status: 'authenticating' as const };
      const filePath2 = await saveSession(session2, testDir);

      expect(filePath1).toBe(filePath2);

      // Verify content was updated
      const loaded = await loadSession(session1.sessionId, testDir);
      expect(loaded?.status).toBe('authenticating');
    });

    it('should save session with CartBuilder results', async () => {
      const session = createSessionWithCartBuilder();
      const filePath = await saveSession(session, testDir);

      // Verify file exists and is valid JSON
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.workers.cartBuilder).toBeDefined();
      expect(parsed.workers.cartBuilder.success).toBe(true);
    });

    it('should save session with review pack', async () => {
      const session = createCompletedSession();
      const filePath = await saveSession(session, testDir);

      // Verify file exists and contains review pack
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.reviewPack).toBeDefined();
      expect(parsed.reviewPack.sessionId).toBe(session.sessionId);
    });
  });

  describe('loadSession', () => {
    it('should load saved session', async () => {
      const original = createTestSession();
      await saveSession(original, testDir);

      const loaded = await loadSession(original.sessionId, testDir);

      expect(loaded).toBeDefined();
      expect(loaded?.sessionId).toBe(original.sessionId);
      expect(loaded?.username).toBe(original.username);
      expect(loaded?.householdId).toBe(original.householdId);
    });

    it('should return null for non-existent session', async () => {
      const loaded = await loadSession('non-existent-id', testDir);
      expect(loaded).toBeNull();
    });

    it('should load session with CartBuilder results', async () => {
      const original = createSessionWithCartBuilder();
      await saveSession(original, testDir);

      const loaded = await loadSession(original.sessionId, testDir);

      expect(loaded?.workers.cartBuilder).toBeDefined();
      expect(loaded?.workers.cartBuilder?.success).toBe(true);
      expect(loaded?.workers.cartBuilder?.report).toBeDefined();
    });

    it('should load session with review pack', async () => {
      const original = createCompletedSession();
      await saveSession(original, testDir);

      const loaded = await loadSession(original.sessionId, testDir);

      expect(loaded?.reviewPack).toBeDefined();
      expect(loaded?.status).toBe('review_ready');
    });

    it('should throw on corrupted session file', async () => {
      const sessionId = 'corrupted-session';
      const filePath = path.join(testDir, `${sessionId}.json`);

      // Write invalid JSON
      await fs.writeFile(filePath, '{ invalid json', 'utf-8');

      await expect(loadSession(sessionId, testDir)).rejects.toThrow();
    });

    it('should throw on invalid session schema', async () => {
      const sessionId = 'invalid-session';
      const filePath = path.join(testDir, `${sessionId}.json`);

      // Write valid JSON but invalid schema
      await fs.writeFile(filePath, JSON.stringify({ sessionId }), 'utf-8');

      await expect(loadSession(sessionId, testDir)).rejects.toThrow();
    });
  });

  describe('listSessions', () => {
    it('should return empty array for empty directory', async () => {
      const sessions = await listSessions(testDir);
      expect(sessions).toEqual([]);
    });

    it('should return empty array for non-existent directory', async () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');
      const sessions = await listSessions(nonExistentDir);
      expect(sessions).toEqual([]);
    });

    it('should list all session IDs', async () => {
      const session1 = createTestSession({ sessionId: 'session-1' });
      const session2 = createTestSession({ sessionId: 'session-2' });
      const session3 = createTestSession({ sessionId: 'session-3' });

      await saveSession(session1, testDir);
      await saveSession(session2, testDir);
      await saveSession(session3, testDir);

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions).toContain('session-3');
    });

    it('should sort sessions by modification time (newest first)', async () => {
      const session1 = createTestSession({ sessionId: 'session-1' });
      await saveSession(session1, testDir);

      // Wait 10ms to ensure different mtimes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = createTestSession({ sessionId: 'session-2' });
      await saveSession(session2, testDir);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session3 = createTestSession({ sessionId: 'session-3' });
      await saveSession(session3, testDir);

      const sessions = await listSessions(testDir);

      // Newest session should be first
      expect(sessions[0]).toBe('session-3');
      expect(sessions[2]).toBe('session-1');
    });

    it('should ignore non-JSON files', async () => {
      const session = createTestSession();
      await saveSession(session, testDir);

      // Create non-JSON file
      await fs.writeFile(path.join(testDir, 'README.md'), '# Sessions', 'utf-8');

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe(session.sessionId);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', async () => {
      const session = createTestSession();
      await saveSession(session, testDir);

      const deleted = await deleteSession(session.sessionId, testDir);

      expect(deleted).toBe(true);

      // Verify file no longer exists
      const loaded = await loadSession(session.sessionId, testDir);
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent session', async () => {
      const deleted = await deleteSession('non-existent-id', testDir);
      expect(deleted).toBe(false);
    });

    it('should remove session from list', async () => {
      const session1 = createTestSession({ sessionId: 'session-1' });
      const session2 = createTestSession({ sessionId: 'session-2' });

      await saveSession(session1, testDir);
      await saveSession(session2, testDir);

      await deleteSession(session1.sessionId, testDir);

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe('session-2');
    });
  });

  // ===========================================================================
  // Recovery Tests
  // ===========================================================================

  describe('canResume', () => {
    it('should return true for initializing session', () => {
      const session = createTestSession({ status: 'initializing' });
      expect(canResume(session)).toBe(true);
    });

    it('should return true for authenticating session', () => {
      const session = createTestSession({ status: 'authenticating' });
      expect(canResume(session)).toBe(true);
    });

    it('should return true for loading_cart session', () => {
      const session = createTestSession({ status: 'loading_cart' });
      expect(canResume(session)).toBe(true);
    });

    it('should return true for generating_review session', () => {
      const session = createTestSession({ status: 'generating_review' });
      expect(canResume(session)).toBe(true);
    });

    it('should return true for review_ready session', () => {
      const session = createTestSession({ status: 'review_ready' });
      expect(canResume(session)).toBe(true);
    });

    it('should return false for completed session', () => {
      const session = createTestSession({ status: 'completed' });
      expect(canResume(session)).toBe(false);
    });

    it('should return false for cancelled session', () => {
      const session = createTestSession({ status: 'cancelled' });
      expect(canResume(session)).toBe(false);
    });

    it('should return false for session with fatal error', () => {
      const session = createTestSession({ status: 'loading_cart' });
      session.errors.push(
        createError('FATAL_ERROR', 'System failure', 'fatal', 'coordinator')
      );
      expect(canResume(session)).toBe(false);
    });
  });

  describe('getResumePoint', () => {
    it('should return current status for resumable session', () => {
      const session = createTestSession({ status: 'loading_cart' });
      expect(getResumePoint(session)).toBe('loading_cart');
    });

    it('should return initializing for initializing session', () => {
      const session = createTestSession({ status: 'initializing' });
      expect(getResumePoint(session)).toBe('initializing');
    });

    it('should return authenticating for authenticating session', () => {
      const session = createTestSession({ status: 'authenticating' });
      expect(getResumePoint(session)).toBe('authenticating');
    });

    it('should return generating_review for generating_review session', () => {
      const session = createTestSession({ status: 'generating_review' });
      expect(getResumePoint(session)).toBe('generating_review');
    });

    it('should throw for completed session', () => {
      const session = createTestSession({ status: 'completed' });
      expect(() => getResumePoint(session)).toThrow(/Cannot resume session/);
    });

    it('should throw for cancelled session', () => {
      const session = createTestSession({ status: 'cancelled' });
      expect(() => getResumePoint(session)).toThrow(/Cannot resume session/);
    });

    it('should throw for session with fatal error', () => {
      const session = createTestSession({ status: 'loading_cart' });
      session.errors.push(
        createError('FATAL_ERROR', 'System failure', 'fatal', 'coordinator')
      );
      expect(() => getResumePoint(session)).toThrow(/Cannot resume session/);
    });
  });

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================

  describe('cleanupOldSessions', () => {
    it('should delete completed sessions older than maxAge', async () => {
      const oldSession = createTestSession({
        sessionId: 'old-session',
        status: 'completed',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        endTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      const newSession = createTestSession({
        sessionId: 'new-session',
        status: 'completed',
        startTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        endTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });

      await saveSession(oldSession, testDir);
      await saveSession(newSession, testDir);

      // Clean up sessions older than 7 days
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      expect(deletedCount).toBe(1);

      const sessions = await listSessions(testDir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe('new-session');
    });

    it('should delete cancelled sessions older than maxAge', async () => {
      const oldSession = createTestSession({
        sessionId: 'old-cancelled',
        status: 'cancelled',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      await saveSession(oldSession, testDir);

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      expect(deletedCount).toBe(1);

      const sessions = await listSessions(testDir);
      expect(sessions).toHaveLength(0);
    });

    it('should not delete in-progress sessions', async () => {
      const activeSession = createTestSession({
        sessionId: 'active-session',
        status: 'loading_cart',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      await saveSession(activeSession, testDir);

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      expect(deletedCount).toBe(0);

      const sessions = await listSessions(testDir);
      expect(sessions).toHaveLength(1);
    });

    it('should use startTime for sessions without endTime', async () => {
      const oldSession = createTestSession({
        sessionId: 'old-no-end',
        status: 'completed',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        // No endTime
      });

      await saveSession(oldSession, testDir);

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      expect(deletedCount).toBe(1);
    });

    it('should return 0 for empty directory', async () => {
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);
      expect(deletedCount).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Create a valid session
      const session1 = createTestSession({
        sessionId: 'valid-session',
        status: 'completed',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      await saveSession(session1, testDir);

      // Create a corrupted session file
      await fs.writeFile(
        path.join(testDir, 'corrupted.json'),
        '{ invalid json',
        'utf-8'
      );

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      // Should delete the valid session, skip the corrupted one
      expect(deletedCount).toBe(1);
    });

    it('should delete multiple old sessions', async () => {
      const old1 = createTestSession({
        sessionId: 'old-1',
        status: 'completed',
        startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      const old2 = createTestSession({
        sessionId: 'old-2',
        status: 'completed',
        startTime: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      });

      const old3 = createTestSession({
        sessionId: 'old-3',
        status: 'cancelled',
        startTime: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      });

      const recent = createTestSession({
        sessionId: 'recent',
        status: 'completed',
        startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      });

      await saveSession(old1, testDir);
      await saveSession(old2, testDir);
      await saveSession(old3, testDir);
      await saveSession(recent, testDir);

      const maxAge = 7 * 24 * 60 * 60 * 1000;
      const deletedCount = await cleanupOldSessions(maxAge, testDir);

      expect(deletedCount).toBe(3);

      const sessions = await listSessions(testDir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toBe('recent');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('Integration: Save, Load, Resume', () => {
    it('should persist and recover session state across save/load', async () => {
      // Create a session with CartBuilder in progress
      const original = createSessionWithCartBuilder();
      await saveSession(original, testDir);

      // Simulate crash/restart - load session from disk
      const loaded = await loadSession(original.sessionId, testDir);

      expect(loaded).toBeDefined();
      expect(canResume(loaded!)).toBe(true);

      const resumePoint = getResumePoint(loaded!);
      expect(resumePoint).toBe('loading_cart');
    });

    it('should handle complete session lifecycle', async () => {
      // 1. Create and save initializing session
      const session = createTestSession();
      await saveSession(session, testDir);

      // 2. Update to authenticating
      session.status = 'authenticating';
      await saveSession(session, testDir);

      // 3. Update to loading_cart with CartBuilder result
      session.status = 'loading_cart';
      session.workers.cartBuilder = {
        success: true,
        durationMs: 5000,
      };
      await saveSession(session, testDir);

      // 4. Update to review_ready
      session.status = 'review_ready';
      session.endTime = new Date();
      await saveSession(session, testDir);

      // 5. Load final state
      const loaded = await loadSession(session.sessionId, testDir);

      expect(loaded?.status).toBe('review_ready');
      expect(loaded?.endTime).toBeDefined();
      expect(loaded?.workers.cartBuilder?.success).toBe(true);
    });
  });
});
