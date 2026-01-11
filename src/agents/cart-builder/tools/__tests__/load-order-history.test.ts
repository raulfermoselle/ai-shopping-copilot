/**
 * Unit Tests for LoadOrderHistoryTool
 *
 * Tests extraction of order list from Auchan.pt order history page:
 * - Extract orders successfully returns OrderSummary[]
 * - Empty orders list returns empty array (not error)
 * - Partial extraction failures return what we have with warnings
 * - Not on correct page returns VALIDATION_ERROR
 * - Container/selector errors handled properly
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadOrderHistoryTool } from '../load-order-history.js';
import type { ToolContext } from '../../../../types/tool.js';
import type { Page, ElementHandle } from 'playwright';

// Create a shared mock resolver that all tests and the tool will use
const mockResolverInstance = {
  resolve: vi.fn(),
  resolveWithFallbacks: vi.fn(),
  tryResolve: vi.fn(),
  buildCompositeSelector: vi.fn(),
  hasPage: vi.fn(),
};

// Mock the SelectorResolver to return the shared instance
vi.mock('../../../../selectors/resolver.js', () => ({
  createSelectorResolver: () => mockResolverInstance,
}));

/**
 * Create a mock Playwright Page object
 */
function createMockPage(): {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForSelector: Mock;
  waitForTimeout: Mock;
  $$: Mock;
  $: Mock;
  locator: Mock;
} {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForSelector = vi.fn();
  const waitForTimeout = vi.fn();
  const $$ = vi.fn();
  const $ = vi.fn();
  const locator = vi.fn();

  const page = {
    url,
    goto,
    waitForSelector,
    waitForTimeout,
    $$,
    $,
    locator,
  } as unknown as Page;

  return { page, url, goto, waitForSelector, waitForTimeout, $$, $, locator };
}

/**
 * Create a mock ToolContext
 */
function createMockContext(page: Page): ToolContext {
  return {
    page,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    screenshot: vi.fn().mockResolvedValue('screenshot.png'),
    config: {
      navigationTimeout: 30000,
      elementTimeout: 10000,
      screenshotDir: 'screenshots',
    },
  } as unknown as ToolContext;
}

/**
 * Create a mock ElementHandle for order card
 */
function createMockOrderCard(overrides: {
  orderId?: string;
  date?: string;
  productCount?: string;
  totalPrice?: string;
  detailUrl?: string;
} = {}): ElementHandle {
  const defaults = {
    orderId: '002915480',
    date: '2025-01-10T10:30:00Z',
    productCount: '38 Produtos',
    totalPrice: '162,51 €',
    detailUrl: '/pt/conta/detalhes-encomenda/002915480',
  };

  const values = { ...defaults, ...overrides };

  const mockCard = {
    $: vi.fn().mockImplementation((selector: string) => {
      if (selector.includes('link') || selector.includes('Link')) {
        return Promise.resolve({
          getAttribute: vi.fn().mockResolvedValue(values.detailUrl),
        });
      }
      if (selector.includes('date') || selector.includes('Date')) {
        return Promise.resolve({
          getAttribute: vi.fn().mockResolvedValue(values.date),
          textContent: vi.fn().mockResolvedValue(values.date),
        });
      }
      if (selector.includes('number') || selector.includes('Number')) {
        return Promise.resolve({
          textContent: vi.fn().mockResolvedValue(`Encomenda ${values.orderId}`),
        });
      }
      if (selector.includes('count') || selector.includes('Count')) {
        return Promise.resolve({
          textContent: vi.fn().mockResolvedValue(values.productCount),
        });
      }
      if (selector.includes('price') || selector.includes('Price')) {
        return Promise.resolve({
          textContent: vi.fn().mockResolvedValue(values.totalPrice),
        });
      }
      return Promise.resolve(null);
    }),
  } as unknown as ElementHandle;

  return mockCard;
}

/**
 * Create a mock ElementHandle
 */
function createMockElement(): ElementHandle {
  return {
    click: vi.fn(),
    textContent: vi.fn(),
    getAttribute: vi.fn(),
  } as unknown as ElementHandle;
}

/**
 * Setup resolver.resolve mock to return appropriate selectors for each key
 */
function setupResolverMock(): void {
  (mockResolverInstance.resolve as Mock).mockImplementation((_pageId: string, selectorKey: string) => {
    const selectorMap: Record<string, string> = {
      orderCard: '.order-card',
      orderLink: '.order-link',
      orderDateDay: '.order-date',
      orderNumber: '.order-number',
      orderProductCount: '.product-count',
      orderTotalPrice: '.total-price',
    };
    return selectorMap[selectorKey] || '.fallback-selector';
  });
}

describe('loadOrderHistoryTool', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let context: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockPage = createMockPage();
    context = createMockContext(mockPage.page);
    // Reset all mock functions on the shared resolver instance
    mockResolverInstance.resolve.mockReset();
    mockResolverInstance.tryResolve.mockReset();
    mockResolverInstance.buildCompositeSelector.mockReset();
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(loadOrderHistoryTool.name).toBe('loadOrderHistory');
    });

    it('should have a description', () => {
      expect(loadOrderHistoryTool.description).toBe(
        'Extract order list from Auchan order history page'
      );
    });
  });

  describe('execute - URL validation', () => {
    it('should return VALIDATION_ERROR when not on order history page', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');

      // Act
      const result = await loadOrderHistoryTool.execute(
        { maxOrders: 10, includeDeliveryInfo: false },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('Expected to be on order history page');
      expect(result.error?.recoverable).toBe(false);
    });

    it('should log error when on wrong page', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho');

      // Act
      await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.logger.error).toHaveBeenCalledWith(
        'Not on order history page',
        expect.any(Object)
      );
    });
  });

  describe('execute - extract orders successfully', () => {
    it('should extract orders and return OrderSummary array', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();

      const orderCards = [
        createMockOrderCard({
          orderId: '001',
          date: '2025-01-10T10:00:00Z',
          productCount: '10 Produtos',
          totalPrice: '50,00 €',
          detailUrl: '/pt/conta/detalhes-encomenda/001',
        }),
        createMockOrderCard({
          orderId: '002',
          date: '2025-01-05T14:30:00Z',
          productCount: '25 Produtos',
          totalPrice: '120,50 €',
          detailUrl: '/pt/conta/detalhes-encomenda/002',
        }),
      ];
      mockPage.$$.mockResolvedValue(orderCards);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.orders).toHaveLength(2);
      expect(result.data?.orders[0]).toMatchObject({
        orderId: '001',
        productCount: 10,
        totalPrice: 50.0,
      });
      expect(result.data?.orders[1]).toMatchObject({
        orderId: '002',
        productCount: 25,
        totalPrice: 120.5,
      });
    });

    it('should respect maxOrders limit', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();

      const orderCards = [
        createMockOrderCard({ orderId: '001' }),
        createMockOrderCard({ orderId: '002' }),
        createMockOrderCard({ orderId: '003' }),
        createMockOrderCard({ orderId: '004' }),
        createMockOrderCard({ orderId: '005' }),
      ];
      mockPage.$$.mockResolvedValue(orderCards);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 3 }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.orders.length).toBeLessThanOrEqual(3);
      expect(result.data?.totalAvailable).toBe(5);
      expect(result.data?.hasMore).toBe(true);
    });

    it('should set hasMore to false when all orders loaded', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();

      const orderCards = [createMockOrderCard({ orderId: '001' })];
      mockPage.$$.mockResolvedValue(orderCards);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.data?.hasMore).toBe(false);
    });
  });

  describe('execute - empty orders list', () => {
    it('should return empty array when no orders found (not error)', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();
      mockPage.$$.mockResolvedValue([]); // Empty list

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.orders).toEqual([]);
      expect(result.data?.totalAvailable).toBe(0);
      expect(result.data?.hasMore).toBe(false);
    });

    it('should capture screenshot when empty', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();
      mockPage.$$.mockResolvedValue([]);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-history-empty');
      expect(result.screenshots).toContain('screenshot.png');
    });

    it('should log info when empty', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();
      mockPage.$$.mockResolvedValue([]);

      // Act
      await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.logger.info).toHaveBeenCalledWith(
        'No orders found in history (empty list)'
      );
    });
  });

  describe('execute - partial extraction failures', () => {
    it('should return extracted orders with warnings on partial failure', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();

      // One valid card, one with missing data
      const validCard = createMockOrderCard({ orderId: '001' });
      const invalidCard = {
        $: vi.fn().mockResolvedValue(null), // Missing all elements
      } as unknown as ElementHandle;

      mockPage.$$.mockResolvedValue([validCard, invalidCard]);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.orders.length).toBeGreaterThan(0);
      expect(context.logger.warn).toHaveBeenCalled();
    });

    it('should continue extraction when one card fails', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();

      const invalidCard = {
        $: vi.fn().mockRejectedValue(new Error('Element error')),
      } as unknown as ElementHandle;
      const validCard = createMockOrderCard({ orderId: '002' });

      mockPage.$$.mockResolvedValue([invalidCard, validCard]);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(true);
      // Should have at least processed the valid one
      expect(context.logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/Extraction failed/),
        expect.any(Object)
      );
    });
  });

  describe('execute - container not found', () => {
    it('should return SELECTOR_ERROR when container not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
      expect(result.error?.message).toContain('Order list container not found');
    });

    it('should capture screenshot when container not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-history-no-container');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - order card selector not registered', () => {
    it('should return SELECTOR_ERROR when order card selector not in registry', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      (mockResolverInstance.resolve as Mock).mockReturnValue(null); // Selector not found

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
      expect(result.error?.message).toContain('Order card selector not registered');
    });
  });

  describe('execute - fallback selector usage', () => {
    it('should log warning when container found with fallback', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list-fallback',
        usedFallback: true,
        fallbackIndex: 2,
      });
      setupResolverMock();
      mockPage.$$.mockResolvedValue([]);

      // Act
      await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Container found using fallback selector',
        { fallbackIndex: 2 }
      );
    });
  });

  describe('execute - duration tracking', () => {
    it('should include duration in result', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });
      setupResolverMock();
      mockPage.$$.mockResolvedValue([]);

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('execute - unexpected errors', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockRejectedValue(
        new Error('Unexpected DOM error')
      );

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_ERROR');
      expect(result.error?.message).toContain('Unexpected DOM error');
    });

    it('should capture screenshot on unexpected error', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockRejectedValue(new Error('Test error'));

      // Act
      const result = await loadOrderHistoryTool.execute({ maxOrders: 10 }, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith(
        'order-history-extraction-error'
      );
      expect(result.screenshots).toContain('screenshot.png');
    });
  });
});
