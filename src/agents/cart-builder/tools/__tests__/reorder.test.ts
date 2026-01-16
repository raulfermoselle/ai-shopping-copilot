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

// Mock the popup handler to prevent actual popup dismissal
vi.mock('../../../../utils/popup-handler.js', () => ({
  dismissPopups: vi.fn().mockResolvedValue(0),
  dismissSubscriptionPopup: vi.fn().mockResolvedValue(false),
}));

// Mock the auto-popup-dismisser to prevent page.evaluate calls
vi.mock('../../../../utils/auto-popup-dismisser.js', () => ({
  attachPopupObserver: vi.fn().mockResolvedValue(undefined),
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
  waitForSelector: Mock;
} {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const locator = vi.fn();
  const waitForSelector = vi.fn().mockRejectedValue(new Error('No modal'));

  const page = {
    url,
    goto,
    waitForTimeout,
    locator,
    waitForSelector,
  } as unknown as Page;

  return { page, url, goto, waitForTimeout, locator, waitForSelector };
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
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn(),
    getAttribute: vi.fn(),
    isVisible: vi.fn().mockResolvedValue(true),
    isEnabled: vi.fn().mockResolvedValue(true),
  } as unknown as ElementHandle;
}

/**
 * Create a locator mock that simulates a cart count indicator showing a specific value
 */
/*
function createCartCountLocator(count: number): Locator {
  return {
    first: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue([]),
    textContent: vi.fn().mockResolvedValue(String(count)),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator;
}
*/

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
    /**
     * Setup common mock for successful reorder tests.
     * Simulates: cart starts at 0 items, ends at 10 items after reorder.
     */
    function setupSuccessfulReorderMocks() {
      // First URL call is to check if already on page
      // After cart update wait, URL returns cart page (redirect)
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001') // initial check
        .mockReturnValue('https://www.auchan.pt/pt/carrinho'); // after reorder - redirected to cart

      // Make waitForSelector succeed for modal detection
      mockPage.waitForSelector.mockResolvedValue({});

      const mockReorderButton = createMockElement();

      // Create a mock modal confirm button
      const mockConfirmButton = createMockElement();

      (mockResolverInstance.tryResolve).mockImplementation(
        async (_page, _pageId, selectorKey) => {
          if (selectorKey === 'reorderButton') {
            return { element: mockReorderButton, usedFallback: false };
          }
          if (selectorKey === 'reorderModalConfirmButton' || selectorKey === 'reorderModalMergeButton') {
            return { element: mockConfirmButton, usedFallback: false };
          }
          return null;
        }
      );

      // Default locator mock - no popup visible, no cart count
      mockPage.locator.mockReturnValue(createMockLocator());

      return mockReorderButton;
    }

    it('should click reorder button and return success', async () => {
      // Arrange
      const mockReorderButton = setupSuccessfulReorderMocks();

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
      setupSuccessfulReorderMocks();

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

    it('should capture before, modal, and after screenshots', async () => {
      // Arrange
      setupSuccessfulReorderMocks();

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
      expect(context.screenshot).toHaveBeenCalledWith('reorder-modal-001');
      expect(context.screenshot).toHaveBeenCalledWith('reorder-after-001');
      expect(result.screenshots?.length).toBe(3);
    });
  });

  describe('execute - button not found', () => {
    it('should return SELECTOR_ERROR when reorder button not found', async () => {
      // Arrange
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      (mockResolverInstance.tryResolve).mockImplementation(
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

      (mockResolverInstance.tryResolve).mockResolvedValue(null);

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
      // Arrange - URL already contains orderId, then redirects to cart
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001')
        .mockReturnValue('https://www.auchan.pt/pt/carrinho'); // redirect after reorder

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
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
      (mockResolverInstance.tryResolve).mockImplementation(
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
      // Arrange - simulate redirect to cart (success) but with error messages
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001')
        .mockReturnValue('https://www.auchan.pt/pt/carrinho'); // redirect after reorder

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
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
      // Arrange - simulate redirect to cart (success) but with error messages
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001')
        .mockReturnValue('https://www.auchan.pt/pt/carrinho'); // redirect after reorder

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
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
      // Arrange - starts on order page, ends on cart page
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001')
        .mockReturnValue('https://www.auchan.pt/pt/carrinho');

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
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
      expect(result.success).toBe(true);
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

      (mockResolverInstance.tryResolve).mockRejectedValue(
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
      (mockResolverInstance.tryResolve).mockResolvedValue({
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

      (mockResolverInstance.tryResolve).mockResolvedValue(null);

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
      // Arrange - starts on order page, redirects to cart
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/conta/detalhes-encomenda/001')
        .mockReturnValue('https://www.auchan.pt/pt/carrinho'); // redirect

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
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

  describe('execute - cart verification failure', () => {
    it('should assume success when cart state cannot be detected', async () => {
      // Arrange - stays on order page, cart state not visible
      // This simulates order detail pages that don't show the cart header
      mockPage.url.mockReturnValue(
        'https://www.auchan.pt/pt/conta/detalhes-encomenda/001'
      );

      const mockReorderButton = createMockElement();
      (mockResolverInstance.tryResolve).mockResolvedValue({
        element: mockReorderButton,
        usedFallback: false,
      });

      // No cart count visible - all selectors fail
      mockPage.locator.mockReturnValue(createMockLocator());

      // Act
      const result = await reorderTool.execute(
        {
          orderId: '001',
          detailUrl: 'https://www.auchan.pt/pt/conta/detalhes-encomenda/001',
        },
        context
      );

      // Assert - should assume success when cart state cannot be verified
      // This is a fallback for order pages that don't show cart header
      expect(result.success).toBe(true);
      expect(context.logger.info).toHaveBeenCalledWith(
        'Cart change assumed - could not detect cart state on order detail page'
      );
    });
  });
});
