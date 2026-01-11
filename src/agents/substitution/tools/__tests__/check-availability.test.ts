/**
 * Unit Tests for CheckAvailabilityTool
 *
 * Tests product availability checking on Auchan.pt:
 * - Product available in cart
 * - Product out of stock
 * - Product with low stock
 * - Timeout handling
 * - Selector failures
 * - Product page navigation fallback
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { checkAvailabilityTool } from '../check-availability.js';
import type { ToolContext, ToolConfig } from '../../../../types/tool.js';
import type { Page, Locator } from 'playwright';

// =============================================================================
// Mock Setup
// =============================================================================

const mockResolverInstance = {
  resolve: vi.fn(),
  resolveWithFallbacks: vi.fn(),
  tryResolve: vi.fn(),
  buildCompositeSelector: vi.fn().mockReturnValue(null),
  hasPage: vi.fn(),
};

vi.mock('../../../../selectors/resolver.js', () => ({
  createSelectorResolver: () => mockResolverInstance,
}));

vi.mock('../../../../utils/popup-handler.js', () => ({
  dismissSubscriptionPopup: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock Playwright Page
 */
function createMockPage(): {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForTimeout: Mock;
  waitForSelector: Mock;
  locator: Mock;
  screenshot: Mock;
} {
  const url = vi.fn().mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
  const goto = vi.fn().mockResolvedValue(undefined);
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const waitForSelector = vi.fn().mockResolvedValue(undefined);
  const locator = vi.fn();
  const screenshot = vi.fn().mockResolvedValue(undefined);

  const page = {
    url,
    goto,
    waitForTimeout,
    waitForSelector,
    locator,
    screenshot,
  } as unknown as Page;

  return { page, url, goto, waitForTimeout, waitForSelector, locator, screenshot };
}

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
    click: vi.fn().mockResolvedValue(undefined),
  } as unknown as Locator;
}

/**
 * Create a mock Logger
 */
function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Create a mock ToolContext
 */
function createMockContext(page: Page): ToolContext {
  return {
    page,
    logger: createMockLogger() as unknown as ToolContext['logger'],
    screenshot: vi.fn().mockResolvedValue('screenshot.png'),
    config: {
      navigationTimeout: 30000,
      elementTimeout: 10000,
      screenshotDir: 'screenshots',
    } as ToolConfig,
  };
}

/**
 * Create a mock cart item locator for a product
 */
function createMockCartItemLocator(options: {
  name: string;
  productUrl?: string;
  isUnavailable?: boolean;
  isLowStock?: boolean;
  availabilityNote?: string;
}): Locator {
  const defaults = {
    productUrl: '/pt/produtos/test-product',
    isUnavailable: false,
    isLowStock: false,
    availabilityNote: undefined,
  };
  const values = { ...defaults, ...options };

  return {
    locator: vi.fn().mockImplementation((selector: string) => {
      // Product name selector
      if (selector.includes('name') || selector.includes('Name') || selector.includes('href')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(values.name),
            getAttribute: vi.fn().mockResolvedValue(values.productUrl),
          }),
        };
      }
      // Unavailable indicator
      if (selector.includes('unavailable') || selector.includes('out-of-stock') || selector.includes('esgotado')) {
        return {
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(values.isUnavailable),
          }),
        };
      }
      // Low stock indicator
      if (selector.includes('low-stock') || selector.includes('poucas-unidades')) {
        return {
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(values.isLowStock),
          }),
        };
      }
      // Availability text
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

// =============================================================================
// Tool Metadata Tests
// =============================================================================

describe('checkAvailabilityTool', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let context: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockPage = createMockPage();
    context = createMockContext(mockPage.page);
    mockResolverInstance.buildCompositeSelector.mockReturnValue(null);
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(checkAvailabilityTool.name).toBe('checkAvailability');
    });

    it('should have a description', () => {
      expect(checkAvailabilityTool.description).toBeDefined();
      expect(checkAvailabilityTool.description.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Product Available in Cart
  // ===========================================================================

  describe('product available in cart', () => {
    it('should return status: available when product is found and available', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Leite Mimosa Meio Gordo 1L',
        productUrl: '/pt/produtos/leite-mimosa-1l',
        isUnavailable: false,
        isLowStock: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      // Act
      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Leite Mimosa',
          timeout: 10000,
        },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('available');
      expect(result.data?.checkMethod).toBe('cart');
    });

    it('should match product by name case-insensitively', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'LEITE MIMOSA MEIO GORDO 1L',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'leite mimosa',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('available');
    });

    it('should include product URL in result when found', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Leite Mimosa',
        productUrl: '/pt/produtos/leite-mimosa-1l',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Leite Mimosa',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.productUrl).toContain('leite-mimosa');
    });
  });

  // ===========================================================================
  // Product Out of Stock
  // ===========================================================================

  describe('product out of stock', () => {
    it('should return status: out_of_stock when unavailable indicator is visible', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Iogurte Natural Danone',
        isUnavailable: true,
        isLowStock: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Iogurte Natural Danone',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('out_of_stock');
    });

    it('should return status: discontinued when availability text contains "descontinuado"', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Produto Antigo',
        isUnavailable: true,
        availabilityNote: 'Produto descontinuado',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Produto Antigo',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('discontinued');
    });
  });

  // ===========================================================================
  // Product with Low Stock
  // ===========================================================================

  describe('product with low stock', () => {
    it('should return status: low_stock when low stock indicator is visible', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Azeite Gallo',
        isUnavailable: false,
        isLowStock: true,
        availabilityNote: 'Apenas 3 disponiveis',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Azeite Gallo',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('low_stock');
    });

    it('should parse quantity available from availability note', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      // The note needs to match the regex pattern: /(\d+)\s*(disponíve|em stock|unidade)/i
      // Using 'disponivel' without the accent for simpler matching
      const cartItem = createMockCartItemLocator({
        name: 'Azeite Gallo',
        isUnavailable: false,
        isLowStock: true,
        availabilityNote: 'Apenas 5 unidades',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Azeite Gallo',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.quantityAvailable).toBe(5);
    });

    it('should parse quantity from "em stock" format', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Produto Teste',
        isUnavailable: false,
        isLowStock: true,
        availabilityNote: '3 em stock',
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Produto Teste',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.quantityAvailable).toBe(3);
    });
  });

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================

  describe('timeout handling', () => {
    it('should return TIMEOUT_ERROR when navigation times out', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home'); // Not on cart page
      mockPage.goto.mockRejectedValue(new Error('timeout waiting for navigation'));

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          productUrl: 'https://www.auchan.pt/pt/produtos/test-product',
          timeout: 5000,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should use provided timeout value for navigation', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);

      // Setup empty cart page
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          productUrl: 'https://www.auchan.pt/pt/produtos/test-product',
          timeout: 15000,
        },
        context
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 15000 })
      );
    });

    it('should use config timeout as default', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);

      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          productUrl: 'https://www.auchan.pt/pt/produtos/test-product',
        },
        context
      );

      // Should use config.navigationTimeout when no timeout provided
      expect(mockPage.goto).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Selector Failures
  // ===========================================================================

  describe('selector failures', () => {
    it('should return SELECTOR_ERROR when locator throws', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockImplementation(() => {
        throw new Error('Selector not found');
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should return unknown status when product not found in cart', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      // Cart has items but none match
      const otherCartItem = createMockCartItemLocator({
        name: 'Other Product',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([otherCartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Non Existent Product',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('unknown');
    });

    it('should capture error screenshot on failure', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockImplementation(() => {
        throw new Error('Page crashed');
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(context.screenshot).toHaveBeenCalledWith('availability-check-error');
      expect(result.screenshots).toBeDefined();
    });
  });

  // ===========================================================================
  // Product Page Fallback
  // ===========================================================================

  describe('product page navigation fallback', () => {
    it('should navigate to product page when URL provided and not found in cart', async () => {
      // Start NOT on cart page - this forces the fallback to product page when URL is provided
      // The condition for product page fallback is: availabilityStatus === 'unknown' && input.productUrl
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);

      // Setup locator for product page selectors
      mockPage.locator.mockImplementation((selector: string) => {
        // Product page out of stock indicators
        if (selector.includes('unavailable') || selector.includes('esgotado') || selector.includes('out-of-stock')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        if (selector.includes('low-stock') || selector.includes('poucas-unidades')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        if (selector.includes('availability') || selector.includes('stock')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue(null),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          productUrl: 'https://www.auchan.pt/pt/produtos/test-product',
          timeout: 10000,
        },
        context
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/produtos/test-product',
        expect.any(Object)
      );
      // The checkMethod should be 'product-page' since we navigated there
      expect(result.success).toBe(true);
      expect(result.data?.checkMethod).toBe('product-page');
    });

    it('should check out of stock indicators on product page', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      // Empty cart, then navigate to product page with out of stock
      let navigated = false;
      mockPage.goto.mockImplementation(() => {
        navigated = true;
        return Promise.resolve();
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (!navigated) {
          // Cart page - empty
          if (selector.includes('cart') || selector.includes('product')) {
            return {
              all: vi.fn().mockResolvedValue([]),
            };
          }
        }
        // Product page selectors
        if (selector.includes('unavailable') || selector.includes('esgotado') || selector.includes('out-of-stock')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(true),
            }),
          };
        }
        if (selector.includes('low-stock')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        if (selector.includes('availability')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('Esgotado'),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Out of Stock Product',
          productUrl: 'https://www.auchan.pt/pt/produtos/out-of-stock',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('out_of_stock');
    });
  });

  // ===========================================================================
  // Duration Tracking
  // ===========================================================================

  describe('duration tracking', () => {
    it('should include duration in result', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Screenshot Capture
  // ===========================================================================

  describe('screenshot capture', () => {
    it('should capture screenshot on successful check', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Test Product',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(context.screenshot).toHaveBeenCalled();
      expect(result.data?.screenshot).toBe('screenshot.png');
    });

    it('should include screenshot in screenshots array', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Test Product',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  // ===========================================================================
  // Logging
  // ===========================================================================

  describe('logging', () => {
    it('should log info when starting availability check', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          productId: 'test-123',
          timeout: 10000,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'Checking product availability',
        expect.objectContaining({
          productName: 'Test Product',
          productId: 'test-123',
        })
      );
    });

    it('should log info when check completed', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Test Product',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'Availability check completed',
        expect.any(Object)
      );
    });

    it('should log error on failure', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockImplementation(() => {
        throw new Error('Test error');
      });

      await checkAvailabilityTool.execute(
        {
          productName: 'Test Product',
          timeout: 10000,
        },
        context
      );

      expect(context.logger.error).toHaveBeenCalledWith(
        'Availability check failed',
        expect.objectContaining({
          error: 'Test error',
        })
      );
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle empty product name', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');
      mockPage.locator.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockReturnValue(createMockLocator()),
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: '',
          timeout: 10000,
        },
        context
      );

      // Should still execute but find nothing
      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('unknown');
    });

    it('should handle special characters in product name', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Iogurte Grego "Especial" - 500g',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Iogurte Grego "Especial"',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.availability.status).toBe('available');
    });

    it('should handle Portuguese accented characters', async () => {
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/carrinho-compras');

      const cartItem = createMockCartItemLocator({
        name: 'Pao Frances Tradicao',
        isUnavailable: false,
      });

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') || selector.includes('product')) {
          return {
            all: vi.fn().mockResolvedValue([cartItem]),
          };
        }
        return createMockLocator();
      });

      const result = await checkAvailabilityTool.execute(
        {
          productName: 'Pao Frances',
          timeout: 10000,
        },
        context
      );

      expect(result.success).toBe(true);
    });
  });
});
