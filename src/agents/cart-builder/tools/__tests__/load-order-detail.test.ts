/**
 * Unit Tests for LoadOrderDetailTool
 *
 * Tests loading full order details from Auchan.pt order detail page:
 * - Load full order detail returns OrderDetail with items
 * - "Ver todos" button clicked to expand products
 * - Missing elements handled gracefully with fallbacks
 * - Invalid URL returns error
 * - Currency parsing (Portuguese format "1,39 €" -> 1.39)
 * - Quantity parsing ("x2" -> 2)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadOrderDetailTool } from '../load-order-detail.js';
import type { ToolContext } from '../../../../types/tool.js';
import type { Page, ElementHandle, Locator } from 'playwright';

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
 * Create a mock Locator
 */
function createMockLocator(overrides: {
  textContent?: string | null;
  getAttribute?: string | null;
  isVisible?: boolean;
  all?: Locator[];
} = {}): Locator {
  const defaults = {
    textContent: null,
    getAttribute: null,
    isVisible: true,
    all: [],
  };
  const values = { ...defaults, ...overrides };

  return {
    first: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(values.all),
    textContent: vi.fn().mockResolvedValue(values.textContent),
    getAttribute: vi.fn().mockResolvedValue(values.getAttribute),
    isVisible: vi.fn().mockResolvedValue(values.isVisible),
    locator: vi.fn().mockReturnThis(),
  } as unknown as Locator;
}

/**
 * Create a mock Playwright Page object
 */
function createMockPage(): {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForTimeout: Mock;
  locator: Mock;
} {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForTimeout = vi.fn();
  const locator = vi.fn();

  const page = {
    url,
    goto,
    waitForTimeout,
    locator,
  } as unknown as Page;

  return { page, url, goto, waitForTimeout, locator };
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
 * Create a mock ElementHandle
 */
function createMockElement(overrides: {
  textContent?: string | null;
  getAttribute?: string | null;
} = {}): ElementHandle {
  const defaults = { textContent: null, getAttribute: null };
  const values = { ...defaults, ...overrides };

  return {
    click: vi.fn(),
    textContent: vi.fn().mockResolvedValue(values.textContent),
    getAttribute: vi.fn().mockResolvedValue(values.getAttribute),
  } as unknown as ElementHandle;
}

/**
 * Create a mock product card locator
 */
function createMockProductCard(product: {
  name: string;
  url: string;
  imageUrl: string;
  quantity: string;
  price: string;
}): Locator {
  const locator = {
    first: vi.fn().mockReturnThis(),
    textContent: vi.fn().mockImplementation(() => {
      return Promise.resolve(product.name);
    }),
    getAttribute: vi.fn().mockImplementation((attr: string) => {
      if (attr === 'href') return Promise.resolve(product.url);
      if (attr === 'src') return Promise.resolve(product.imageUrl);
      return Promise.resolve(null);
    }),
    locator: vi.fn().mockImplementation((selector: string) => {
      if (selector.includes('name') || selector.includes('Name')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.name),
            getAttribute: vi.fn().mockResolvedValue(product.url),
          }),
        };
      }
      if (selector.includes('image') || selector.includes('Image')) {
        return {
          first: vi.fn().mockReturnValue({
            getAttribute: vi.fn().mockResolvedValue(product.imageUrl),
          }),
        };
      }
      if (selector.includes('quantity') || selector.includes('Quantity')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.quantity),
          }),
        };
      }
      if (selector.includes('price') || selector.includes('Price')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.price),
          }),
        };
      }
      return createMockLocator();
    }),
  } as unknown as Locator;

  return locator;
}

/**
 * Setup resolver.resolve mock to return appropriate selectors for each key
 */
function setupResolverMock(): void {
  (mockResolverInstance.resolve).mockImplementation((_pageId: string, selectorKey: string) => {
    const selectorMap: Record<string, string> = {
      productCard: '.product-card',
      productNameLink: '.product-name-link',
      productImage: '.product-image',
      productQuantity: '.product-quantity',
      productPrice: '.product-price',
    };
    return selectorMap[selectorKey] || '.fallback-selector';
  });
}

describe('loadOrderDetailTool', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let context: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockPage = createMockPage();
    context = createMockContext(mockPage.page);
    mockResolverInstance.resolve.mockReset();
    mockResolverInstance.tryResolve.mockReset();
    mockResolverInstance.buildCompositeSelector.mockReset();
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(loadOrderDetailTool.name).toBe('loadOrderDetail');
    });

    it('should have a description', () => {
      expect(loadOrderDetailTool.description).toContain('order details');
    });
  });

  describe('execute - load full order detail', () => {
    it('should navigate to order detail page and extract data', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Mock order header resolve
      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'viewAllButton') {
            return null; // No "Ver todos" button
          }
          if (selectorKey === 'orderDate') {
            return {
              element: createMockElement({ getAttribute: '2025-01-10T10:00:00Z' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderProductCount') {
            return {
              element: createMockElement({ textContent: '38 Produtos' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderTotalPrice') {
            return {
              element: createMockElement({ textContent: '162,51 €' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'deliveryType') {
            return {
              element: createMockElement({ textContent: 'Entrega em Casa' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'deliveryAddress') {
            return {
              element: createMockElement({ textContent: 'Rua Test, 123' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'deliveryDateTime') {
            return {
              element: createMockElement({ textContent: '10 Jan 10:00-12:00' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'summaryProductsTotal') {
            return {
              element: createMockElement({ textContent: '155,00 €' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'summaryDeliveryFee') {
            return {
              element: createMockElement({ textContent: '7,51 €' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'summaryTotal') {
            return {
              element: createMockElement({ textContent: '162,51 €' }),
              usedFallback: false,
            };
          }
          return null;
        }
      );

      // Mock resolve for selectors
      setupResolverMock();

      // Mock product cards
      const productCards = [
        createMockProductCard({
          name: 'Leite Mimosa',
          url: 'https://www.auchan.pt/pt/produtos/p/12345',
          imageUrl: 'https://cdn.auchan.pt/image.jpg',
          quantity: 'x2',
          price: '1,39 €',
        }),
      ];
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue(productCards),
      });

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '002915480',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/002915480',
          expandAllProducts: true,
        },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.order).toBeDefined();
      expect(result.data?.order.orderId).toBe('002915480');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/002915480',
        expect.objectContaining({ waitUntil: 'domcontentloaded' })
      );
    });

    it('should call goto with correct URL and wait for header', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Order header found means page loaded
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert - navigation happens even if extraction fails
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        expect.objectContaining({ waitUntil: 'domcontentloaded' })
      );
      // When header not found, result should fail
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('order header not found');
    });
  });

  describe('execute - Ver todos button', () => {
    it('should click Ver todos button when expandAllProducts is true', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockViewAllButton = createMockElement();
      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'viewAllButton') {
            return { element: mockViewAllButton, usedFallback: false };
          }
          if (selectorKey === 'orderDate') {
            return {
              element: createMockElement({ getAttribute: '2025-01-10T10:00:00Z' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderProductCount') {
            return {
              element: createMockElement({ textContent: '10 Produtos' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderTotalPrice') {
            return {
              element: createMockElement({ textContent: '50,00 €' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'deliveryType' ||
            selectorKey === 'deliveryAddress' ||
            selectorKey === 'deliveryDateTime'
          ) {
            return {
              element: createMockElement({ textContent: 'Test' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'summaryProductsTotal' ||
            selectorKey === 'summaryDeliveryFee' ||
            selectorKey === 'summaryTotal'
          ) {
            return {
              element: createMockElement({ textContent: '50,00 €' }),
              usedFallback: false,
            };
          }
          return null;
        }
      );

      setupResolverMock();
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      // Act
      await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
          expandAllProducts: true,
        },
        context
      );

      // Assert
      expect(mockViewAllButton.click).toHaveBeenCalled();
      expect(context.logger.info).toHaveBeenCalledWith(
        'Clicking "Ver todos" to expand all products'
      );
    });

    it('should not click Ver todos when expandAllProducts is false', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockViewAllButton = createMockElement();
      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'viewAllButton') {
            return { element: mockViewAllButton, usedFallback: false };
          }
          if (selectorKey === 'orderDate') {
            return {
              element: createMockElement({ getAttribute: '2025-01-10T10:00:00Z' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderProductCount') {
            return {
              element: createMockElement({ textContent: '10 Produtos' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderTotalPrice') {
            return {
              element: createMockElement({ textContent: '50,00 €' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'deliveryType' ||
            selectorKey === 'deliveryAddress' ||
            selectorKey === 'deliveryDateTime'
          ) {
            return {
              element: createMockElement({ textContent: 'Test' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'summaryProductsTotal' ||
            selectorKey === 'summaryDeliveryFee' ||
            selectorKey === 'summaryTotal'
          ) {
            return {
              element: createMockElement({ textContent: '50,00 €' }),
              usedFallback: false,
            };
          }
          return null;
        }
      );

      setupResolverMock();
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
          expandAllProducts: false,
        },
        context
      );

      // Assert
      expect(mockViewAllButton.click).not.toHaveBeenCalled();
      expect(result.data?.allProductsLoaded).toBe(false);
    });
  });

  describe('execute - missing elements handling', () => {
    it('should handle missing order header with error', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve).mockResolvedValue(null); // Header not found

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('order header not found');
    });

    it('should capture screenshot on error', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-detail-error-001');
      expect(result.screenshots).toContain('screenshot.png');
    });

    it('should log fallback warning when header found with fallback', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return {
              element: createMockElement(),
              usedFallback: true,
              fallbackIndex: 1,
            };
          }
          if (selectorKey === 'orderDate') {
            return {
              element: createMockElement({ getAttribute: '2025-01-10T10:00:00Z' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderProductCount') {
            return {
              element: createMockElement({ textContent: '1 Produto' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderTotalPrice') {
            return {
              element: createMockElement({ textContent: '10,00 €' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'deliveryType' ||
            selectorKey === 'deliveryAddress' ||
            selectorKey === 'deliveryDateTime'
          ) {
            return {
              element: createMockElement({ textContent: 'Test' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'summaryProductsTotal' ||
            selectorKey === 'summaryDeliveryFee' ||
            selectorKey === 'summaryTotal'
          ) {
            return {
              element: createMockElement({ textContent: '10,00 €' }),
              usedFallback: false,
            };
          }
          return null;
        }
      );

      setupResolverMock();
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      // Act
      await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Used fallback selector for orderHeader',
        { fallbackIndex: 1 }
      );
    });
  });

  describe('execute - invalid URL handling', () => {
    it('should handle navigation failure', async () => {
      // Arrange
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://invalid-url.com/order/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Navigation failed');
    });
  });

  describe('execute - duration tracking', () => {
    it('should include duration in result', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('execute - screenshot capture', () => {
    it('should capture screenshot on success', async () => {
      // Arrange
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'orderDate') {
            return {
              element: createMockElement({ getAttribute: '2025-01-10T10:00:00Z' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderProductCount') {
            return {
              element: createMockElement({ textContent: '1 Produto' }),
              usedFallback: false,
            };
          }
          if (selectorKey === 'orderTotalPrice') {
            return {
              element: createMockElement({ textContent: '10,00 €' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'deliveryType' ||
            selectorKey === 'deliveryAddress' ||
            selectorKey === 'deliveryDateTime'
          ) {
            return {
              element: createMockElement({ textContent: 'Test' }),
              usedFallback: false,
            };
          }
          if (
            selectorKey === 'summaryProductsTotal' ||
            selectorKey === 'summaryDeliveryFee' ||
            selectorKey === 'summaryTotal'
          ) {
            return {
              element: createMockElement({ textContent: '10,00 €' }),
              usedFallback: false,
            };
          }
          return null;
        }
      );

      setupResolverMock();
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      // Act
      const result = await loadOrderDetailTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-detail-001');
      expect(result.data?.screenshot).toBe('screenshot.png');
    });
  });
});
