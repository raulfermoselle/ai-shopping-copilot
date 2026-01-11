/**
 * Unit Tests for NavigateToOrderHistoryTool
 *
 * Tests navigation to Auchan.pt order history page with:
 * - Already on order history page handling
 * - Successful navigation with URL verification
 * - Auth redirect detection (AUTH_ERROR)
 * - Timeout handling (TIMEOUT_ERROR)
 * - Container not found (SELECTOR_ERROR)
 * - Network errors and retry logic
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { navigateToOrderHistoryTool } from '../navigate-to-order-history.js';
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

// createSelectorResolver is mocked above

/**
 * Create a mock Playwright Page object
 */
function createMockPage(): {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForLoadState: Mock;
  waitForSelector: Mock;
  waitForTimeout: Mock;
  $$: Mock;
  $: Mock;
  locator: Mock;
} {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForLoadState = vi.fn();
  const waitForSelector = vi.fn();
  const waitForTimeout = vi.fn();
  const $$ = vi.fn();
  const $ = vi.fn();
  const locator = vi.fn();

  const page = {
    url,
    goto,
    waitForLoadState,
    waitForSelector,
    waitForTimeout,
    $$,
    $,
    locator,
  } as unknown as Page;

  return {
    page,
    url,
    goto,
    waitForLoadState,
    waitForSelector,
    waitForTimeout,
    $$,
    $,
    locator,
  };
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

describe('navigateToOrderHistoryTool', () => {
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
      expect(navigateToOrderHistoryTool.name).toBe('navigateToOrderHistory');
    });

    it('should have a description', () => {
      expect(navigateToOrderHistoryTool.description).toBe(
        'Navigate to Auchan order history page'
      );
    });
  });

  describe('execute - already on order history page', () => {
    it('should return success when already on order history page', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.url).toContain('historico-encomendas');
      expect(mockPage.goto).not.toHaveBeenCalled();
      expect(context.logger.info).toHaveBeenCalledWith(
        'Already on order history page',
        expect.any(Object)
      );
    });

    it('should still verify container when already on page with waitForLoad true', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(mockResolverInstance.tryResolve).toHaveBeenCalledWith(
        mockPage.page,
        'order-history',
        'orderListContainer',
        { timeout: 5000 }
      );
    });

    it('should capture screenshot when already on page', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-history-already-loaded');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - successful navigation', () => {
    it('should navigate and return success with URL', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home') // Initial URL
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas'); // After navigation
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.url).toBe('https://www.auchan.pt/pt/historico-encomendas');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.auchan.pt/pt/historico-encomendas',
        { timeout: 30000, waitUntil: 'domcontentloaded' }
      );
    });

    it('should wait for order list container after navigation', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      await navigateToOrderHistoryTool.execute({ waitForLoad: true }, context);

      // Assert
      expect(mockResolverInstance.tryResolve).toHaveBeenCalledWith(
        mockPage.page,
        'order-history',
        'orderListContainer',
        { timeout: 10000 }
      );
    });

    it('should log fallback warning when container found with fallback', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list-fallback',
        usedFallback: true,
        fallbackIndex: 1,
      });

      // Act
      await navigateToOrderHistoryTool.execute({ waitForLoad: true }, context);

      // Assert
      expect(context.logger.warn).toHaveBeenCalledWith(
        'Order list container found using fallback selector',
        { fallbackIndex: 1 }
      );
    });
  });

  describe('execute - auth redirect detection', () => {
    it('should return AUTH_ERROR when redirected to login page', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/login');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_ERROR');
      expect(result.error?.message).toContain('Authentication required');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should capture screenshot on auth redirect', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/login?redirect=something');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);

      // Act
      const result = await navigateToOrderHistoryTool.execute({}, context);

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-history-auth-required');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - timeout handling', () => {
    it('should return TIMEOUT_ERROR when navigation times out', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto.mockRejectedValue(new Error('Timeout waiting for navigation'));
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 5000 },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT_ERROR');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should retry navigation on timeout before failing', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/home');
      mockPage.goto
        .mockRejectedValueOnce(new Error('Timeout 1'))
        .mockRejectedValueOnce(new Error('Timeout 2'));
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Act
      await navigateToOrderHistoryTool.execute({ timeout: 5000 }, context);

      // Assert - should retry (2 attempts total)
      expect(mockPage.goto).toHaveBeenCalledTimes(2);
    });
  });

  describe('execute - container not found', () => {
    it('should return SELECTOR_ERROR when container not found', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SELECTOR_ERROR');
      expect(result.error?.message).toContain('Order list container not found');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should capture screenshot when container not found', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue(null);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true },
        context
      );

      // Assert
      expect(context.screenshot).toHaveBeenCalledWith('order-history-container-timeout');
      expect(result.screenshots).toContain('screenshot.png');
    });
  });

  describe('execute - network errors', () => {
    it('should return NETWORK_ERROR when navigation reaches wrong page', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/error-page');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: true, timeout: 30000 },
        context
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toContain('wrong page');
    });

    it('should retry when navigation reaches wrong page', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValueOnce('https://www.auchan.pt/pt/error')
        .mockReturnValueOnce('https://www.auchan.pt/pt/error');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);
      mockPage.waitForTimeout.mockResolvedValue(undefined);

      // Act
      await navigateToOrderHistoryTool.execute({ timeout: 30000 }, context);

      // Assert - should attempt navigation twice
      expect(mockPage.goto).toHaveBeenCalledTimes(2);
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

      // Act
      const result = await navigateToOrderHistoryTool.execute({}, context);

      // Assert
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('execute - default input values', () => {
    it('should use default waitForLoad true', async () => {
      // Arrange
      mockPage.url.mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      (mockResolverInstance.tryResolve as Mock).mockResolvedValue({
        element: createMockElement(),
        selector: '.order-list',
        usedFallback: false,
      });

      // Act
      await navigateToOrderHistoryTool.execute({}, context);

      // Assert - should call tryResolve for container verification
      expect(mockResolverInstance.tryResolve).toHaveBeenCalled();
    });

    it('should skip container verification when waitForLoad is false', async () => {
      // Arrange
      mockPage.url
        .mockReturnValueOnce('https://www.auchan.pt/pt/home')
        .mockReturnValue('https://www.auchan.pt/pt/historico-encomendas');
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForLoadState.mockResolvedValue(undefined);

      // Act
      const result = await navigateToOrderHistoryTool.execute(
        { waitForLoad: false },
        context
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockResolverInstance.tryResolve).not.toHaveBeenCalled();
    });
  });
});
