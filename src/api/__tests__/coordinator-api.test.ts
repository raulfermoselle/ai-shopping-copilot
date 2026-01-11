/**
 * Unit Tests for Coordinator API
 *
 * Tests for all REST API endpoints:
 * - POST /api/coordinator/session/start
 * - GET  /api/coordinator/session/:id
 * - GET  /api/coordinator/session/:id/review-pack
 * - POST /api/coordinator/session/:id/approve
 * - POST /api/coordinator/session/:id/cancel
 *
 * Test Categories:
 * - Request validation (Zod schemas)
 * - Success cases
 * - Error cases (404, 400, 500)
 * - Session state transitions
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleStartSession,
  handleGetSession,
  handleGetReviewPack,
  handleApproveSession,
  handleCancelSession,
  clearAllSessions,
  injectMockSession,
  getSessionRecord,
  getSessionCount,
  configureContextFactory,
} from '../coordinator-api.js';
import { API_ERROR_CODES, statusToProgress } from '../types.js';
import type { ReviewPack } from '../../agents/coordinator/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal valid ReviewPack for testing.
 */
function createMockReviewPack(sessionId: string): ReviewPack {
  return {
    sessionId,
    generatedAt: new Date(),
    householdId: 'test-household',
    cart: {
      summary: {
        itemCount: 5,
        totalPrice: 50.0,
        currency: 'EUR',
      },
      diff: {
        added: [],
        removed: [],
        quantityChanged: [],
        summary: {
          addedCount: 0,
          removedCount: 0,
          changedCount: 0,
          unchangedCount: 5,
          totalItems: 5,
          priceDifference: 0,
          newTotalPrice: 50.0,
        },
      },
      before: [],
      after: [
        {
          name: 'Test Product',
          quantity: 1,
          unitPrice: 10.0,
          totalPrice: 10.0,
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
      dataQuality: 1.0,
      sourceOrders: ['order-1'],
    },
  };
}

// =============================================================================
// Test Setup
// =============================================================================

describe('Coordinator API', () => {
  beforeEach(() => {
    clearAllSessions();
    // Reset context factory to null for most tests
    configureContextFactory(null as unknown as Parameters<typeof configureContextFactory>[0]);
  });

  afterEach(() => {
    clearAllSessions();
  });

  // ===========================================================================
  // POST /api/coordinator/session/start
  // ===========================================================================

  describe('handleStartSession', () => {
    describe('request validation', () => {
      it('should reject request with missing username', async () => {
        const result = await handleStartSession({
          householdId: 'household-1',
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.VALIDATION_ERROR);
          expect(result.body.details?.issues).toBeDefined();
        }
      });

      it('should reject request with invalid email format', async () => {
        const result = await handleStartSession({
          username: 'not-an-email',
          householdId: 'household-1',
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should reject request with missing householdId', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
      });

      it('should reject request with empty householdId', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: '',
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
      });

      it('should reject request with invalid config values', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
          config: {
            maxOrdersToLoad: -5, // Invalid: must be positive
          },
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
      });

      it('should accept valid request with minimal fields', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result.statusCode).toBe(201);
        expect(result.body.success).toBe(true);
      });

      it('should accept valid request with optional config', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
          config: {
            maxOrdersToLoad: 5,
            includeFavorites: true,
          },
        });

        expect(result.statusCode).toBe(201);
        expect(result.body.success).toBe(true);
      });
    });

    describe('success cases', () => {
      it('should return 201 with session ID', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result.statusCode).toBe(201);
        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.sessionId).toBeDefined();
          expect(result.body.data.sessionId).toMatch(/^sess_[a-f0-9]{16}$/);
        }
      });

      it('should return initializing status', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.status).toBe('initializing');
        }
      });

      it('should include helpful message', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.message).toContain('Poll for status');
        }
      });

      it('should store session in memory', async () => {
        const result = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          const record = getSessionRecord(result.body.data.sessionId);
          expect(record).toBeDefined();
          expect(record?.session.username).toBe('test@example.com');
          expect(record?.session.householdId).toBe('household-1');
        }
      });

      it('should increment session count', async () => {
        expect(getSessionCount()).toBe(0);

        await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(getSessionCount()).toBe(1);

        await handleStartSession({
          username: 'test2@example.com',
          householdId: 'household-2',
        });

        expect(getSessionCount()).toBe(2);
      });

      it('should generate unique session IDs', async () => {
        const result1 = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        const result2 = await handleStartSession({
          username: 'test@example.com',
          householdId: 'household-1',
        });

        expect(result1.body.success).toBe(true);
        expect(result2.body.success).toBe(true);

        if (result1.body.success && result2.body.success) {
          expect(result1.body.data.sessionId).not.toBe(result2.body.data.sessionId);
        }
      });
    });
  });

  // ===========================================================================
  // GET /api/coordinator/session/:id
  // ===========================================================================

  describe('handleGetSession', () => {
    describe('error cases', () => {
      it('should return 404 for non-existent session', async () => {
        const result = await handleGetSession('non-existent-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_NOT_FOUND);
        }
      });
    });

    describe('success cases', () => {
      it('should return 200 with session data', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleGetSession('test-session');

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should return correct session status', async () => {
        injectMockSession('test-session', {
          status: 'authenticating',
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.status).toBe('authenticating');
        }
      });

      it('should return progress information', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.progress).toBeDefined();
          expect(result.body.data.progress.currentStep).toBe('Loading cart');
          expect(result.body.data.progress.percentComplete).toBeGreaterThan(0);
        }
      });

      it('should indicate reviewPackReady when status is review_ready', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.reviewPackReady).toBe(true);
        }
      });

      it('should indicate reviewPackReady false when not ready', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.reviewPackReady).toBe(false);
        }
      });

      it('should include errors array', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
          errors: [
            {
              code: 'TEST_ERROR',
              message: 'Test error message',
              severity: 'warning',
              source: 'coordinator',
              recoveryAttempted: false,
              timestamp: new Date(),
            },
          ],
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.errors).toHaveLength(1);
          const firstError = result.body.data.errors[0];
          expect(firstError).toBeDefined();
          expect(firstError?.code).toBe('TEST_ERROR');
        }
      });

      it('should include timestamps', async () => {
        const startTime = new Date();
        injectMockSession('test-session', {
          status: 'loading_cart',
          startTime,
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.startedAt).toBe(startTime.toISOString());
          expect(result.body.data.endedAt).toBeNull();
        }
      });

      it('should include endedAt when session is completed', async () => {
        const endTime = new Date();
        injectMockSession('test-session', {
          status: 'completed',
          endTime,
        });

        const result = await handleGetSession('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.endedAt).toBe(endTime.toISOString());
        }
      });
    });
  });

  // ===========================================================================
  // GET /api/coordinator/session/:id/review-pack
  // ===========================================================================

  describe('handleGetReviewPack', () => {
    describe('error cases', () => {
      it('should return 404 for non-existent session', async () => {
        const result = await handleGetReviewPack('non-existent-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_NOT_FOUND);
        }
      });

      it('should return 404 when session is not in review_ready state', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.REVIEW_PACK_NOT_READY);
          expect(result.body.details?.currentStatus).toBe('loading_cart');
        }
      });

      it('should return 404 when status is review_ready but reviewPack is null', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: null,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.REVIEW_PACK_NOT_READY);
        }
      });

      it('should return 404 for cancelled session', async () => {
        injectMockSession('test-session', {
          status: 'cancelled',
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
      });

      it('should return 404 for completed session without review pack', async () => {
        injectMockSession('test-session', {
          status: 'completed',
          reviewPack: null,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
      });
    });

    describe('success cases', () => {
      it('should return 200 with Review Pack when ready', async () => {
        const reviewPack = createMockReviewPack('test-session');
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should include full Review Pack data', async () => {
        const reviewPack = createMockReviewPack('test-session');
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.sessionId).toBe('test-session');
          expect(result.body.data.reviewPack).toBeDefined();
          expect(result.body.data.reviewPack.cart.summary.itemCount).toBe(5);
        }
      });

      it('should include cart diff information', async () => {
        const reviewPack = createMockReviewPack('test-session');
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.reviewPack.cart.diff).toBeDefined();
          expect(result.body.data.reviewPack.cart.diff.summary).toBeDefined();
        }
      });

      it('should include confidence scores', async () => {
        const reviewPack = createMockReviewPack('test-session');
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack,
        });

        const result = await handleGetReviewPack('test-session');

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.reviewPack.confidence.cartAccuracy).toBe(0.95);
        }
      });
    });
  });

  // ===========================================================================
  // POST /api/coordinator/session/:id/approve
  // ===========================================================================

  describe('handleApproveSession', () => {
    describe('request validation', () => {
      it('should accept empty body', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should accept body with empty modifications array', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {
          modifications: [],
        });

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should accept valid modifications', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {
          modifications: [
            { type: 'remove', productName: 'Test Product' },
            { type: 'quantity_change', productName: 'Another Product', newQuantity: 3 },
          ],
        });

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should reject invalid modification type', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {
          modifications: [{ type: 'invalid_type', productName: 'Test' }],
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
      });

      it('should reject modification with empty product name', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {
          modifications: [{ type: 'remove', productName: '' }],
        });

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
      });
    });

    describe('error cases', () => {
      it('should return 404 for non-existent session', async () => {
        const result = await handleApproveSession('non-existent-session', {});

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_NOT_FOUND);
        }
      });

      it('should return 400 when session already completed', async () => {
        injectMockSession('test-session', {
          status: 'completed',
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_COMPLETED);
        }
      });

      it('should return 400 when session already cancelled', async () => {
        injectMockSession('test-session', {
          status: 'cancelled',
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_CANCELLED);
        }
      });

      it('should return 400 when session not in review_ready state', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.INVALID_SESSION_STATE);
          expect(result.body.details?.currentStatus).toBe('loading_cart');
        }
      });
    });

    describe('success cases', () => {
      it('should return 200 and mark session as completed', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.status).toBe('completed');
        }
      });

      it('should update session status in memory', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        await handleApproveSession('test-session', {});

        const record = getSessionRecord('test-session');
        expect(record?.session.status).toBe('completed');
      });

      it('should set endTime on completion', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        await handleApproveSession('test-session', {});

        const record = getSessionRecord('test-session');
        expect(record?.session.endTime).toBeDefined();
      });

      it('should return modificationsApplied count', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {
          modifications: [
            { type: 'remove', productName: 'Product 1' },
            { type: 'remove', productName: 'Product 2' },
          ],
        });

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.modificationsApplied).toBe(2);
        }
      });

      it('should return 0 modificationsApplied when no modifications', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.modificationsApplied).toBe(0);
        }
      });

      it('should store pending modifications', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        await handleApproveSession('test-session', {
          modifications: [{ type: 'remove', productName: 'Product 1' }],
        });

        const record = getSessionRecord('test-session');
        expect(record?.pendingModifications).toHaveLength(1);
      });

      it('should include helpful message', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleApproveSession('test-session', {});

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.message).toContain('manual checkout');
        }
      });
    });
  });

  // ===========================================================================
  // POST /api/coordinator/session/:id/cancel
  // ===========================================================================

  describe('handleCancelSession', () => {
    describe('request validation', () => {
      it('should accept empty body', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should accept undefined body', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', undefined);

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should accept body with reason', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', {
          reason: 'User changed their mind',
        });

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });
    });

    describe('error cases', () => {
      it('should return 404 for non-existent session', async () => {
        const result = await handleCancelSession('non-existent-session', {});

        expect(result.statusCode).toBe(404);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_NOT_FOUND);
        }
      });

      it('should return 400 when session already cancelled', async () => {
        injectMockSession('test-session', {
          status: 'cancelled',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_CANCELLED);
        }
      });

      it('should return 400 when session already completed', async () => {
        injectMockSession('test-session', {
          status: 'completed',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(400);
        expect(result.body.success).toBe(false);
        if (!result.body.success) {
          expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_COMPLETED);
        }
      });
    });

    describe('success cases', () => {
      it('should return 200 and mark session as cancelled', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.status).toBe('cancelled');
        }
      });

      it('should update session status in memory', async () => {
        injectMockSession('test-session', {
          status: 'authenticating',
        });

        await handleCancelSession('test-session', {});

        const record = getSessionRecord('test-session');
        expect(record?.session.status).toBe('cancelled');
      });

      it('should set endTime on cancellation', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        await handleCancelSession('test-session', {});

        const record = getSessionRecord('test-session');
        expect(record?.session.endTime).toBeDefined();
      });

      it('should set running to false', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        await handleCancelSession('test-session', {});

        const record = getSessionRecord('test-session');
        expect(record?.running).toBe(false);
      });

      it('should use provided reason in message', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', {
          reason: 'Custom cancellation reason',
        });

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.message).toBe('Custom cancellation reason');
        }
      });

      it('should use default reason when not provided', async () => {
        injectMockSession('test-session', {
          status: 'loading_cart',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.body.success).toBe(true);
        if (result.body.success) {
          expect(result.body.data.message).toContain('User requested');
        }
      });

      it('should allow cancelling review_ready session', async () => {
        injectMockSession('test-session', {
          status: 'review_ready',
          reviewPack: createMockReviewPack('test-session'),
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });

      it('should allow cancelling initializing session', async () => {
        injectMockSession('test-session', {
          status: 'initializing',
        });

        const result = await handleCancelSession('test-session', {});

        expect(result.statusCode).toBe(200);
        expect(result.body.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Status Progress Calculation
  // ===========================================================================

  describe('statusToProgress', () => {
    it('should return correct progress for initializing', () => {
      const progress = statusToProgress('initializing');

      expect(progress.currentStep).toBe('Initializing session');
      expect(progress.currentStepIndex).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('should return correct progress for authenticating', () => {
      const progress = statusToProgress('authenticating');

      expect(progress.currentStep).toBe('Authenticating');
      expect(progress.currentStepIndex).toBe(1);
      expect(progress.percentComplete).toBe(25);
    });

    it('should return correct progress for loading_cart', () => {
      const progress = statusToProgress('loading_cart');

      expect(progress.currentStep).toBe('Loading cart');
      expect(progress.currentStepIndex).toBe(2);
      expect(progress.percentComplete).toBe(50);
    });

    it('should return correct progress for generating_review', () => {
      const progress = statusToProgress('generating_review');

      expect(progress.currentStep).toBe('Generating review');
      expect(progress.currentStepIndex).toBe(3);
      expect(progress.percentComplete).toBe(75);
    });

    it('should return correct progress for review_ready', () => {
      const progress = statusToProgress('review_ready');

      expect(progress.currentStep).toBe('Ready for review');
      expect(progress.currentStepIndex).toBe(4);
      expect(progress.percentComplete).toBe(100);
    });

    it('should handle cancelled status', () => {
      const progress = statusToProgress('cancelled');

      expect(progress.currentStep).toBe('Cancelled');
    });

    it('should handle completed status', () => {
      const progress = statusToProgress('completed');

      expect(progress.currentStep).toBe('Completed');
    });
  });

  // ===========================================================================
  // Session State Transitions
  // ===========================================================================

  describe('session state transitions', () => {
    it('should prevent approval after cancellation', async () => {
      injectMockSession('test-session', {
        status: 'review_ready',
        reviewPack: createMockReviewPack('test-session'),
      });

      // Cancel first
      await handleCancelSession('test-session', {});

      // Try to approve
      const result = await handleApproveSession('test-session', {});

      expect(result.statusCode).toBe(400);
      expect(result.body.success).toBe(false);
    });

    it('should prevent cancellation after approval', async () => {
      injectMockSession('test-session', {
        status: 'review_ready',
        reviewPack: createMockReviewPack('test-session'),
      });

      // Approve first
      await handleApproveSession('test-session', {});

      // Try to cancel
      const result = await handleCancelSession('test-session', {});

      expect(result.statusCode).toBe(400);
      expect(result.body.success).toBe(false);
    });

    it('should prevent double approval', async () => {
      injectMockSession('test-session', {
        status: 'review_ready',
        reviewPack: createMockReviewPack('test-session'),
      });

      // First approval
      await handleApproveSession('test-session', {});

      // Second approval
      const result = await handleApproveSession('test-session', {});

      expect(result.statusCode).toBe(400);
      expect(result.body.success).toBe(false);
      if (!result.body.success) {
        expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_COMPLETED);
      }
    });

    it('should prevent double cancellation', async () => {
      injectMockSession('test-session', {
        status: 'loading_cart',
      });

      // First cancellation
      await handleCancelSession('test-session', {});

      // Second cancellation
      const result = await handleCancelSession('test-session', {});

      expect(result.statusCode).toBe(400);
      expect(result.body.success).toBe(false);
      if (!result.body.success) {
        expect(result.body.errorCode).toBe(API_ERROR_CODES.SESSION_ALREADY_CANCELLED);
      }
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle session with no errors gracefully', async () => {
      injectMockSession('test-session', {
        status: 'loading_cart',
        errors: [],
      });

      const result = await handleGetSession('test-session');

      expect(result.body.success).toBe(true);
      if (result.body.success) {
        expect(result.body.data.errors).toEqual([]);
      }
    });

    it('should handle concurrent session creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handleStartSession({
          username: `test${i}@example.com`,
          householdId: `household-${i}`,
        })
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.statusCode === 201)).toBe(true);

      // All session IDs should be unique
      const sessionIds = results
        .filter((r) => r.body.success)
        .map((r) => (r.body as { success: true; data: { sessionId: string } }).data.sessionId);
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle special characters in householdId', async () => {
      const result = await handleStartSession({
        username: 'test@example.com',
        householdId: 'household-with-special-chars_123',
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.success).toBe(true);
    });

    it('should handle unicode in cancellation reason', async () => {
      injectMockSession('test-session', {
        status: 'loading_cart',
      });

      const result = await handleCancelSession('test-session', {
        reason: 'Cancelled because of reasons',
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
    });

    it('should handle quantity_change modification with 0 quantity (remove)', async () => {
      injectMockSession('test-session', {
        status: 'review_ready',
        reviewPack: createMockReviewPack('test-session'),
      });

      const result = await handleApproveSession('test-session', {
        modifications: [
          { type: 'quantity_change', productName: 'Product', newQuantity: 0 },
        ],
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
    });

    it('should reject negative quantity in modification', async () => {
      injectMockSession('test-session', {
        status: 'review_ready',
        reviewPack: createMockReviewPack('test-session'),
      });

      const result = await handleApproveSession('test-session', {
        modifications: [
          { type: 'quantity_change', productName: 'Product', newQuantity: -1 },
        ],
      });

      expect(result.statusCode).toBe(400);
      expect(result.body.success).toBe(false);
    });
  });
});
