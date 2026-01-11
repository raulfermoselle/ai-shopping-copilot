/**
 * E2E Tests for CartBuilder Agent
 *
 * Tests the complete CartBuilder.run() flow by mocking the individual tools.
 * This approach tests the agent's orchestration logic and data flow without
 * requiring complex Playwright mocking.
 *
 * Test Coverage:
 * 1. Happy path - Complete flow from order history to cart diff report
 * 2. Empty order history - Test handling when no orders exist
 * 3. Auth required - Test when tool returns auth error
 * 4. Cart mismatch - Test when cart differs from original order
 * 5. Partial failures - Test resilience when some tools fail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CartBuilder, createCartBuilder } from '../cart-builder.js';
import type { AgentContext } from '../../../types/agent.js';
import type { Page } from 'playwright';
import type { ToolResult } from '../../../types/tool.js';
import type {
  OrderSummary,
  OrderDetail,
  CartSnapshot,
  CartItem,
} from '../types.js';
import type {
  NavigateToOrderHistoryOutput,
  LoadOrderHistoryOutput,
  LoadOrderDetailOutput,
  ReorderOutput,
  ScanCartOutput,
} from '../tools/types.js';

// =============================================================================
// Mock the tools module
// =============================================================================

// Create mock functions for each tool
const mockNavigateToOrderHistoryExecute = vi.fn();
const mockLoadOrderHistoryExecute = vi.fn();
const mockLoadOrderDetailExecute = vi.fn();
const mockReorderExecute = vi.fn();
const mockScanCartExecute = vi.fn();

// Mock the tools module
vi.mock('../tools/index.js', () => ({
  navigateToOrderHistoryTool: {
    name: 'navigateToOrderHistory',
    execute: (...args: unknown[]) => mockNavigateToOrderHistoryExecute(...args),
  },
  loadOrderHistoryTool: {
    name: 'loadOrderHistory',
    execute: (...args: unknown[]) => mockLoadOrderHistoryExecute(...args),
  },
  loadOrderDetailTool: {
    name: 'loadOrderDetail',
    execute: (...args: unknown[]) => mockLoadOrderDetailExecute(...args),
  },
  reorderTool: {
    name: 'reorder',
    execute: (...args: unknown[]) => mockReorderExecute(...args),
  },
  scanCartTool: {
    name: 'scanCart',
    execute: (...args: unknown[]) => mockScanCartExecute(...args),
  },
}));

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
function createMockAgentContext(page: Page): AgentContext {
  return {
    page,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    sessionId: 'test-session-001',
    workingMemory: {
      cartItems: [],
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
    },
  } as unknown as AgentContext;
}

// =============================================================================
// Test Data Factories
// =============================================================================

/**
 * Create sample order summaries for testing.
 */
function createSampleOrders(count: number): OrderSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    orderId: `00${i + 1}`,
    date: new Date(`2025-01-${10 - i}T10:00:00Z`),
    productCount: 10 + i * 5,
    totalPrice: 50 + i * 25,
    detailUrl: `https://www.auchan.pt/pt/conta/detalhes-encomenda/00${i + 1}`,
  }));
}

/**
 * Create a sample order detail for testing.
 */
function createSampleOrderDetail(order: OrderSummary): OrderDetail {
  return {
    ...order,
    items: [
      {
        productId: 'prod-001',
        name: 'Leite Mimosa',
        productUrl: 'https://www.auchan.pt/pt/produtos/leite-mimosa',
        quantity: 2,
        unitPrice: 1.39,
        totalPrice: 2.78,
      },
      {
        productId: 'prod-002',
        name: 'Pao de Forma',
        productUrl: 'https://www.auchan.pt/pt/produtos/pao-de-forma',
        quantity: 1,
        unitPrice: 2.50,
        totalPrice: 2.50,
      },
    ],
    delivery: {
      type: 'Entrega em Casa',
      address: 'Rua Teste 123, Lisboa',
      dateTime: '2025-01-12 10:00-12:00',
    },
    costSummary: {
      subtotal: order.totalPrice - 5,
      deliveryFee: 5,
      total: order.totalPrice,
    },
  };
}

/**
 * Create sample cart items.
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
function createCartSnapshot(items: CartItem[]): CartSnapshot {
  return {
    timestamp: new Date(),
    items,
    itemCount: items.length,
    totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  };
}

// =============================================================================
// Mock Result Factories
// =============================================================================

function createScanCartResult(items: CartItem[]): ToolResult<ScanCartOutput> {
  const snapshot = createCartSnapshot(items);
  return {
    success: true,
    data: {
      snapshot,
      isEmpty: items.length === 0,
      cartUrl: 'https://www.auchan.pt/pt/carrinho-compras',
    },
    duration: 100,
  };
}

function createNavigateResult(): ToolResult<NavigateToOrderHistoryOutput> {
  return {
    success: true,
    data: {
      success: true,
      url: 'https://www.auchan.pt/pt/historico-encomendas',
    },
    duration: 100,
  };
}

function createLoadOrderHistoryResult(orders: OrderSummary[]): ToolResult<LoadOrderHistoryOutput> {
  return {
    success: true,
    data: {
      orders,
      totalAvailable: orders.length,
      hasMore: false,
    },
    duration: 100,
  };
}

function createLoadOrderDetailResult(order: OrderDetail): ToolResult<LoadOrderDetailOutput> {
  return {
    success: true,
    data: {
      order,
      allProductsLoaded: true,
    },
    duration: 100,
  };
}

function createReorderResult(itemsAdded: number): ToolResult<ReorderOutput> {
  return {
    success: true,
    data: {
      success: true,
      itemsAdded,
      failedItems: [],
      cartTotal: 0,
    },
    duration: 100,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CartBuilder E2E Tests', () => {
  let mockPage: Page;
  let context: AgentContext;
  let cartBuilder: CartBuilder;

  beforeEach(() => {
    vi.resetAllMocks();
    mockPage = createMockPage();
    context = createMockAgentContext(mockPage);
    cartBuilder = createCartBuilder({ maxOrdersToLoad: 1, mergeStrategy: 'latest' });
  });

  // ===========================================================================
  // 1. Happy Path Tests
  // ===========================================================================

  describe('Happy path - Complete flow from order history to cart diff report', () => {
    it('should complete full flow and return CartBuilderResult with all expected fields', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = []; // Empty cart
      const cartAfter = createSampleCartItems(); // Items after reorder

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.ordersLoaded).toBeDefined();
      expect(result.data?.cartBefore).toBeDefined();
      expect(result.data?.cartAfter).toBeDefined();
      expect(result.data?.diff).toBeDefined();
      expect(result.data?.report).toBeDefined();
    });

    it('should include correct cart diff with added items', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [];
      const cartAfter = createSampleCartItems();

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.added.length).toBe(2);
      expect(result.data?.diff.summary.addedCount).toBe(2);
      expect(result.data?.diff.summary.removedCount).toBe(0);
    });

    it('should generate report with sessionId and timestamps', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [];
      const cartAfter = createSampleCartItems();

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.data?.report.sessionId).toBe('test-session-001');
      expect(result.data?.report.timestamp).toBeInstanceOf(Date);
      expect(result.data?.report.ordersAnalyzed).toContain(orders[0]!.orderId);
    });

    it('should track screenshots in report', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        const result = scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
        result.screenshots = ['screenshot.png'];
        return result;
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.data?.report.screenshots).toBeDefined();
      expect(Array.isArray(result.data?.report.screenshots)).toBe(true);
    });

    it('should log progress steps', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.logs).toBeDefined();
      expect(result.logs.some((log) => log.includes('CartBuilder started'))).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Empty Order History Tests
  // ===========================================================================

  describe('Empty order history - Test handling when no orders exist', () => {
    it('should handle empty order history gracefully', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue(createScanCartResult([]));
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult([]));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.ordersLoaded).toEqual([]);
      expect(result.data?.orderDetails).toEqual([]);
    });

    it('should return empty diff when no orders to process', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue(createScanCartResult([]));
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult([]));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.data?.diff.added).toEqual([]);
      expect(result.data?.diff.removed).toEqual([]);
      expect(result.data?.diff.quantityChanged).toEqual([]);
    });
  });

  // ===========================================================================
  // 3. Auth Required Tests
  // ===========================================================================

  describe('Auth required - Test when tool returns auth error', () => {
    it('should fail when navigation to order history fails with auth error', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue(createScanCartResult([]));
      mockNavigateToOrderHistoryExecute.mockResolvedValue({
        success: false,
        error: {
          message: 'AUTH_ERROR: Login required',
          code: 'AUTH_ERROR',
          recoverable: true,
        },
        duration: 100,
      });

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('AUTH_ERROR');
    });

    it('should fail when order history load fails with auth redirect', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue(createScanCartResult([]));
      mockNavigateToOrderHistoryExecute.mockResolvedValue({
        success: true,
        data: {
          success: true,
          url: 'https://www.auchan.pt/pt/login',
        },
        duration: 100,
      });
      mockLoadOrderHistoryExecute.mockResolvedValue({
        success: false,
        error: {
          message: 'Expected to be on order history page',
          code: 'VALIDATION_ERROR',
          recoverable: false,
        },
        duration: 100,
      });

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. Cart Mismatch Tests
  // ===========================================================================

  describe('Cart mismatch - Test when cart differs from original order', () => {
    it('should detect items added to cart', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
        { productId: 'prod-002', name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.added.length).toBe(2);
      expect(result.data?.diff.added.map((i) => i.name)).toContain('Leite Mimosa');
      expect(result.data?.diff.added.map((i) => i.name)).toContain('Pao de Forma');
    });

    it('should detect items missing from cart', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
        { productId: 'prod-002', name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
        // Pao de Forma is missing
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.removed.length).toBe(1);
      expect(result.data?.diff.removed[0]?.name).toBe('Pao de Forma');
    });

    it('should detect quantity differences', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
      ];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 5, unitPrice: 1.39, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(1));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.quantityChanged.length).toBe(1);
      expect(result.data?.diff.quantityChanged[0]?.previousQuantity).toBe(2);
      expect(result.data?.diff.quantityChanged[0]?.newQuantity).toBe(5);
    });

    it('should calculate correct price difference', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 1, unitPrice: 1.39, available: true },
      ];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 1, unitPrice: 1.39, available: true },
        { productId: 'prod-002', name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      // Price difference: (1.39 + 2.50) - (1.39) = 2.50
      expect(result.data?.diff.summary.priceDifference).toBeCloseTo(2.50, 2);
    });

    it('should detect unchanged items', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
      ];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
        { productId: 'prod-002', name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.unchanged.length).toBe(1);
      expect(result.data?.diff.unchanged[0]?.name).toBe('Leite Mimosa');
    });
  });

  // ===========================================================================
  // 5. Partial Failures Tests
  // ===========================================================================

  describe('Partial failures - Test resilience when some tools fail', () => {
    it('should continue processing when one order detail fails to load', async () => {
      // Arrange
      const orders = createSampleOrders(2);
      cartBuilder = createCartBuilder({ maxOrdersToLoad: 2 });

      let loadOrderDetailCallCount = 0;
      mockLoadOrderDetailExecute.mockImplementation(() => {
        loadOrderDetailCallCount++;
        if (loadOrderDetailCallCount === 2) {
          return {
            success: false,
            error: { message: 'Failed to load order detail', code: 'TIMEOUT_ERROR', recoverable: true },
            duration: 100,
          };
        }
        return createLoadOrderDetailResult(createSampleOrderDetail(orders[0]!));
      });

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert - should succeed with partial results
      expect(result.success).toBe(true);
      expect(result.data?.orderDetails.length).toBe(1); // Only first order loaded
    });

    it('should continue when reorder fails for one order', async () => {
      // Arrange
      const orders = createSampleOrders(2);
      cartBuilder = createCartBuilder({ maxOrdersToLoad: 2 });

      let reorderCallCount = 0;
      mockReorderExecute.mockImplementation(() => {
        reorderCallCount++;
        if (reorderCallCount === 2) {
          return {
            success: false,
            error: { message: 'Reorder failed', code: 'UNKNOWN_ERROR', recoverable: false },
            duration: 100,
          };
        }
        return createReorderResult(2);
      });

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(
        createLoadOrderDetailResult(createSampleOrderDetail(orders[0]!))
      );

      // Act
      const result = await cartBuilder.run(context);

      // Assert - should succeed despite partial failure
      expect(result.success).toBe(true);
    });

    it('should return error when navigation to order history fails completely', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue(createScanCartResult([]));
      mockNavigateToOrderHistoryExecute.mockResolvedValue({
        success: false,
        error: { message: 'Navigation timeout', code: 'TIMEOUT_ERROR', recoverable: true },
        duration: 100,
      });

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.logs.some((log) => log.includes('Error'))).toBe(true);
    });

    it('should fail when initial cart scan fails', async () => {
      // Arrange
      mockScanCartExecute.mockResolvedValue({
        success: false,
        error: { message: 'Cart scan failed', code: 'SELECTOR_ERROR', recoverable: false },
        duration: 100,
      });

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // Additional Edge Case Tests
  // ===========================================================================

  describe('Edge cases', () => {
    it('should handle cart with unavailable items', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [];
      const cartAfter: CartItem[] = [
        { productId: 'prod-001', name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: false },
        { productId: 'prod-002', name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.added.length).toBe(2);
    });

    it('should use product name as key when productId is missing', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartBefore: CartItem[] = [
        { name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
      ];
      const cartAfter: CartItem[] = [
        { name: 'Leite Mimosa', quantity: 2, unitPrice: 1.39, available: true },
        { name: 'Pao de Forma', quantity: 1, unitPrice: 2.50, available: true },
      ];

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult(cartBefore)
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.diff.unchanged.length).toBe(1);
      expect(result.data?.diff.added.length).toBe(1);
    });

    it('should respect maxOrdersToLoad configuration', async () => {
      // Arrange
      const orders = createSampleOrders(5);
      cartBuilder = createCartBuilder({ maxOrdersToLoad: 2 });

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(
        createLoadOrderDetailResult(createSampleOrderDetail(orders[0]!))
      );
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.ordersLoaded.length).toBeLessThanOrEqual(2);
    });

    it('should generate report with confidence score', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(createSampleCartItems());
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.data?.report.confidence).toBeGreaterThan(0);
      expect(result.data?.report.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Safety Boundary Tests
  // ===========================================================================

  describe('Safety boundaries', () => {
    it('should never place an actual order - stops at cart preparation', async () => {
      // This test verifies the safety constraint that the agent never places orders

      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartAfter = createSampleCartItems();

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      // Verify no checkout or order placement methods were called on page
      expect(mockPage.goto).not.toHaveBeenCalledWith(
        expect.stringContaining('checkout'),
        expect.anything()
      );
      expect(mockPage.goto).not.toHaveBeenCalledWith(
        expect.stringContaining('payment'),
        expect.anything()
      );
      expect(mockPage.goto).not.toHaveBeenCalledWith(
        expect.stringContaining('confirm-order'),
        expect.anything()
      );
    });

    it('should only produce a review pack without modifying order state', async () => {
      // Arrange
      const orders = createSampleOrders(1);
      const orderDetail = createSampleOrderDetail(orders[0]!);
      const cartAfter = createSampleCartItems();

      let scanCartCallCount = 0;
      mockScanCartExecute.mockImplementation(() => {
        scanCartCallCount++;
        return scanCartCallCount === 1
          ? createScanCartResult([])
          : createScanCartResult(cartAfter);
      });
      mockNavigateToOrderHistoryExecute.mockResolvedValue(createNavigateResult());
      mockLoadOrderHistoryExecute.mockResolvedValue(createLoadOrderHistoryResult(orders));
      mockLoadOrderDetailExecute.mockResolvedValue(createLoadOrderDetailResult(orderDetail));
      mockReorderExecute.mockResolvedValue(createReorderResult(2));

      // Act
      const result = await cartBuilder.run(context);

      // Assert
      expect(result.success).toBe(true);
      // Result should be a diff report, not an order confirmation
      expect(result.data?.report).toBeDefined();
      expect(result.data?.report.diff).toBeDefined();
      // No order ID in result (would indicate order was placed)
      expect(result.data).not.toHaveProperty('orderPlacedId');
    });
  });
});
