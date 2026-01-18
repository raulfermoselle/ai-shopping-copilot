/**
 * Integration Test: Multi-Order Merge Flow
 *
 * Tests the end-to-end flow of merging the last 3 orders into the cart.
 * Uses FakeAdapters to simulate Chrome APIs without browser interaction.
 *
 * Test-First: This test is written before T004 implementation.
 * Some tests may be skipped until T004 is complete.
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOrchestrator, createStateMachine } from '../index.js';
import { FakeStorageAdapter } from '../../../adapters/fake/fake-storage.js';
import { FakeMessagingAdapter } from '../../../adapters/fake/fake-messaging.js';
import { FakeTabsAdapter } from '../../../adapters/fake/fake-tabs.js';
import { FakeLLMAdapter } from '../../../adapters/fake/fake-llm.js';
import type { ExtensionMessage, ExtensionResponse } from '../../../types/messages.js';
import type { OrderSummary } from '../../../types/orders.js';
import type { CartItem } from '../../../types/cart.js';
import type { RunState } from '../../../types/state.js';
import type { StateMachine } from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create mock orders for testing
 */
function createMockOrders(): OrderSummary[] {
  return [
    {
      orderId: 'order-3',
      date: '2026-01-15',
      status: 'delivered',
      total: 75.5,
      itemCount: 8,
      detailUrl: 'https://auchan.pt/orders/order-3',
    },
    {
      orderId: 'order-2',
      date: '2026-01-10',
      status: 'delivered',
      total: 45.2,
      itemCount: 5,
      detailUrl: 'https://auchan.pt/orders/order-2',
    },
    {
      orderId: 'order-1',
      date: '2026-01-05',
      status: 'delivered',
      total: 62.3,
      itemCount: 7,
      detailUrl: 'https://auchan.pt/orders/order-1',
    },
  ];
}

/**
 * Create mock cart items for testing
 */
function createMockCartItems(count: number = 5): CartItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    sku: `SKU-${i + 1}`,
    name: `Test Product ${i + 1}`,
    quantity: 1,
    price: 5.99 + i,
    availability: 'available' as const,
  }));
}

// =============================================================================
// Test Setup
// =============================================================================

describe('Multi-Order Merge Flow', () => {
  let storage: FakeStorageAdapter;
  let messaging: FakeMessagingAdapter;
  let tabs: FakeTabsAdapter;
  let llm: FakeLLMAdapter;
  let stateMachine: StateMachine;
  let stateChanges: RunState[];

  beforeEach(() => {
    // Reset all adapters
    storage = new FakeStorageAdapter();
    messaging = new FakeMessagingAdapter();
    tabs = new FakeTabsAdapter();
    llm = new FakeLLMAdapter();
    llm.setAvailable(true);

    // Track state changes
    stateChanges = [];

    // Create state machine with the same storage adapter used by orchestrator
    stateMachine = createStateMachine({ storage });
    stateMachine.subscribe((state) => {
      stateChanges.push({ ...state });
    });

    // Setup default tab on Auchan.pt
    tabs.addTab({
      id: 1,
      url: 'https://www.auchan.pt/pt/',
      active: true,
      loading: false,
    });

    // Auto-complete tab loads after URL changes
    // This simulates the browser finishing navigation
    const originalUpdate = tabs.update.bind(tabs);
    tabs.update = async (tabId: number, options: { url?: string; active?: boolean }) => {
      const result = await originalUpdate(tabId, options);
      // Simulate immediate load completion
      if (options.url) {
        setTimeout(() => {
          tabs.simulateTabUpdate(tabId, { status: 'complete', url: options.url });
        }, 10);
      }
      return result;
    };
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  /**
   * Configure messaging to respond to content script messages
   */
  function setupMessagingResponses(options: {
    orders?: OrderSummary[];
    cartItems?: CartItem[];
    isLoggedIn?: boolean;
    reorderModes?: string[];
  }) {
    const { orders = createMockOrders(), cartItems = createMockCartItems(), isLoggedIn = true, reorderModes = [] } = options;

    let reorderCallCount = 0;

    messaging.setResponseGenerator((message: ExtensionMessage, tabId?: number): ExtensionResponse => {
      const baseResponse = {
        id: message.id,
        success: true,
        data: {},
      };

      switch (message.action) {
        case 'login.check':
          return {
            ...baseResponse,
            data: {
              isLoggedIn,
              userName: isLoggedIn ? 'Test User' : undefined,
            },
          };

        case 'order.extractHistory':
          return {
            ...baseResponse,
            data: {
              orders,
              total: orders.length,
            },
          };

        case 'order.reorder': {
          const mode = (message.payload as { mode?: string })?.mode;
          reorderModes.push(mode ?? 'unknown');
          reorderCallCount++;

          // Simulate navigation to cart page after reorder
          if (tabId !== undefined) {
            setTimeout(() => {
              tabs.simulateTabUpdate(tabId, {
                status: 'complete',
                url: 'https://www.auchan.pt/pt/cart',
              });
            }, 10);
          }

          return {
            ...baseResponse,
            data: {
              success: true,
              mode,
              orderIndex: reorderCallCount,
            },
          };
        }

        case 'cart.scan':
          return {
            ...baseResponse,
            data: {
              items: cartItems,
              total: cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
            },
          };

        case 'slots.extract':
          return {
            ...baseResponse,
            data: {
              slots: [
                {
                  id: 'slot-1',
                  date: '2026-01-20',
                  dayOfWeek: 'monday',
                  timeStart: '10:00',
                  timeEnd: '12:00',
                  available: true,
                  isFree: false,
                  fee: 4.99,
                },
              ],
            },
          };

        case 'search.products':
          return {
            ...baseResponse,
            data: {
              products: [],
            },
          };

        default:
          return baseResponse;
      }
    });
  }

  /**
   * Create orchestrator with fake adapters
   */
  function createTestOrchestrator() {
    return createOrchestrator(
      {
        storage,
        messaging,
        tabs,
        llm,
        stateMachine,
      },
      {
        debug: false,
        phaseTimeoutMs: 5000,
        operationTimeoutMs: 1000,
      }
    );
  }

  // ===========================================================================
  // Basic Flow Tests
  // ===========================================================================

  describe('Basic Run Flow', () => {
    it('should transition from idle to running when starting a run', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      // Initial state should be idle
      expect(stateMachine.getState().status).toBe('idle');

      // Start run (don't await - we just want to check the initial transition)
      const runPromise = orchestrator.startRun(1);

      // Should transition to running
      expect(stateMachine.getState().status).toBe('running');

      // Wait for the run to complete
      await runPromise;
    });

    it('should execute all phases in order', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Check that all phases were executed
      const phaseChanges = stateChanges
        .filter((s) => s.status === 'running')
        .map((s) => s.phase);

      expect(phaseChanges).toContain('initializing');
      expect(phaseChanges).toContain('cart');
      expect(phaseChanges).toContain('substitution');
      expect(phaseChanges).toContain('slots');
      expect(phaseChanges).toContain('finalizing');
    });

    it('should end in review state after successful run', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      expect(stateMachine.getState().status).toBe('review');
    });

    it('should generate a review pack after finalizing', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      const reviewPack = await orchestrator.getReviewPack();

      expect(reviewPack).not.toBeNull();
      expect(reviewPack?.runId).toBeDefined();
      expect(reviewPack?.stats).toBeDefined();
    });
  });

  // ===========================================================================
  // Multi-Order Merge Tests (T004 Implementation Target)
  // ===========================================================================

  describe('Multi-Order Merge (T004)', () => {
    it('should load order history with 3 orders', async () => {
      const orders = createMockOrders();
      setupMessagingResponses({ orders });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      const context = orchestrator.getContext();
      expect(context?.orderHistory).toHaveLength(3);
    });

    it('should reorder all 3 orders in sequence', async () => {
      // This test will pass after T004 is implemented
      const orders = createMockOrders();
      const reorderModes: string[] = [];
      setupMessagingResponses({ orders, reorderModes });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Should have called reorder 3 times
      const reorderMessages = messaging.getMessagesByAction('order.reorder');
      expect(reorderMessages).toHaveLength(3);
    });

    it('should use replace mode for first order, merge mode for subsequent', async () => {
      // This test will pass after T004 is implemented
      const orders = createMockOrders();
      const reorderModes: string[] = [];
      setupMessagingResponses({ orders, reorderModes });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // First order should be 'replace', rest should be 'merge'
      expect(reorderModes[0]).toBe('replace');
      expect(reorderModes[1]).toBe('merge');
      expect(reorderModes[2]).toBe('merge');
    });

    it('should process orders oldest to newest', async () => {
      // This test will pass after T004 is implemented
      // Orders: order-1 (Jan 5), order-2 (Jan 10), order-3 (Jan 15)
      // Should process: order-1 first, then order-2, then order-3
      const orders = createMockOrders();
      const reorderModes: string[] = [];
      setupMessagingResponses({ orders, reorderModes });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      const reorderMessages = messaging.getMessagesByAction('order.reorder');
      const orderIds = reorderMessages.map((m) => (m.message.payload as { orderId: string }).orderId);

      // Oldest first
      expect(orderIds[0]).toBe('order-1');
      expect(orderIds[1]).toBe('order-2');
      expect(orderIds[2]).toBe('order-3');
    });

    it('should update progress for each order being merged', async () => {
      // This test will pass after T004 is implemented
      const orders = createMockOrders();
      setupMessagingResponses({ orders });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Check progress updates during cart phase
      const cartPhaseStates = stateChanges.filter(
        (s) => s.status === 'running' && s.phase === 'cart'
      );

      // Should have progress updates for merging each order
      const stepUpdates = cartPhaseStates.map((s) => s.step);

      // Should see 'reordering' step multiple times (once per order)
      const reorderingCount = stepUpdates.filter((s) => s === 'reordering').length;
      expect(reorderingCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should fail if user is not logged in', async () => {
      setupMessagingResponses({ isLoggedIn: false });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Should be in paused state with error
      const finalState = stateMachine.getState();
      expect(finalState.status).toBe('paused');
      expect(finalState.error).not.toBeNull();
      expect(finalState.error?.message).toContain('not logged in');
    });

    it('should fail if tab is not on Auchan.pt', async () => {
      // Update tab to be on a different site
      tabs.setTabState(1, { url: 'https://google.com' });

      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      const finalState = stateMachine.getState();
      expect(finalState.status).toBe('paused');
      expect(finalState.error?.message).toContain('not on Auchan.pt');
    });

    it('should handle empty order history gracefully', async () => {
      // This behavior should be preserved after T004
      setupMessagingResponses({ orders: [] });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Should still complete the run, just with no orders merged
      const context = orchestrator.getContext();
      expect(context?.orderHistory).toHaveLength(0);

      // Should not have called reorder
      const reorderMessages = messaging.getMessagesByAction('order.reorder');
      expect(reorderMessages).toHaveLength(0);
    });

    it('should handle fewer than 3 orders', async () => {
      // This test will pass after T004 is implemented
      const twoOrders = createMockOrders().slice(0, 2);
      const reorderModes: string[] = [];
      setupMessagingResponses({ orders: twoOrders, reorderModes });
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Should have reordered only the available 2 orders
      const reorderMessages = messaging.getMessagesByAction('order.reorder');
      expect(reorderMessages).toHaveLength(2);

      // First still replace, second merge
      expect(reorderModes[0]).toBe('replace');
      expect(reorderModes[1]).toBe('merge');
    });
  });

  // ===========================================================================
  // Cancellation Tests
  // ===========================================================================

  describe('Cancellation', () => {
    it('should allow cancelling a running operation', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      // Start run but don't await
      const runPromise = orchestrator.startRun(1);

      // Cancel immediately
      orchestrator.cancelRun();

      // Wait for the run to stop
      await runPromise;

      expect(stateMachine.getState().status).toBe('idle');
    });

    it('should clear context when cancelled', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      const runPromise = orchestrator.startRun(1);
      orchestrator.cancelRun();
      await runPromise;

      expect(orchestrator.getContext()).toBeNull();
    });
  });

  // ===========================================================================
  // State Persistence Tests
  // ===========================================================================

  describe('State Persistence', () => {
    it('should persist state to storage on each transition', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Storage should have the final state
      const stored = await storage.get<{ runState: RunState }>(['runState'], 'session');
      expect(stored.runState).toBeDefined();
      expect(stored.runState?.status).toBe('review');
    });

    it('should persist review pack to storage', async () => {
      setupMessagingResponses({});
      const orchestrator = createTestOrchestrator();

      await orchestrator.startRun(1);

      // Review pack should be in storage
      const stored = await storage.get<{ reviewPack: unknown }>(['reviewPack'], 'session');
      expect(stored.reviewPack).toBeDefined();
    });
  });
});
