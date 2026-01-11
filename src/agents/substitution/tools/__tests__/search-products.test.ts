/**
 * Unit Tests for SearchProductsTool
 *
 * Tests product search functionality on Auchan.pt:
 * - Search with results
 * - Search with no results
 * - Pagination handling (maxResults)
 * - Price extraction
 * - Product card parsing
 * - Timeout and error handling
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { searchProductsTool } from '../search-products.js';
import type { ToolContext, ToolConfig } from '../../../../types/tool.js';
import type { Page, Locator } from 'playwright';
import type { SubstituteCandidate } from '../../types.js';

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
// Mock Product Data
// =============================================================================

const MOCK_SEARCH_RESULTS: SubstituteCandidate[] = [
  {
    productId: 'leite-mimosa-meio-gordo-1l',
    name: 'Leite Mimosa Meio Gordo 1L',
    productUrl: 'https://www.auchan.pt/pt/produtos/leite-mimosa-meio-gordo-1l',
    brand: 'Mimosa',
    size: '1L',
    unitPrice: 1.39,
    pricePerUnit: '1,39 EUR/L',
    imageUrl: 'https://www.auchan.pt/images/leite-mimosa.jpg',
    available: true,
  },
  {
    productId: 'leite-terra-nostra-1l',
    name: 'Leite Terra Nostra Meio Gordo 1L',
    productUrl: 'https://www.auchan.pt/pt/produtos/leite-terra-nostra-1l',
    brand: 'Terra Nostra',
    size: '1L',
    unitPrice: 1.29,
    pricePerUnit: '1,29 EUR/L',
    imageUrl: 'https://www.auchan.pt/images/leite-terra-nostra.jpg',
    available: true,
  },
  {
    productId: 'leite-agros-1l',
    name: 'Leite Agros Meio Gordo 1L',
    productUrl: 'https://www.auchan.pt/pt/produtos/leite-agros-1l',
    brand: 'Agros',
    size: '1L',
    unitPrice: 1.35,
    pricePerUnit: '1,35 EUR/L',
    imageUrl: 'https://www.auchan.pt/images/leite-agros.jpg',
    available: true,
  },
  {
    productId: 'leite-auchan-1l',
    name: 'Leite Auchan Meio Gordo 1L',
    productUrl: 'https://www.auchan.pt/pt/produtos/leite-auchan-1l',
    brand: 'Auchan',
    size: '1L',
    unitPrice: 0.99,
    pricePerUnit: '0,99 EUR/L',
    imageUrl: 'https://www.auchan.pt/images/leite-auchan.jpg',
    available: true,
  },
  {
    productId: 'leite-mimosa-magro-1l',
    name: 'Leite Mimosa Magro 1L',
    productUrl: 'https://www.auchan.pt/pt/produtos/leite-mimosa-magro-1l',
    brand: 'Mimosa',
    size: '1L',
    unitPrice: 1.45,
    pricePerUnit: '1,45 EUR/L',
    imageUrl: 'https://www.auchan.pt/images/leite-mimosa-magro.jpg',
    available: false, // Out of stock
  },
];

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
  const url = vi.fn().mockReturnValue('https://www.auchan.pt/pt/pesquisa?q=leite');
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
 * Create a mock product card locator from SubstituteCandidate
 */
function createMockProductCardLocator(product: SubstituteCandidate): Locator {
  return {
    locator: vi.fn().mockImplementation((selector: string) => {
      // Product name
      if (selector.includes('name') || selector.includes('Name') || selector.includes('title') || selector.includes('h2') || selector.includes('h3') || selector.includes('h4')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.name),
          }),
        };
      }
      // Product URL
      if (selector.includes('href') || selector.includes('produtos')) {
        return {
          first: vi.fn().mockReturnValue({
            getAttribute: vi.fn().mockResolvedValue(product.productUrl),
          }),
        };
      }
      // Price
      if (selector.includes('price') || selector.includes('Price')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(
              `${product.unitPrice.toFixed(2).replace('.', ',')} \u20AC`
            ),
          }),
        };
      }
      // Price per unit
      if (selector.includes('per-unit') || selector.includes('unit-price')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.pricePerUnit ?? null),
          }),
        };
      }
      // Brand
      if (selector.includes('brand') || selector.includes('Brand')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.brand ?? null),
          }),
        };
      }
      // Size
      if (selector.includes('size') || selector.includes('Size') || selector.includes('weight')) {
        return {
          first: vi.fn().mockReturnValue({
            textContent: vi.fn().mockResolvedValue(product.size ?? null),
          }),
        };
      }
      // Image
      if (selector.includes('img')) {
        return {
          first: vi.fn().mockReturnValue({
            getAttribute: vi.fn().mockResolvedValue(product.imageUrl ?? null),
          }),
        };
      }
      // Unavailable indicator
      if (selector.includes('unavailable') || selector.includes('esgotado') || selector.includes('out-of-stock')) {
        return {
          first: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(!product.available),
          }),
        };
      }
      return createMockLocator();
    }),
  } as unknown as Locator;
}

/**
 * Setup page mock for search results
 */
function setupSearchMock(
  mockPage: ReturnType<typeof createMockPage>,
  products: SubstituteCandidate[],
  totalCount?: number
) {
  const productLocators = products.map(createMockProductCardLocator);

  mockPage.locator.mockImplementation((selector: string) => {
    // Product cards
    if (
      selector.includes('product-card') ||
      selector.includes('product-tile') ||
      selector.includes('product-item') ||
      selector.includes('article')
    ) {
      return {
        all: vi.fn().mockResolvedValue(productLocators),
      };
    }
    // No results indicator
    if (selector.includes('no-result') || selector.includes('empty') || selector.includes('Nao encontramos')) {
      return {
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(products.length === 0),
        }),
      };
    }
    // Result count
    if (selector.includes('count') || selector.includes('result')) {
      return {
        first: vi.fn().mockReturnValue({
          textContent: vi.fn().mockResolvedValue(
            `${totalCount ?? products.length} resultados`
          ),
        }),
      };
    }
    // Search results container
    if (selector.includes('grid') || selector.includes('results') || selector.includes('search')) {
      return createMockLocator({ isVisible: products.length > 0 });
    }
    return createMockLocator();
  });

  mockPage.waitForSelector.mockResolvedValue(undefined);
}

// =============================================================================
// Tool Metadata Tests
// =============================================================================

describe('searchProductsTool', () => {
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
      expect(searchProductsTool.name).toBe('searchProducts');
    });

    it('should have a description', () => {
      expect(searchProductsTool.description).toBeDefined();
      expect(searchProductsTool.description.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Search with Results
  // ===========================================================================

  describe('search with results', () => {
    it('should return products when search has results', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 3));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products.length).toBe(3);
      expect(result.data?.hasResults).toBe(true);
    });

    it('should navigate to search URL with encoded query', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'leite mimosa',
          maxResults: 10,
        },
        context
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('pesquisa?q=leite%20mimosa'),
        expect.any(Object)
      );
    });

    it('should extract product name from search results', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.name).toBe('Leite Mimosa Meio Gordo 1L');
    });

    it('should extract product URL from search results', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.productUrl).toContain('leite-mimosa');
    });

    it('should include search query in result', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'iogurte danone',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.searchQuery).toBe('iogurte danone');
    });

    it('should include total found count', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 3), 25);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.totalFound).toBe(25);
    });
  });

  // ===========================================================================
  // Search with No Results
  // ===========================================================================

  describe('search with no results', () => {
    it('should return hasResults: false when no products found', async () => {
      setupSearchMock(mockPage, []);

      const result = await searchProductsTool.execute(
        {
          query: 'produto inexistente xyz123',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products).toEqual([]);
      expect(result.data?.hasResults).toBe(false);
      expect(result.data?.totalFound).toBe(0);
    });

    it('should capture screenshot when no results found', async () => {
      setupSearchMock(mockPage, []);

      const result = await searchProductsTool.execute(
        {
          query: 'produto inexistente',
          maxResults: 10,
        },
        context
      );

      expect(context.screenshot).toHaveBeenCalledWith('search-no-results');
      expect(result.data?.screenshot).toBe('screenshot.png');
    });

    it('should log info when no results found', async () => {
      setupSearchMock(mockPage, []);

      await searchProductsTool.execute(
        {
          query: 'produto xyz',
          maxResults: 10,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'No search results found',
        expect.objectContaining({ query: 'produto xyz' })
      );
    });
  });

  // ===========================================================================
  // Pagination / maxResults
  // ===========================================================================

  describe('pagination handling (maxResults)', () => {
    it('should respect maxResults limit', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 2,
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products.length).toBeLessThanOrEqual(2);
    });

    it('should use default maxResults of 10', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      // Default is 10, but we only have 5 mock products
      expect(result.data?.products.length).toBeLessThanOrEqual(10);
    });

    it('should return fewer products than maxResults when not enough found', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 50,
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products.length).toBe(2);
    });
  });

  // ===========================================================================
  // Price Extraction
  // ===========================================================================

  describe('price extraction', () => {
    it('should parse Portuguese currency format "1,39 EUR"', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite mimosa',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.unitPrice).toBe(1.39);
    });

    it('should parse price with spaces "1,39 EUR"', async () => {
      const productWithSpacePrice: SubstituteCandidate = {
        ...MOCK_SEARCH_RESULTS[0]!,
        unitPrice: 2.5,
      };

      setupSearchMock(mockPage, [productWithSpacePrice]);

      const result = await searchProductsTool.execute(
        {
          query: 'test',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.unitPrice).toBe(2.5);
    });

    it('should handle price extraction failure gracefully', async () => {
      // Create a product card that fails to return price
      const failingPriceProduct = {
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('name') || selector.includes('h2')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('Test Product'),
              }),
            };
          }
          if (selector.includes('price')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockRejectedValue(new Error('Element not found')),
              }),
            };
          }
          if (selector.includes('href')) {
            return {
              first: vi.fn().mockReturnValue({
                getAttribute: vi.fn().mockResolvedValue('/pt/produtos/test'),
              }),
            };
          }
          if (selector.includes('unavailable')) {
            return {
              first: vi.fn().mockReturnValue({
                isVisible: vi.fn().mockResolvedValue(false),
              }),
            };
          }
          return createMockLocator();
        }),
      } as unknown as Locator;

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article')) {
          return {
            all: vi.fn().mockResolvedValue([failingPriceProduct]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'test',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      // Price should default to 0 when extraction fails
      expect(result.data?.products[0]?.unitPrice).toBe(0);
    });

    it('should extract price per unit when available', async () => {
      // Create a product locator that explicitly returns pricePerUnit
      const productWithPricePerUnit = {
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('name') || selector.includes('h2') || selector.includes('h3') || selector.includes('h4') || selector.includes('title')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('Leite Mimosa Meio Gordo 1L'),
              }),
            };
          }
          if (selector.includes('href') || selector.includes('produtos')) {
            return {
              first: vi.fn().mockReturnValue({
                getAttribute: vi.fn().mockResolvedValue('https://www.auchan.pt/pt/produtos/leite-mimosa'),
              }),
            };
          }
          if (selector.includes('per-unit') || selector.includes('unit-price') || selector.includes('price-unit')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('1,39 EUR/L'),
              }),
            };
          }
          if (selector.includes('price') || selector.includes('Price')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('1,39 \u20AC'),
              }),
            };
          }
          if (selector.includes('unavailable') || selector.includes('esgotado')) {
            return {
              first: vi.fn().mockReturnValue({
                isVisible: vi.fn().mockResolvedValue(false),
              }),
            };
          }
          return createMockLocator();
        }),
      } as unknown as Locator;

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article') || selector.includes('product-tile')) {
          return {
            all: vi.fn().mockResolvedValue([productWithPricePerUnit]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        if (selector.includes('count')) {
          return {
            first: vi.fn().mockReturnValue({
              textContent: vi.fn().mockResolvedValue('1 resultados'),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.pricePerUnit).toBe('1,39 EUR/L');
    });
  });

  // ===========================================================================
  // Product Card Parsing
  // ===========================================================================

  describe('product card parsing', () => {
    it('should extract brand from product card', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.brand).toBe('Mimosa');
    });

    it('should extract size/weight from product card', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.size).toBe('1L');
    });

    it('should extract size from product name when not in dedicated element', async () => {
      // Product with size only in name
      const productWithSizeInName: SubstituteCandidate = {
        productId: 'test-product',
        name: 'Produto Teste 500g',
        productUrl: 'https://www.auchan.pt/pt/produtos/test',
        unitPrice: 2.99,
        size: undefined, // No dedicated size element
        available: true,
      };

      // Create locator that returns size from name parsing
      const productLocator = {
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('name') || selector.includes('h2')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue(productWithSizeInName.name),
              }),
            };
          }
          if (selector.includes('size') || selector.includes('weight')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockRejectedValue(new Error('Not found')),
              }),
            };
          }
          if (selector.includes('price')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('2,99 \u20AC'),
              }),
            };
          }
          if (selector.includes('href')) {
            return {
              first: vi.fn().mockReturnValue({
                getAttribute: vi.fn().mockResolvedValue(productWithSizeInName.productUrl),
              }),
            };
          }
          if (selector.includes('unavailable')) {
            return {
              first: vi.fn().mockReturnValue({
                isVisible: vi.fn().mockResolvedValue(false),
              }),
            };
          }
          return createMockLocator();
        }),
      } as unknown as Locator;

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article')) {
          return {
            all: vi.fn().mockResolvedValue([productLocator]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'produto teste',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.size).toBe('500g');
    });

    it('should extract image URL from product card', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.imageUrl).toContain('leite-mimosa.jpg');
    });

    it('should extract product ID from URL', async () => {
      setupSearchMock(mockPage, [MOCK_SEARCH_RESULTS[0]!]);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.productId).toContain('leite-mimosa');
    });

    it('should mark available products correctly', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 5,
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.available).toBe(true);
    });

    it('should skip products without name', async () => {
      const namelessProduct = {
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('name') || selector.includes('h2')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue(''),
              }),
            };
          }
          return createMockLocator();
        }),
      } as unknown as Locator;

      const validProduct = createMockProductCardLocator(MOCK_SEARCH_RESULTS[0]!);

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article')) {
          return {
            all: vi.fn().mockResolvedValue([namelessProduct, validProduct]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 5,
        },
        context
      );

      expect(result.success).toBe(true);
      // Should only have 1 product (the valid one)
      expect(result.data?.products.length).toBe(1);
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Skipping product without name',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Available Only Filter
  // ===========================================================================

  describe('availableOnly filter', () => {
    it('should filter out unavailable products when availableOnly is true', async () => {
      // Include both available and unavailable products
      const mixedProducts = [
        MOCK_SEARCH_RESULTS[0]!, // available
        MOCK_SEARCH_RESULTS[4]!, // unavailable
      ];
      setupSearchMock(mockPage, mixedProducts);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
          availableOnly: true,
        },
        context
      );

      expect(result.success).toBe(true);
      // Should only have 1 available product
      expect(result.data?.products.length).toBe(1);
      expect(result.data?.products[0]?.available).toBe(true);
    });

    it('should include unavailable products when availableOnly is false', async () => {
      const mixedProducts = [
        MOCK_SEARCH_RESULTS[0]!, // available
        MOCK_SEARCH_RESULTS[4]!, // unavailable
      ];
      setupSearchMock(mockPage, mixedProducts);

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
          availableOnly: false,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products.length).toBe(2);
    });

    it('should default availableOnly to true', async () => {
      // Verify that availableOnly defaults to true by checking the schema
      // The input schema defines: availableOnly: z.boolean().default(true)
      // This test verifies that when availableOnly is not specified, unavailable products are filtered out

      // For this test we verify the Zod schema behavior directly
      // since mocking the complex selector/isVisible chain is brittle
      const { SearchProductsInputSchema } = await import('../types.js');

      // Parse input without availableOnly
      const parsedInput = SearchProductsInputSchema.parse({
        query: 'test',
        maxResults: 10,
      });

      // Verify the default value is true
      expect(parsedInput.availableOnly).toBe(true);
    });
  });

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================

  describe('timeout handling', () => {
    it('should return TIMEOUT_ERROR on navigation timeout', async () => {
      mockPage.goto.mockRejectedValue(new Error('timeout exceeded'));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
          timeout: 5000,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should use provided timeout value', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'leite',
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
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'leite',
        },
        context
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: context.config.navigationTimeout })
      );
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('should return SELECTOR_ERROR when locator throws', async () => {
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);
      mockPage.locator.mockImplementation(() => {
        throw new Error('Selector failed');
      });

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
    });

    it('should capture error screenshot on failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Test error'));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(context.screenshot).toHaveBeenCalledWith('search-error');
      expect(result.screenshots).toBeDefined();
    });

    it('should continue when individual product extraction fails', async () => {
      const failingProduct = {
        locator: vi.fn().mockImplementation(() => {
          throw new Error('Element error');
        }),
      } as unknown as Locator;

      const validProduct = createMockProductCardLocator(MOCK_SEARCH_RESULTS[0]!);

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article')) {
          return {
            all: vi.fn().mockResolvedValue([failingProduct, validProduct]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Failed to extract product',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Duration Tracking
  // ===========================================================================

  describe('duration tracking', () => {
    it('should include duration in result', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
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
    it('should capture screenshot on successful search', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(context.screenshot).toHaveBeenCalled();
      expect(result.data?.screenshot).toBe('screenshot.png');
    });

    it('should include screenshot path in screenshots array', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
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
    it('should log info when starting search', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'leite mimosa',
          maxResults: 5,
          availableOnly: true,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'Searching for products',
        expect.objectContaining({
          query: 'leite mimosa',
          maxResults: 5,
          availableOnly: true,
        })
      );
    });

    it('should log when search completed', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 3));

      await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'Product search completed',
        expect.any(Object)
      );
    });

    it('should log found product count', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 3));

      await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        'Found product elements',
        expect.objectContaining({ count: 3 })
      );
    });

    it('should log error on failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Network error'));

      await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 10,
        },
        context
      );

      expect(context.logger.error).toHaveBeenCalledWith(
        'Product search failed',
        expect.objectContaining({
          error: 'Network error',
        })
      );
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle empty search query gracefully', async () => {
      setupSearchMock(mockPage, []);

      // Zod should validate minimum length of 1
      const result = await searchProductsTool.execute(
        {
          query: 'a', // Minimum valid query
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should handle special characters in search query', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'iogurte "grego" & frutas',
          maxResults: 10,
        },
        context
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('pesquisa?q='),
        expect.any(Object)
      );
    });

    it('should handle Portuguese accented characters', async () => {
      setupSearchMock(mockPage, MOCK_SEARCH_RESULTS.slice(0, 2));

      await searchProductsTool.execute(
        {
          query: 'pao frances tradicao',
          maxResults: 10,
        },
        context
      );

      // Should encode properly
      expect(mockPage.goto).toHaveBeenCalled();
    });

    it('should handle very long search queries', async () => {
      setupSearchMock(mockPage, []);

      const longQuery = 'leite '.repeat(50).trim();

      const result = await searchProductsTool.execute(
        {
          query: longQuery,
          maxResults: 10,
        },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should prepend base URL to relative product URLs', async () => {
      // Create product with relative URL
      const productWithRelativeUrl = {
        ...MOCK_SEARCH_RESULTS[0]!,
        productUrl: '/pt/produtos/leite-mimosa',
      };

      const productLocator = {
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector.includes('name') || selector.includes('h2')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue(productWithRelativeUrl.name),
              }),
            };
          }
          if (selector.includes('href') || selector.includes('produtos')) {
            return {
              first: vi.fn().mockReturnValue({
                getAttribute: vi.fn().mockResolvedValue('/pt/produtos/leite-mimosa'),
              }),
            };
          }
          if (selector.includes('price')) {
            return {
              first: vi.fn().mockReturnValue({
                textContent: vi.fn().mockResolvedValue('1,39 \u20AC'),
              }),
            };
          }
          if (selector.includes('unavailable')) {
            return {
              first: vi.fn().mockReturnValue({
                isVisible: vi.fn().mockResolvedValue(false),
              }),
            };
          }
          return createMockLocator();
        }),
      } as unknown as Locator;

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('product-card') || selector.includes('article')) {
          return {
            all: vi.fn().mockResolvedValue([productLocator]),
          };
        }
        if (selector.includes('no-result')) {
          return {
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          };
        }
        return createMockLocator();
      });

      const result = await searchProductsTool.execute(
        {
          query: 'leite',
          maxResults: 1,
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data?.products[0]?.productUrl).toBe('https://www.auchan.pt/pt/produtos/leite-mimosa');
    });
  });
});
