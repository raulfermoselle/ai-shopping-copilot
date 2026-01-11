/**
 * Integration Tests for Coordinator Agent
 *
 * Tests the complete Coordinator orchestration flow by mocking the CartBuilder worker
 * and login tool. This approach tests the Coordinator's session management, delegation
 * logic, error handling, and Review Pack generation without requiring actual browser
 * automation.
 *
 * Test Coverage:
 * 1. Session Initialization - createSession(), config validation
 * 2. State Machine Transitions - status flow from initializing to review_ready
 * 3. CartBuilder Delegation - worker result handling with mocks
 * 4. Timeout/Retry Mechanism - executeWithTimeout(), isRetryableError(), retry loop
 * 5. Review Pack Generation - transformation from CartDiffReport
 * 6. Error Handling - createError(), recordError(), fatal errors
 * 7. Safety Boundaries - verification that agent never places orders
 */

// IMPORTANT: vi.mock calls must be hoisted before imports
import { vi } from 'vitest';

// Create hoisted mock functions that will be available when modules are imported
const mockCartBuilderRun = vi.fn();
const mockLoginToolExecute = vi.fn();

// Mock modules before they are imported
vi.mock('../../cart-builder/cart-builder.js', () => ({
  CartBuilder: vi.fn().mockImplementation(() => ({
    run: mockCartBuilderRun,
  })),
  createCartBuilder: vi.fn().mockImplementation(() => ({
    run: mockCartBuilderRun,
  })),
}));

vi.mock('../../../tools/login.js', () => ({
  createLoginTool: vi.fn().mockImplementation(() => ({
    name: 'login',
    description: 'Mock login tool',
    execute: mockLoginToolExecute,
  })),
}));

// Now import the rest
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Coordinator, createCoordinator } from '../coordinator.js';
import type { AgentContext } from '../../../types/agent.js';
import type { Page } from 'playwright';
import type { CoordinatorSession } from '../types.js';
import {
  CoordinatorConfigSchema,
  createSession,
  createError,
  createDefaultActions,
  toReviewCartItem,
} from '../types.js';
import type {
  CartDiffReport,
  CartSnapshot,
  CartItem,
  CartDiff,
  CartBuilderWarning,
} from '../../cart-builder/types.js';
import type { CartBuilderResult } from '../../cart-builder/cart-builder.js';
import type { LoginResult } from '../../../tools/login.js';

// =============================================================================
// Test Helpers - Mock Factories
// =============================================================================

/**
 * Create a mock Playwright Page with minimal stubs.
 */
function createMockPage(): Page {
  return {
    url: vi.fn().mockReturnValue('https://www.auchan.pt/pt/home'),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn(),
  } as unknown as Page;
}

/**
 * Create a mock AgentContext.
 */
function createMockAgentContext(page: Page, sessionId = 'test-session-001'): AgentContext {
  return {
    page,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    sessionId,
    workingMemory: {
      cartItems: [],
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
    },
  } as unknown as AgentContext;
}

/**
 * Create a successful login result.
 */
function createSuccessfulLoginResult(userName = 'Test User'): { success: true; data: LoginResult } {
  return {
    success: true,
    data: {
      loggedIn: true,
      sessionRestored: true,
      userName,
      finalUrl: 'https://www.auchan.pt/pt/conta',
    },
  };
}

/**
 * Create a failed login result.
 */
function createFailedLoginResult(message: string): { success: false; error: { message: string } } {
  return {
    success: false,
    error: { message },
  };
}

// =============================================================================
// Test Data Factories
// =============================================================================

/**
 * Create sample cart items for testing.
 */
function createSampleCartItems(): CartItem[] {
  return [
    {
      productId: 'prod-001',
      name: 'Leite Mimosa',
      productUrl: 'https://www.auchan.pt/pt/produtos/leite-mimosa',
      quantity: 2,
      unitPrice: 1.39,
      available: true,
    },
    {
      productId: 'prod-002',
      name: 'Pao de Forma',
      productUrl: 'https://www.auchan.pt/pt/produtos/pao-de-forma',
      quantity: 1,
      unitPrice: 2.50,
      available: true,
    },
  ];
}

/**
 * Create a CartSnapshot from CartItem array.
 */
function createCartSnapshot(items: CartItem[], timestamp = new Date()): CartSnapshot {
  return {
    timestamp,
    items,
    itemCount: items.length,
    totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  };
}

/**
 * Create a sample CartDiff.
 */
function createSampleCartDiff(before: CartSnapshot, after: CartSnapshot): CartDiff {
  const added = after.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    sourceOrders: ['order-001'],
  }));

  return {
    added,
    removed: [],
    quantityChanged: [],
    unchanged: [],
    summary: {
      addedCount: added.length,
      removedCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      totalItems: after.itemCount,
      priceDifference: after.totalPrice - before.totalPrice,
      newTotalPrice: after.totalPrice,
    },
  };
}

/**
 * Create a sample CartDiffReport.
 */
function createSampleCartDiffReport(
  sessionId: string,
  options: {
    warnings?: CartBuilderWarning[];
    screenshots?: string[];
    confidence?: number;
  } = {}
): CartDiffReport {
  const cartBefore = createCartSnapshot([]);
  const cartAfter = createCartSnapshot(createSampleCartItems());
  const diff = createSampleCartDiff(cartBefore, cartAfter);

  return {
    timestamp: new Date(),
    sessionId,
    ordersAnalyzed: ['order-001'],
    cart: {
      before: cartBefore,
      after: cartAfter,
    },
    diff,
    confidence: options.confidence ?? 1.0,
    warnings: options.warnings ?? [],
    screenshots: options.screenshots ?? [],
  };
}

/**
 * Create a successful CartBuilder result.
 */
function createSuccessfulCartBuilderResult(
  sessionId: string,
  options: {
    warnings?: CartBuilderWarning[];
    screenshots?: string[];
  } = {}
): CartBuilderResult {
  const cartBefore = createCartSnapshot([]);
  const cartAfter = createCartSnapshot(createSampleCartItems());
  const diff = createSampleCartDiff(cartBefore, cartAfter);
  const report = createSampleCartDiffReport(sessionId, options);

  return {
    success: true,
    data: {
      ordersLoaded: [
        {
          orderId: 'order-001',
          date: new Date('2025-01-10'),
          productCount: 2,
          totalPrice: 5.28,
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/order-001',
        },
      ],
      orderDetails: [],
      cartBefore,
      cartAfter,
      diff,
      report,
    },
    logs: ['CartBuilder started', 'Completed successfully'],
  };
}

/**
 * Create a failed CartBuilder result.
 */
function createFailedCartBuilderResult(errorMessage: string): CartBuilderResult {
  return {
    success: false,
    error: new Error(errorMessage),
    logs: ['CartBuilder started', `Error: ${errorMessage}`],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Coordinator Integration Tests', () => {
  let mockPage: Page;
  let context: AgentContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPage = createMockPage();
    context = createMockAgentContext(mockPage);

    // Default: login succeeds
    mockLoginToolExecute.mockResolvedValue(createSuccessfulLoginResult());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. Session Initialization Tests
  // ===========================================================================

  describe('Session Initialization', () => {
    describe('createSession()', () => {
      it('should create a valid session with correct initial state', () => {
        // Act
        const session = createSession('session-001', 'user@test.com', 'household-001');

        // Assert
        expect(session.sessionId).toBe('session-001');
        expect(session.username).toBe('user@test.com');
        expect(session.householdId).toBe('household-001');
        expect(session.status).toBe('initializing');
        expect(session.startTime).toBeInstanceOf(Date);
        expect(session.endTime).toBeUndefined();
        expect(session.errors).toEqual([]);
        expect(session.screenshots).toEqual([]);
        expect(session.reviewPack).toBeNull();
      });

      it('should initialize worker results as null', () => {
        // Act
        const session = createSession('session-001', 'user@test.com', 'household-001');

        // Assert
        expect(session.workers.cartBuilder).toBeNull();
        expect(session.workers.substitution).toBeNull();
        expect(session.workers.stockPruner).toBeNull();
        expect(session.workers.slotScout).toBeNull();
      });

      it('should set startTime to current time', () => {
        // Arrange
        const beforeTime = new Date();

        // Act
        const session = createSession('session-001', 'user@test.com', 'household-001');

        // Assert
        expect(session.startTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      });
    });

    describe('CoordinatorConfigSchema validation', () => {
      it('should use default values when config is empty', () => {
        // Act
        const config = CoordinatorConfigSchema.parse({});

        // Assert
        expect(config.maxOrdersToLoad).toBe(3);
        expect(config.includeFavorites).toBe(false);
        expect(config.mergeStrategy).toBe('latest');
        expect(config.captureScreenshots).toBe(true);
        expect(config.sessionTimeout).toBe(300000);
        expect(config.maxRetries).toBe(2);
        expect(config.clearExistingCart).toBe(false);
      });

      it('should accept valid custom configuration', () => {
        // Arrange
        const customConfig = {
          maxOrdersToLoad: 5,
          includeFavorites: true,
          mergeStrategy: 'combined' as const,
          sessionTimeout: 600000,
          maxRetries: 3,
        };

        // Act
        const config = CoordinatorConfigSchema.parse(customConfig);

        // Assert
        expect(config.maxOrdersToLoad).toBe(5);
        expect(config.includeFavorites).toBe(true);
        expect(config.mergeStrategy).toBe('combined');
        expect(config.sessionTimeout).toBe(600000);
        expect(config.maxRetries).toBe(3);
      });

      it('should reject invalid maxOrdersToLoad (must be positive)', () => {
        // Arrange
        const invalidConfig = { maxOrdersToLoad: 0 };

        // Act & Assert
        expect(() => CoordinatorConfigSchema.parse(invalidConfig)).toThrow();
      });

      it('should reject invalid sessionTimeout (must be positive)', () => {
        // Arrange
        const invalidConfig = { sessionTimeout: -1 };

        // Act & Assert
        expect(() => CoordinatorConfigSchema.parse(invalidConfig)).toThrow();
      });

      it('should reject invalid mergeStrategy', () => {
        // Arrange
        const invalidConfig = { mergeStrategy: 'invalid_strategy' };

        // Act & Assert
        expect(() => CoordinatorConfigSchema.parse(invalidConfig)).toThrow();
      });
    });

    describe('Coordinator constructor', () => {
      it('should create coordinator with default config', () => {
        // Act
        const coordinator = createCoordinator();

        // Assert
        expect(coordinator).toBeInstanceOf(Coordinator);
      });

      it('should create coordinator with custom config', () => {
        // Act
        const coordinator = createCoordinator({
          maxOrdersToLoad: 5,
          sessionTimeout: 600000,
        });

        // Assert
        expect(coordinator).toBeInstanceOf(Coordinator);
      });

      it('should throw on invalid config', () => {
        // Act & Assert
        expect(() => createCoordinator({ maxOrdersToLoad: -1 })).toThrow();
      });
    });
  });

  // ===========================================================================
  // 2. State Machine Transitions Tests
  // ===========================================================================

  describe('State Machine Transitions', () => {
    it('should transition through all states on successful run', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('review_ready');

      const session = coordinator.getSession();
      expect(session?.status).toBe('review_ready');
    });

    it('should set status to loading_cart when delegating to CartBuilder', async () => {
      // Arrange
      const coordinator = createCoordinator();
      let capturedStatus: string | undefined;

      mockCartBuilderRun.mockImplementation(async () => {
        // Capture status during CartBuilder execution
        capturedStatus = coordinator.getSession()?.status;
        return createSuccessfulCartBuilderResult(context.sessionId);
      });

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert - CartBuilder is called during loading_cart phase
      expect(capturedStatus).toBe('loading_cart');
    });

    it('should transition to cancelled on error', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockResolvedValue(
        createFailedCartBuilderResult('Fatal error occurred')
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);

      const session = coordinator.getSession();
      expect(session?.status).toBe('cancelled');
    });

    it('should transition to cancelled on login failure', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockLoginToolExecute.mockResolvedValue(createFailedLoginResult('Login credentials invalid'));

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);

      const session = coordinator.getSession();
      expect(session?.status).toBe('cancelled');
    });

    it('should set endTime when session completes successfully', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.endTime).toBeDefined();
      expect(session?.endTime).toBeInstanceOf(Date);
    });

    it('should set endTime when session fails', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockResolvedValue(
        createFailedCartBuilderResult('Test failure')
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.endTime).toBeDefined();
    });

    describe('getSession()', () => {
      it('should return null before run() is called', () => {
        // Arrange
        const coordinator = createCoordinator();

        // Act
        const session = coordinator.getSession();

        // Assert
        expect(session).toBeNull();
      });

      it('should return current session state during run()', async () => {
        // Arrange
        const coordinator = createCoordinator();
        let sessionDuringCartBuilder: CoordinatorSession | null = null;

        mockCartBuilderRun.mockImplementation(async () => {
          // Capture a copy of the session state during CartBuilder execution
          const currentSession = coordinator.getSession();
          if (currentSession) {
            sessionDuringCartBuilder = { ...currentSession };
          }
          return createSuccessfulCartBuilderResult(context.sessionId);
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        await resultPromise;

        // Assert - session should have been captured during CartBuilder execution
        expect(sessionDuringCartBuilder).not.toBeNull();
        // During CartBuilder execution, status should be loading_cart
        expect(sessionDuringCartBuilder!.status).toBe('loading_cart');
      });
    });
  });

  // ===========================================================================
  // 3. CartBuilder Delegation Tests (with mocks)
  // ===========================================================================

  describe('CartBuilder Delegation', () => {
    it('should store successful worker result in session.workers.cartBuilder', async () => {
      // Arrange
      const coordinator = createCoordinator();
      const cartBuilderResult = createSuccessfulCartBuilderResult(context.sessionId);
      mockCartBuilderRun.mockResolvedValue(cartBuilderResult);

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.workers.cartBuilder).toBeDefined();
      expect(session?.workers.cartBuilder?.success).toBe(true);
      expect(session?.workers.cartBuilder?.report).toBeDefined();
    });

    it('should store failed worker result in session.workers.cartBuilder', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockResolvedValue(
        createFailedCartBuilderResult('CartBuilder failed')
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.workers.cartBuilder).toBeDefined();
      expect(session?.workers.cartBuilder?.success).toBe(false);
      expect(session?.workers.cartBuilder?.errorMessage).toContain('CartBuilder failed');
    });

    it('should collect screenshots from worker result', async () => {
      // Arrange
      const coordinator = createCoordinator();
      const cartBuilderResult = createSuccessfulCartBuilderResult(context.sessionId, {
        screenshots: ['screenshot-1.png', 'screenshot-2.png'],
      });
      mockCartBuilderRun.mockResolvedValue(cartBuilderResult);

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.screenshots).toContain('screenshot-1.png');
      expect(session?.screenshots).toContain('screenshot-2.png');
    });

    it('should include screenshots in result', async () => {
      // Arrange
      const coordinator = createCoordinator();
      const cartBuilderResult = createSuccessfulCartBuilderResult(context.sessionId, {
        screenshots: ['cart-before.png', 'cart-after.png'],
      });
      mockCartBuilderRun.mockResolvedValue(cartBuilderResult);

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.screenshots).toContain('cart-before.png');
        expect(result.data.screenshots).toContain('cart-after.png');
      }
    });

    it('should track worker duration in result', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      const session = coordinator.getSession();
      expect(session?.workers.cartBuilder?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should call CartBuilder with correct context', async () => {
      // Arrange
      const coordinator = createCoordinator({
        maxOrdersToLoad: 5,
        includeFavorites: true,
        mergeStrategy: 'combined',
      });
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert - CartBuilder.run was called
      expect(mockCartBuilderRun).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. Timeout/Retry Mechanism Tests
  // ===========================================================================

  describe('Timeout/Retry Mechanism', () => {
    describe('executeWithTimeout()', () => {
      it('should resolve when operation completes before timeout', async () => {
        // Arrange
        const coordinator = createCoordinator({ sessionTimeout: 5000 });
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId)
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
      });

      it('should reject with timeout error when operation exceeds timeout', async () => {
        // Arrange
        vi.useRealTimers(); // Use real timers for timeout test
        const coordinator = createCoordinator({ sessionTimeout: 100, maxRetries: 0 });

        mockCartBuilderRun.mockImplementation(async () => {
          // Simulate slow operation that exceeds timeout
          await new Promise((resolve) => setTimeout(resolve, 200));
          return createSuccessfulCartBuilderResult(context.sessionId);
        });

        // Act
        const result = await coordinator.run(context, 'user@test.com', 'household-001');

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('TIMEOUT');

        vi.useFakeTimers(); // Restore fake timers
      });
    });

    describe('isRetryableError()', () => {
      it('should retry on timeout errors', async () => {
        // Arrange
        vi.useRealTimers();
        const coordinator = createCoordinator({ sessionTimeout: 50, maxRetries: 2 });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            // First two calls timeout
            await new Promise((resolve) => setTimeout(resolve, 100));
            return createSuccessfulCartBuilderResult(context.sessionId);
          }
          // Third call succeeds quickly
          return createSuccessfulCartBuilderResult(context.sessionId);
        });

        // Act
        await coordinator.run(context, 'user@test.com', 'household-001');

        // Assert - should have retried
        expect(callCount).toBeGreaterThan(1);

        vi.useFakeTimers();
      });

      it('should retry on network errors', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 2 });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          if (callCount < 2) {
            // First call fails with network error
            throw new Error('Network error: ECONNRESET');
          }
          // Second call succeeds
          return createSuccessfulCartBuilderResult(context.sessionId);
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(callCount).toBe(2);
        expect(result.success).toBe(true);
      });

      it('should NOT retry on authentication errors', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 3 });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          // Always fail with auth error
          return createFailedCartBuilderResult('Authentication failed: not logged in');
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert - should not retry on auth errors
        expect(callCount).toBe(1);
        expect(result.success).toBe(false);
      });

      it('should NOT retry on validation errors', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 3 });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          return createFailedCartBuilderResult('Validation error: invalid data');
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert - should not retry on validation errors
        expect(callCount).toBe(1);
        expect(result.success).toBe(false);
      });
    });

    describe('retry loop', () => {
      it('should attempt correct number of retries', async () => {
        // Arrange
        const maxRetries = 2;
        const coordinator = createCoordinator({ maxRetries });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          // Always fail with retryable error
          throw new Error('Navigation timeout');
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        await resultPromise;

        // Assert - initial attempt + maxRetries
        expect(callCount).toBe(1 + maxRetries);
      });

      it('should succeed if retry succeeds', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 2 });
        let callCount = 0;

        mockCartBuilderRun.mockImplementation(async () => {
          callCount++;
          if (callCount < 2) {
            throw new Error('Element not found timeout');
          }
          return createSuccessfulCartBuilderResult(context.sessionId);
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(callCount).toBe(2);
        expect(result.success).toBe(true);
      });

      it('should record transient errors during retry', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 1 });

        mockCartBuilderRun
          .mockRejectedValueOnce(new Error('Navigation timeout'))
          .mockResolvedValueOnce(createSuccessfulCartBuilderResult(context.sessionId));

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        const session = coordinator.getSession();
        expect(session?.errors.length).toBeGreaterThan(0);
        expect(session?.errors[0]?.code).toBe('CART_BUILDER_TRANSIENT');
      });
    });
  });

  // ===========================================================================
  // 5. Review Pack Generation Tests
  // ===========================================================================

  describe('Review Pack Generation', () => {
    it('should generate ReviewPack from CartDiffReport', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.reviewPack).toBeDefined();
        expect(result.data.reviewPack.sessionId).toBe(context.sessionId);
        expect(result.data.reviewPack.householdId).toBe('household-001');
        expect(result.data.reviewPack.generatedAt).toBeInstanceOf(Date);
      }
    });

    it('should transform cart items correctly', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const reviewPack = result.data.reviewPack;
        expect(reviewPack.cart.after.length).toBe(2);
        expect(reviewPack.cart.after[0]?.name).toBe('Leite Mimosa');
        expect(reviewPack.cart.after[0]?.quantity).toBe(2);
        expect(reviewPack.cart.after[0]?.unitPrice).toBe(1.39);
        expect(reviewPack.cart.after[0]?.totalPrice).toBeCloseTo(2.78, 2);
      }
    });

    it('should include cart diff in ReviewPack', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const reviewPack = result.data.reviewPack;
        expect(reviewPack.cart.diff).toBeDefined();
        expect(reviewPack.cart.diff.added.length).toBe(2);
        expect(reviewPack.cart.diff.summary.addedCount).toBe(2);
      }
    });

    describe('warning mapping', () => {
      it('should map item_unavailable to out_of_stock', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [
              { type: 'item_unavailable', message: 'Item not available', itemName: 'Test' },
            ],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.warnings[0]?.type).toBe('out_of_stock');
        }
      });

      it('should map price_changed to price_change', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [{ type: 'price_changed', message: 'Price changed', itemName: 'Test' }],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.warnings[0]?.type).toBe('price_change');
        }
      });

      it('should map quantity_adjusted to data_quality', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [
              { type: 'quantity_adjusted', message: 'Quantity adjusted', itemName: 'Test' },
            ],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.warnings[0]?.type).toBe('data_quality');
        }
      });

      it('should map order_load_partial to partial_order_load', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [
              {
                type: 'order_load_partial',
                message: 'Partial load',
                orderId: 'order-001',
              },
            ],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.warnings[0]?.type).toBe('partial_order_load');
        }
      });

      it('should map reorder_failed to missing_item', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [{ type: 'reorder_failed', message: 'Reorder failed', orderId: '001' }],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.warnings[0]?.type).toBe('missing_item');
        }
      });
    });

    describe('confidence score calculation', () => {
      it('should use CartBuilder confidence for cartAccuracy', async () => {
        // Arrange
        const coordinator = createCoordinator();
        const report = createSampleCartDiffReport(context.sessionId, {
          confidence: 0.85,
        });
        mockCartBuilderRun.mockResolvedValue({
          success: true,
          data: {
            ordersLoaded: [],
            orderDetails: [],
            cartBefore: createCartSnapshot([]),
            cartAfter: createCartSnapshot(createSampleCartItems()),
            diff: createSampleCartDiff(
              createCartSnapshot([]),
              createCartSnapshot(createSampleCartItems())
            ),
            report,
          },
          logs: [],
        });

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.confidence.cartAccuracy).toBe(0.85);
        }
      });

      it('should calculate dataQuality based on warning count', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId, {
            warnings: [
              { type: 'item_unavailable', message: 'W1', itemName: 'A' },
              { type: 'item_unavailable', message: 'W2', itemName: 'B' },
              { type: 'item_unavailable', message: 'W3', itemName: 'C' },
            ],
          })
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert - dataQuality decreases with warnings (1 - 0.1 per warning, min 0.5)
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.confidence.dataQuality).toBeLessThan(1.0);
        }
      });

      it('should include sourceOrders in confidence', async () => {
        // Arrange
        const coordinator = createCoordinator();
        mockCartBuilderRun.mockResolvedValue(
          createSuccessfulCartBuilderResult(context.sessionId)
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.reviewPack.confidence.sourceOrders).toContain('order-001');
        }
      });
    });

    describe('createDefaultActions()', () => {
      it('should include approve_cart action', () => {
        // Act
        const actions = createDefaultActions();

        // Assert
        expect(actions.find((a) => a.type === 'approve_cart')).toBeDefined();
        expect(actions.find((a) => a.type === 'approve_cart')?.enabled).toBe(true);
      });

      it('should include reject_cart action', () => {
        // Act
        const actions = createDefaultActions();

        // Assert
        expect(actions.find((a) => a.type === 'reject_cart')).toBeDefined();
        expect(actions.find((a) => a.type === 'reject_cart')?.enabled).toBe(true);
      });
    });

    describe('toReviewCartItem()', () => {
      it('should calculate totalPrice correctly', () => {
        // Arrange
        const cartItem: CartItem = {
          name: 'Test Product',
          quantity: 3,
          unitPrice: 2.50,
          available: true,
        };

        // Act
        const reviewItem = toReviewCartItem(cartItem);

        // Assert
        expect(reviewItem.totalPrice).toBeCloseTo(7.50, 2);
      });

      it('should preserve all fields', () => {
        // Arrange
        const cartItem: CartItem = {
          name: 'Test Product',
          quantity: 2,
          unitPrice: 1.99,
          available: false,
        };

        // Act
        const reviewItem = toReviewCartItem(cartItem);

        // Assert
        expect(reviewItem.name).toBe('Test Product');
        expect(reviewItem.quantity).toBe(2);
        expect(reviewItem.unitPrice).toBe(1.99);
        expect(reviewItem.available).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 6. Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    describe('createError()', () => {
      it('should create proper error object with all fields', () => {
        // Act
        const error = createError(
          'TEST_ERROR',
          'Test error message',
          'error',
          'coordinator',
          { extra: 'data' }
        );

        // Assert
        expect(error.code).toBe('TEST_ERROR');
        expect(error.message).toBe('Test error message');
        expect(error.severity).toBe('error');
        expect(error.source).toBe('coordinator');
        expect(error.context).toEqual({ extra: 'data' });
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(error.recoveryAttempted).toBe(false);
      });

      it('should support different severity levels', () => {
        // Act
        const infoError = createError('INFO', 'Info', 'info', 'coordinator');
        const warnError = createError('WARN', 'Warn', 'warning', 'coordinator');
        const errorError = createError('ERROR', 'Error', 'error', 'coordinator');
        const fatalError = createError('FATAL', 'Fatal', 'fatal', 'coordinator');

        // Assert
        expect(infoError.severity).toBe('info');
        expect(warnError.severity).toBe('warning');
        expect(errorError.severity).toBe('error');
        expect(fatalError.severity).toBe('fatal');
      });

      it('should support different source values', () => {
        // Act
        const sources = [
          'coordinator',
          'cart_builder',
          'substitution',
          'stock_pruner',
          'slot_scout',
          'login',
        ] as const;

        for (const source of sources) {
          const error = createError('TEST', 'Test', 'error', source);
          expect(error.source).toBe(source);
        }
      });
    });

    describe('recordError()', () => {
      it('should add errors to session.errors array', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 0 });
        mockCartBuilderRun.mockResolvedValue(
          createFailedCartBuilderResult('Test error')
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        await resultPromise;

        // Assert
        const session = coordinator.getSession();
        expect(session?.errors.length).toBeGreaterThan(0);
      });

      it('should record multiple errors from retries', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 2 });

        mockCartBuilderRun.mockRejectedValue(new Error('Network error'));

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        await resultPromise;

        // Assert
        const session = coordinator.getSession();
        // Should have transient errors from each retry
        expect(session?.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('fatal errors', () => {
      it('should result in cancelled status on fatal error', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 0 });
        mockCartBuilderRun.mockResolvedValue(
          createFailedCartBuilderResult('Fatal: Critical system failure')
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(false);
        const session = coordinator.getSession();
        expect(session?.status).toBe('cancelled');
      });

      it('should include fatal error in session.errors', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 0 });
        mockCartBuilderRun.mockResolvedValue(
          createFailedCartBuilderResult('CartBuilder completely failed')
        );

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        await resultPromise;

        // Assert
        const session = coordinator.getSession();
        const fatalErrors = session?.errors.filter((e) => e.severity === 'fatal');
        expect(fatalErrors?.length).toBeGreaterThan(0);
      });

      it('should return error in result', async () => {
        // Arrange
        const coordinator = createCoordinator({ maxRetries: 0 });
        const errorMessage = 'Critical failure occurred';
        mockCartBuilderRun.mockResolvedValue(createFailedCartBuilderResult(errorMessage));

        // Act
        const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain(errorMessage);
      });
    });

    it('should catch and wrap non-Error exceptions', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockRejectedValue('String error');

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should include logs of progress steps', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockResolvedValue(createFailedCartBuilderResult('Test'));

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.logs).toBeDefined();
      expect(result.logs.some((log) => log.includes('session started'))).toBe(true);
    });
  });

  // ===========================================================================
  // 7. Safety Boundaries Tests
  // ===========================================================================

  describe('Safety Boundaries', () => {
    it('should never navigate to checkout page', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('should stop at review_ready state - not completed', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.status).toBe('review_ready');
        expect(result.data.status).not.toBe('completed');
      }
    });

    it('should produce Review Pack without order placement confirmation', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.reviewPack).toBeDefined();
        // No orderPlacedId or similar field indicating an order was placed
        expect(result.data).not.toHaveProperty('orderPlacedId');
        expect(result.data).not.toHaveProperty('orderConfirmation');
      }
    });

    it('should include approve/reject actions for user decision', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const actions = result.data.reviewPack.actions ?? [];
        const hasApprove = actions.some((a) => a.type === 'approve_cart');
        const hasReject = actions.some((a) => a.type === 'reject_cart');
        expect(hasApprove).toBe(true);
        expect(hasReject).toBe(true);
      }
    });

    it('should not include auto-purchase functionality', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert - Review Pack should not have any "purchase" or "order" actions
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const actions = result.data.reviewPack.actions ?? [];
        const hasPurchase = actions.some(
          (a) =>
            a.type === ('purchase' as never) ||
            a.type === ('place_order' as never) ||
            a.type === ('submit_order' as never)
        );
        expect(hasPurchase).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Additional Edge Case Tests
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle CartBuilder returning empty report', async () => {
      // Arrange
      const coordinator = createCoordinator();
      const emptyReport = createSampleCartDiffReport(context.sessionId);
      emptyReport.cart.after = createCartSnapshot([]);
      emptyReport.diff.added = [];
      emptyReport.diff.summary.addedCount = 0;
      emptyReport.diff.summary.totalItems = 0;

      mockCartBuilderRun.mockResolvedValue({
        success: true,
        data: {
          ordersLoaded: [],
          orderDetails: [],
          cartBefore: createCartSnapshot([]),
          cartAfter: createCartSnapshot([]),
          diff: emptyReport.diff,
          report: emptyReport,
        },
        logs: [],
      });

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.reviewPack.cart.summary.itemCount).toBe(0);
      }
    });

    it('should handle concurrent run calls on same coordinator', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const result1Promise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result1 = await result1Promise;

      const context2 = createMockAgentContext(mockPage, 'session-002');
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult('session-002')
      );
      const result2Promise = coordinator.run(context2, 'user2@test.com', 'household-002');
      await vi.runAllTimersAsync();
      const result2 = await result2Promise;

      // Assert - second run should overwrite session
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      const session = coordinator.getSession();
      expect(session?.sessionId).toBe('session-002');
    });

    it('should track durationMs in result', async () => {
      // Arrange
      vi.useRealTimers();
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createSuccessfulCartBuilderResult('test-session-001');
      });

      // Act
      const runResult = await coordinator.run(context, 'user@test.com', 'household-001');

      // Assert
      expect(runResult.success).toBe(true);
      if (runResult.success && runResult.data) {
        expect(runResult.data.durationMs).toBeGreaterThan(0);
      }

      vi.useFakeTimers();
    });

    it('should log info messages for key steps', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      expect(context.logger.info).toHaveBeenCalledWith(
        'Coordinator starting session',
        expect.any(Object)
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Coordinator completed successfully',
        expect.any(Object)
      );
    });

    it('should log error on failure', async () => {
      // Arrange
      const coordinator = createCoordinator({ maxRetries: 0 });
      mockCartBuilderRun.mockResolvedValue(createFailedCartBuilderResult('Test failure'));

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      expect(context.logger.error).toHaveBeenCalledWith(
        'Coordinator failed',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Login Tests
  // ===========================================================================

  describe('Login Integration', () => {
    it('should call login tool before CartBuilder', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      await resultPromise;

      // Assert
      expect(mockLoginToolExecute).toHaveBeenCalled();
      expect(mockLoginToolExecute).toHaveBeenCalledWith(
        { email: 'user@test.com' },
        expect.any(Object)
      );
    });

    it('should include login status in logs on success', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockLoginToolExecute.mockResolvedValue({
        success: true,
        data: {
          loggedIn: true,
          sessionRestored: true,
          userName: 'Test User',
          accountUrl: 'https://www.auchan.pt/pt/conta',
        },
      });
      mockCartBuilderRun.mockResolvedValue(
        createSuccessfulCartBuilderResult(context.sessionId)
      );

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.logs.some((log) => log.includes('Login'))).toBe(true);
    });

    it('should fail when login returns loggedIn: false', async () => {
      // Arrange
      const coordinator = createCoordinator();
      mockLoginToolExecute.mockResolvedValue({
        success: true,
        data: {
          loggedIn: false,
          sessionRestored: false,
        },
      });

      // Act
      const resultPromise = coordinator.run(context, 'user@test.com', 'household-001');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Login failed');
    });
  });
});
