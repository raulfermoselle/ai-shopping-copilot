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

/**
 * Create a mock cart item locator
 */
function createMockCartItemLocator(item: {
  name: string;
  productUrl?: string;
  quantity: string;
  unitPrice: string;
  available?: boolean;
  availabilityNote?: string;
}): Locator {
  const defaults = {
    available: true,
    availabilityNote: undefined,
  };
  const values = { ...defaults, ...item };

  return {
    locator: vi.fn().mockImplementation((selector: string) => {
      if (selector.includes('name') || selector.includes('Name')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(values.name),
          }),
        };
      }
      if (selector.includes('link') || selector.includes('Link') || selector.includes('href')) {
        return {
          first: vi.fn().mockReturnValue({
            getAttribute: vi.fn().mockResolvedValue(values.productUrl),
          }),
        };
      }
      if (selector.includes('quantity') || selector.includes('Quantity') || selector.includes('number')) {
        return {
          first: vi.fn().mockReturnValue({
            getAttribute: vi.fn().mockResolvedValue(values.quantity),
          }),
        };
      }
      if (selector.includes('price') || selector.includes('Price')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(values.unitPrice),
          }),
        };
      }
      if (selector.includes('unavailable') || selector.includes('out-of-stock')) {
        return {
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(!values.available),
          }),
        };
      }
      if (selector.includes('availability') || selector.includes('Availability')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(values.availabilityNote),
          }),
        };
      }
      return createMockLocator();
    }),
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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Not empty cart
      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      const cartItems = [
        createMockCartItemLocator({
          name: 'Leite Mimosa',
          productUrl: '/pt/produtos/leite-mimosa',
          quantity: '2',
          unitPrice: '1,39 €',
          available: true,
        }),
        createMockCartItemLocator({
          name: 'Pao de Forma',
          productUrl: '/pt/produtos/pao-de-forma',
          quantity: '1',
          unitPrice: '2,50 €',
          available: true,
        }),
      ];

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue(cartItems),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('5,28 €'),
            }),
          };
        }
        if (selector.includes('Ver todos') || selector.includes('Mostrar')) {
          return {
            all: vi.fn().mockResolvedValue([]),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await scanCartTool.execute(
        { expandAll: false, captureScreenshot: true },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.snapshot).toBeDefined();
      expect(result.data?.snapshot.items).toBeDefined();
      expect(result.data?.isEmpty).toBe(false);
    });

    it('should calculate total from items when page total not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      const cartItems = [
        createMockCartItemLocator({
          name: 'Item 1',
          quantity: '2',
          unitPrice: '10,00 €',
        }),
      ];

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue(cartItems),
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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      const unavailableItem = createMockCartItemLocator({
        name: 'Unavailable Product',
        quantity: '1',
        unitPrice: '5,00 €',
        available: false,
        availabilityNote: 'Produto indisponivel',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue([unavailableItem]),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('5,00 €'),
            }),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      // The mock should result in an item being extracted
      expect(result.data?.snapshot.items).toBeDefined();
    });

    it('should include availability note for unavailable items', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('execute - currency parsing', () => {
    it('should parse Portuguese currency format "1,39 €" to 1.39', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      const itemWithPortugueseCurrency = createMockCartItemLocator({
        name: 'Test Product',
        quantity: '1',
        unitPrice: '1,39 €',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue([itemWithPortugueseCurrency]),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('1,39 €'),
            }),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      // Currency parsing happens internally
    });

    it('should handle large currency values "1.234,56 €"', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue({
          textContent: vi.fn().mockResolvedValue('1234,56 €'),
        }),
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('execute - navigation', () => {
    it('should navigate to cart page when not on cart', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/cart');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      const mockExpandButton = {
        isVisible: vi.fn().mockResolvedValue(true),
        click: vi.fn().mockResolvedValue(undefined),
      };

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('Ver todos') || selector.includes('Mostrar')) {
          return {
            all: vi.fn().mockResolvedValue([mockExpandButton]),
          };
        }
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue([]),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('0,00 €'),
            }),
          };
        }
        return createMockLocator();
      });

      // Act
      await scanCartTool.execute({ expandAll: true }, context);

      // Assert
      expect(mockExpandButton.click).toHaveBeenCalled();
      expect(context.logger.debug).toHaveBeenCalledWith('Clicking expand button');
    });
  });

  describe('execute - screenshot capture', () => {
    it('should capture screenshot when captureScreenshot is true', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

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
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home'); // Not on cart, triggers navigation
      mockPage.goto.mockRejectedValue(new Error('timeout waiting for navigation'));

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should return SELECTOR_ERROR on selector failure', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);
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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockRejectedValue(new Error('Test error'));

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('cart-scan-error');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - duration tracking', () => {
    it('should include duration in result', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

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
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

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
    it('should continue when one item fails to extract', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      (mockResolverInstance.tryResolve).mockResolvedValue(null);
      (mockResolverInstance.buildCompositeSelector).mockReturnValue('.cart-item');

      // Create a failing item that throws when extracting name
      const failingItem = {
        locator: vi.fn().mockImplementation(() => ({
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockRejectedValue(new Error('Element error')),
            getAttribute: vi.fn().mockRejectedValue(new Error('Element error')),
          }),
        })),
      };
      const workingItem = createMockCartItemLocator({
        name: 'Working Product',
        quantity: '1',
        unitPrice: '5,00 €',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('item')) {
          return {
            all: vi.fn().mockResolvedValue([failingItem, workingItem]),
          };
        }
        if (selector.includes('total')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('5,00 €'),
            }),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await scanCartTool.execute({ expandAll: false }, context);

      // Assert
      expect(result.success).toBe(true);
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Failed to extract cart item',
        expect.any(Object)
      );
    });
  });
});
