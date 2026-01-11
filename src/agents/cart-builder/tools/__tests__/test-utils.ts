/**
 * Shared Test Utilities for CartBuilder Tools
 *
 * Common mock factories and helper functions for unit testing
 * Playwright-based browser automation tools.
 */

import { vi, type Mock } from 'vitest';
import type { ToolContext, ToolConfig } from '../../../../types/tool.js';
import type { Page, ElementHandle, Locator } from 'playwright';
import type { Logger } from '../../../../utils/logger.js';

/**
 * Mock SelectorResolver instance with configurable methods
 */
export interface MockSelectorResolver {
  resolve: Mock;
  resolveWithFallbacks: Mock;
  tryResolve: Mock;
  buildCompositeSelector: Mock;
  hasPage: Mock;
  getDefinition: Mock;
  getKeys: Mock;
  clearCache: Mock;
}

/**
 * Create a mock SelectorResolver with all methods stubbed
 */
export function createMockResolver(): MockSelectorResolver {
  return {
    resolve: vi.fn().mockReturnValue(null),
    resolveWithFallbacks: vi.fn().mockReturnValue([]),
    tryResolve: vi.fn().mockResolvedValue(null),
    buildCompositeSelector: vi.fn().mockReturnValue(null),
    hasPage: vi.fn().mockReturnValue(false),
    getDefinition: vi.fn().mockReturnValue(null),
    getKeys: vi.fn().mockReturnValue([]),
    clearCache: vi.fn(),
  };
}

/**
 * Global mock resolver instance - set this before tests
 */
let globalMockResolver: MockSelectorResolver | null = null;

/**
 * Set the global mock resolver for tests
 */
export function setGlobalMockResolver(resolver: MockSelectorResolver): void {
  globalMockResolver = resolver;
}

/**
 * Get the global mock resolver
 */
export function getGlobalMockResolver(): MockSelectorResolver {
  if (!globalMockResolver) {
    globalMockResolver = createMockResolver();
  }
  return globalMockResolver;
}

/**
 * Reset the global mock resolver
 */
export function resetGlobalMockResolver(): void {
  globalMockResolver = null;
}

/**
 * Create mock factory for createSelectorResolver that returns a shared mock
 */
export function createMockSelectorResolverFactory(): () => MockSelectorResolver {
  return () => getGlobalMockResolver();
}

/**
 * Mock Playwright Page with common methods
 */
export interface MockPageMethods {
  page: Page;
  url: Mock;
  goto: Mock;
  waitForLoadState: Mock;
  waitForSelector: Mock;
  waitForTimeout: Mock;
  $$: Mock;
  $: Mock;
  locator: Mock;
  screenshot: Mock;
}

/**
 * Create a mock Playwright Page object
 */
export function createMockPage(): MockPageMethods {
  const url = vi.fn();
  const goto = vi.fn();
  const waitForLoadState = vi.fn().mockResolvedValue(undefined);
  const waitForSelector = vi.fn();
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const $$ = vi.fn().mockResolvedValue([]);
  const $ = vi.fn().mockResolvedValue(null);
  const locator = vi.fn();
  const screenshot = vi.fn();

  const page = {
    url,
    goto,
    waitForLoadState,
    waitForSelector,
    waitForTimeout,
    $$,
    $,
    locator,
    screenshot,
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
    screenshot,
  };
}

/**
 * Create a mock Logger
 */
export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

/**
 * Create a mock ToolContext
 */
export function createMockContext(page: Page): ToolContext {
  return {
    page,
    logger: createMockLogger(),
    screenshot: vi.fn().mockResolvedValue('screenshot.png'),
    config: {
      navigationTimeout: 30000,
      elementTimeout: 10000,
      screenshotDir: 'screenshots',
    } as ToolConfig,
  };
}

/**
 * Create a mock ElementHandle
 */
export function createMockElement(overrides: {
  textContent?: string | null;
  getAttribute?: string | null;
} = {}): ElementHandle {
  const defaults = { textContent: null, getAttribute: null };
  const values = { ...defaults, ...overrides };

  return {
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(values.textContent),
    getAttribute: vi.fn().mockResolvedValue(values.getAttribute),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
  } as unknown as ElementHandle;
}

/**
 * Create a mock Locator
 */
export function createMockLocator(overrides: {
  textContent?: string | null;
  getAttribute?: string | null;
  isVisible?: boolean;
  all?: Locator[];
} = {}): Locator {
  const defaults = {
    textContent: null,
    getAttribute: null,
    isVisible: false,
    all: [],
  };
  const values = { ...defaults, ...overrides };

  const locator: Partial<Locator> = {
    first: vi.fn().mockReturnThis() as unknown as Locator['first'],
    all: vi.fn().mockResolvedValue(values.all) as unknown as Locator['all'],
    textContent: vi.fn().mockResolvedValue(values.textContent) as unknown as Locator['textContent'],
    getAttribute: vi.fn().mockResolvedValue(values.getAttribute) as unknown as Locator['getAttribute'],
    isVisible: vi.fn().mockResolvedValue(values.isVisible) as unknown as Locator['isVisible'],
    locator: vi.fn().mockReturnThis() as unknown as Locator['locator'],
    click: vi.fn().mockResolvedValue(undefined) as unknown as Locator['click'],
  };

  return locator as Locator;
}

/**
 * Create a ResolveResult for tryResolve mocking
 */
export function createResolveResult(overrides: {
  selector?: string;
  element?: ElementHandle;
  usedFallback?: boolean;
  fallbackIndex?: number;
} = {}): { selector: string; element: ElementHandle; usedFallback: boolean; fallbackIndex?: number } {
  const defaults = {
    selector: '.test-selector',
    element: createMockElement(),
    usedFallback: false,
  };
  return { ...defaults, ...overrides };
}
