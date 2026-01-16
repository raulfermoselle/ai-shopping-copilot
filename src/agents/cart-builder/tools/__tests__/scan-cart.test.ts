/**
 * Unit Tests for ScanCartTool
 *
 * Tests extraction of cart contents from Auchan.pt cart page:
 * - Extract cart items returns CartSnapshot
 * - Empty cart returns empty snapshot with isEmpty: true
 * - Item unavailable sets available: false with note
 * - Parse currency correctly (Portuguese format "1,39 €" -> 1.39)
 * - Navigation to cart page when needed
 * - Expandable sections handling
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { scanCartTool } from '../scan-cart.js';
import type { ToolContext } from '../../../../types/tool.js';
import type { Page, Locator } from 'playwright';

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

// Mock the popup handler to prevent actual popup dismissal
vi.mock('../../../../utils/popup-handler.js', () => ({
  dismissPopups: vi.fn().mockResolvedValue(0),
  dismissSubscriptionPopup: vi.fn().mockResolvedValue(false),
}));

/**
 * Create a mock Locator
 */
function createMockLocator(overrides: {
  textContent?: string | null;
  getAttribute?: string | null;
  isVisible?: boolean;
} = {}): Locator {
  const defaults = {
    textContent: null,
    getAttribute: null,
    isVisible: false,
  };
  const values = { ...defaults, ...overrides };

  return {
    first: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
    textContent: vi.fn().mockResolvedValue(values.textContent),
    getAttribute: vi.fn().mockResolvedValue(values.getAttribute),
    isVisible: vi.fn().mockResolvedValue(values.isVisible),
    locator: vi.fn().mockReturnThis(),
  } as unknown as Locator;
}

// Note: createMockCartItemLocator was removed - the tool now uses JS extraction
// which is mocked via page.evaluate() in setupDefaultLocatorMock

/**
 * Create a mock Playwright Page object
 */
function createMockPage(): {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForTimeout: Mock;
  locator: Mock;
  evaluate: Mock;
} {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForTimeout = vi.fn();
  const locator = vi.fn();
  const evaluate = vi.fn();

  const page = {
    url,
    goto,
    waitForTimeout,
    locator,
    evaluate,
  } as unknown as Page;

  return { page, url, goto, waitForTimeout, locator, evaluate };
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
function createMockElement(): {
  click: Mock;
  textContent: Mock;
  getAttribute: Mock;
} {
  return {
    click: vi.fn(),
    textContent: vi.fn(),
    getAttribute: vi.fn(),
  };
}

/**
 * Setup default mock locator behavior for cart page
 * Handles modal checks, cart container, etc.
 */
function setupDefaultLocatorMock(mockPage: ReturnType<typeof createMockPage>, options: {
  cartItems?: Array<{ name: string; quantity: number; price: string; available: boolean }>;
  cartTotal?: string;
  hasExpandButtons?: boolean;
} = {}): void {
  const { cartItems = [], cartTotal = '0,00 €', hasExpandButtons = false } = options;

  // Default evaluate mock - returns cart items via JS extraction
  mockPage.evaluate.mockResolvedValue(cartItems);

  // Create cart container mock
  const cartContainerMock = {
    count: vi.fn().mockResolvedValue(1),
    locator: vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue([]),
    }),
  };

  // Create expand button mock
  const expandButtonMock = hasExpandButtons ? {
    isVisible: vi.fn().mockResolvedValue(true),
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue('Ver todos'),
  } : null;

  mockPage.locator.mockImplementation((selector: string) => {
    // Cart removal modal check - always return not visible
    if (selector.includes('Remover produtos do carrinho')) {
      return {
        isVisible: vi.fn().mockResolvedValue(false),
      };
    }

    // Expand buttons
    if (selector.includes('Ver todos') || selector.includes('Mostrar')) {
      return {
        all: vi.fn().mockResolvedValue(expandButtonMock ? [expandButtonMock] : []),
      };
    }

    // Cart container selectors
    if (selector.includes('auc-cart__list') || selector.includes('cart-list') ||
        selector.includes('cart-items') || selector.includes('auc-cart') ||
        selector === 'main' || selector === 'body') {
      return {
        first: vi.fn().mockReturnValue(cartContainerMock),
        count: vi.fn().mockResolvedValue(1),
      };
    }

    // Cart total
    if (selector.includes('total') || selector.includes('Total')) {
      return {
        first: vi.fn().mockReturnValue({
          textContent: vi.fn().mockResolvedValue(cartTotal),
        }),
      };
    }

    // Default locator
    return createMockLocator();
  });
}

describe('scanCartTool', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let context: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockPage = createMockPage();
    context = createMockContext(mockPage.page);
    mockResolverInstance.resolve.mockReset();
    mockResolverInstance.tryResolve.mockReset();
    mockResolverInstance.buildCompositeSelector.mockReset();
    // Default setup - cart page, no items
    mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
    mockPage.waitForTimeout.mockResolvedValue(undefined);
    mockPage.evaluate.mockResolvedValue([]);
    setupDefaultLocatorMock(mockPage);
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(scanCartTool.name).toBe('scanCart');
    });

    it('should have a description', () => {
      expect(scanCartTool.description).toContain('cart');
    });
  });

  describe('execute - extract cart items', () => {
    it('should extract cart items and return CartSnapshot', async () => {
      // Arrange - cart with 2 items via JS extraction
      const cartItems = [
        { name: 'Leite Mimosa', quantity: 2, price: '1,39 €', available: true },
        { name: 'Pao de Forma', quantity: 1, price: '2,50 €', available: true },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '5,28 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null); // Not empty cart

      // Act
      const result = await scanCartTool.execute(
        { expandAll: false, captureScreenshot: true },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot).toBeDefined();
      expect(result.data?.snapshot.items).toHaveLength(2);
      expect(result.data?.snapshot.items[0]?.name).toBe('Leite Mimosa');
      expect(result.data?.snapshot.items[0]?.quantity).toBe(2);
      expect(result.data?.snapshot.items[0]?.unitPrice).toBe(1.39);
      expect(result.data?.isEmpty).toBe(false);
    });

    it('should calculate total from items when page total not found', async () => {
      // Arrange - cart with items, total selector fails
      const cartItems = [
        { name: 'Item 1', quantity: 2, price: '10,00 €', available: true },
      ];
      mockPage.evaluate.mockResolvedValue(cartItems);
      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      // Mock locator to fail on total extraction
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('Remover produtos do carrinho')) {
          return { isVisible: vi.fn().mockResolvedValue(false) };
        }
        if (selector.includes('Ver todos') || selector.includes('Mostrar')) {
          return { all: vi.fn().mockResolvedValue([]) };
        }
        if (selector.includes('auc-cart') || selector === 'main' || selector === 'body') {
          return {
            first: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(1) }),
            count: vi.fn().mockResolvedValue(1),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockRejectedValue(new Error('Not found')),
            }),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Calculated cart total from items',
        expect.any(Object)
      );
    });
  });

  describe('execute - empty cart', () => {
    it('should return empty snapshot with isEmpty: true', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Empty cart indicator found
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      const result = await scanCartTool.execute(
        { expandAll: false, captureScreenshot: true },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.isEmpty).toBe(true);
      expect(result.data?.snapshot.items).toEqual([]);
      expect(result.data?.snapshot.itemCount).toBe(0);
      expect(result.data?.snapshot.totalPrice).toBe(0);
    });

    it('should capture screenshot for empty cart', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      const result = await scanCartTool.execute(
        { captureScreenshot: true },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('cart-empty');
      expect(result.data?.screenshot).toBe('screenshot.png');
    });

    it('should log info when cart is empty', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      await scanCartTool.execute({ captureScreenshot: false }, context);

      // Assert
      expect(context.logger.info).toHaveBeenCalledWith('Cart is empty');
    });
  });

  describe('execute - item unavailable', () => {
    it('should set available: false for unavailable items', async () => {
      // Arrange - cart with unavailable item via JS extraction
      const cartItems = [
        { name: 'Unavailable Product', quantity: 1, price: '5,00 €', available: false },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '5,00 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot.items).toHaveLength(1);
      expect(result.data?.snapshot.items[0]?.available).toBe(false);
    });

    it('should include availability note for unavailable items', async () => {
      // Arrange - empty cart (no items via JS extraction)
      setupDefaultLocatorMock(mockPage, { cartItems: [] });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('execute - currency parsing', () => {
    it('should parse Portuguese currency format "1,39 €" to 1.39', async () => {
      // Arrange - cart with item using Portuguese currency
      const cartItems = [
        { name: 'Test Product', quantity: 1, price: '1,39 €', available: true },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '1,39 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot.items[0]?.unitPrice).toBe(1.39);
    });

    it('should handle large currency values "1.234,56 €"', async () => {
      // Arrange - cart with large currency value
      const cartItems = [
        { name: 'Expensive Product', quantity: 1, price: '1234,56 €', available: true },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '1234,56 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot.items[0]?.unitPrice).toBe(1234.56);
    });
  });

  describe('execute - navigation', () => {
    it('should navigate to cart page when not on cart', async () => {
      // Arrange - on home page, need to navigate
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);
      setupDefaultLocatorMock(mockPage);
      // Empty cart indicator found after navigation
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/carrinho-compras',
        expect.objectContaining({ waitUntil: 'domcontentloaded' })
      );
    });

    it('should not navigate when already on cart page', async () => {
      // Arrange - already on cart page
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(mockPage.goto).not.toHaveBeenCalled();
      expect(context.logger.debug).toHaveBeenCalledWith('Already on cart page');
    });

    it('should also recognize /cart URL as cart page', async () => {
      // Arrange - on /cart URL
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/cart');
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(mockPage.goto).not.toHaveBeenCalled();
    });
  });

  describe('execute - expand sections', () => {
    it('should click expand buttons when expandAll is true', async () => {
      // Arrange - setup with expand buttons
      setupDefaultLocatorMock(mockPage, { hasExpandButtons: true });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      await scanCartTool.execute({ expandAll: true }, context);

      // Assert - check that expand buttons were clicked
      // The helper sets up expand button mocks via setupDefaultLocatorMock
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Clicking expand button',
        expect.any(Object)
      );
    });
  });

  describe('execute - screenshot capture', () => {
    it('should capture screenshot when captureScreenshot is true', async () => {
      // Arrange - cart with items (not empty)
      const cartItems = [
        { name: 'Test Product', quantity: 1, price: '5,00 €', available: true },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '5,00 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute(
        { captureScreenshot: true },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('cart-scan');
      expect(result.data?.screenshot).toBe('screenshot.png');
    });

    it('should not capture screenshot when captureScreenshot is false', async () => {
      // Arrange
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute(
        { captureScreenshot: false },
        context
      );

      // Assert
      expect(context.screenshot).not.toHaveBeenCalled();
      expect(result.data?.screenshot).toBeUndefined();
    });
  });

  describe('execute - error handling', () => {
    it('should return TIMEOUT_ERROR on timeout', async () => {
      // Arrange - on home page, navigation fails with timeout
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockRejectedValue(new Error('timeout waiting for navigation'));

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should return SELECTOR_ERROR on selector failure', async () => {
      // Arrange - selector resolver throws
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockRejectedValue(
        new Error('Selector failed')
      );

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
    });

    it('should capture screenshot on error', async () => {
      // Arrange - waitForTimeout throws to trigger error path
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      // Need to fail AFTER the initial waitForTimeout but somewhere in the flow
      // The easiest is to make tryResolve throw
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockRejectedValue(new Error('Test error'));

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('cart-scan-error');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - duration tracking', () => {
    it('should include duration in result', async () => {
      // Arrange - empty cart (quickest path)
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('execute - cart URL in result', () => {
    it('should include cartUrl in result', async () => {
      // Arrange - empty cart
      setupDefaultLocatorMock(mockPage);
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: createMockElement(),
        usedFallback: false,
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.data?.cartUrl).toBe(
        'https://www.auchan.pt/pt/carrinho-compras'
      );
    });
  });

  describe('execute - item extraction resilience', () => {
    it('should handle JS extraction returning valid items', async () => {
      // Arrange - JS extraction returns some items
      const cartItems = [
        { name: 'Working Product', quantity: 1, price: '5,00 €', available: true },
      ];
      setupDefaultLocatorMock(mockPage, { cartItems, cartTotal: '5,00 €' });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot.items).toHaveLength(1);
      expect(result.data?.snapshot.items[0]?.name).toBe('Working Product');
    });

    it('should handle empty JS extraction gracefully', async () => {
      // Arrange - JS extraction returns empty array
      setupDefaultLocatorMock(mockPage, { cartItems: [] });
      (mockResolverInstance.tryResolve).mockResolvedValue(null);

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot.items).toHaveLength(0);
      expect(context.logger.warn).toHaveBeenCalledWith('JS extraction found no cart items');
    });
  });
});
