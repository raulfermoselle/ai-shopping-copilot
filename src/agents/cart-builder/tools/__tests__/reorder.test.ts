/**
 * Unit Tests for ReorderTool
 *
 * Tests clicking "Encomendar de novo" button on order detail page:
 * - Click reorder button successfully returns success
 * - Button not found returns SELECTOR_ERROR
 * - Already on order page works without navigation
 * - Error messages detected and included in failedItems
 * - Cart indicator detection
 * - Timeout handling
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { reorderTool } from '../reorder.js';
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
  isVisible?: boolean;
} = {}): Locator {
  const defaults = {
    textContent: null,
    isVisible: false,
  };
  const values = { ...defaults, ...overrides };

  return {
    first: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
    textContent: vi.fn().mockResolvedValue(values.textContent),
    isVisible: vi.fn().mockResolvedValue(values.isVisible),
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
function createMockElement(): ElementHandle {
  return {
    click: vi.fn(),
    textContent: vi.fn(),
    getAttribute: vi.fn(),
  } as unknown as ElementHandle;
}

describe('reorderTool', () => {
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
      expect(reorderTool.name).toBe('reorder');
    });

    it('should have a description', () => {
      expect(reorderTool.description).toContain('Encomendar de novo');
    });
  });

  describe('execute - successful reorder', () => {
    it('should click reorder button and return success', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'reorderButton') {
            return { element: mockReorderButton, usedFallback: false };
          }
          return null;
        }
      );

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(mockReorderButton.click).toHaveBeenCalled();
      expect(context.logger.info).toHaveBeenCalledWith('Clicking reorder button');
    });

    it('should wait for cart update after clicking', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(3000);
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Waiting for cart to update',
        { waitMs: 3000 }
      );
    });

    it('should capture before and after screenshots', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('reorder-before-001');
      expect(context.screenshot).toHaveBeenCalledWith('reorder-after-001');
      expect(result.screenshots?.length).toBe(2);
    });
  });

  describe('execute - button not found', () => {
    it('should return SELECTOR_ERROR when reorder button not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      (mockResolverInstance.tryResolve as Mock).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'reorderButton') {
            return null; // Button not found
          }
          return null;
        }
      );

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
      expect(result.error?.message).toContain('Reorder button not found');
    });

    it('should capture screenshot when button not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith(
        'reorder-button-not-found-001'
      );
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - already on order page', () => {
    it('should work without navigation when already on order page', async () => {
      // Arrange - URL already contains orderId
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(mockPage.goto).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(context.logger.debug).toHaveBeenCalledWith(
        'Already on order detail page'
      );
    });

    it('should navigate when not on order page', async () => {
      // Arrange - URL does not contain orderId
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'orderHeader') {
            return { element: createMockElement(), usedFallback: false };
          }
          if (selectorKey === 'reorderButton') {
            return { element: mockReorderButton, usedFallback: false };
          }
          return null;
        }
      );

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        expect.objectContaining({ waitUntil: 'domcontentloaded' })
      );
    });
  });

  describe('execute - error messages detection', () => {
    it('should detect and include error messages in failedItems', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      // Mock error message detection
      const errorLocator = createMockLocator({
        textContent: 'Item out of stock',
        isVisible: true,
      });
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector === '.error-message' || selector.includes('alert')) {
          return {
            all: vi.fn().mockResolvedValue([errorLocator]),
          };
        }
        return {
          all: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockReturnValue(createMockLocator()),
          isVisible: vi.fn().mockResolvedValue(false),
        };
      });

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.failedItems).toBeDefined();
    });

    it('should log warning when some items fail', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      // Mock error message detection
      const errorLocator = createMockLocator({
        textContent: 'Product unavailable',
        isVisible: true,
      });
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('error') || selector.includes('alert')) {
          return {
            all: vi.fn().mockResolvedValue([errorLocator]),
          };
        }
        return {
          all: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockReturnValue(createMockLocator()),
          isVisible: vi.fn().mockResolvedValue(false),
        };
      });

      // Act
      await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Some items may have failed to add',
        expect.any(Object)
      );
    });
  });

  describe('execute - cart redirect detection', () => {
    it('should detect when redirected to cart page', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce(
          'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
        )
        .mockReturnValue('https://www.auchan.pt/pt/carrinho');
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.logger.info).toHaveBeenCalledWith(
        'Redirected to cart page after reorder'
      );
    });
  });

  describe('execute - timeout handling', () => {
    it('should return TIMEOUT_ERROR on timeout', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      (mockResolverInstance.tryResolve as Mock).mockRejectedValue(
        new Error('timeout waiting for selector')
      );

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });
  });

  describe('execute - fallback selector usage', () => {
    it('should log warning when button found with fallback', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: true,
        fallbackIndex: 2,
      });

      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Used fallback selector for reorder button',
        { fallbackIndex: 2 }
      );
    });
  });

  describe('execute - duration tracking', () => {
    it('should include duration in result', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await reorderTool.execute(
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

  describe('execute - cart item count detection', () => {
    it('should try to detect cart item count after reorder', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      // Mock cart counter detection
      const cartCounterLocator = createMockLocator({
        textContent: '10',
        isVisible: true,
      });
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.includes('cart') && selector.includes('count')) {
          return cartCounterLocator;
        }
        return {
          all: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockReturnValue(createMockLocator()),
          isVisible: vi.fn().mockResolvedValue(false),
        };
      });

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.itemsAdded).toBeDefined();
    });
  });
});
