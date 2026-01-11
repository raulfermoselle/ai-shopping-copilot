/**
 * Selector Resolver
 *
 * Resolves selector keys to actual selector strings with fallback support.
 * Used by tools at runtime to get the correct selectors for page elements.
 */

import type { Page, ElementHandle } from 'playwright';
import { SelectorRegistry } from './registry.js';
import type { SelectorDefinition, PageSelectorDefinition } from './types.js';

/**
 * Options for resolving selectors
 */
export interface ResolveOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Required element state */
  state?: 'visible' | 'attached' | 'hidden';
}

/**
 * Result from tryResolve
 */
export interface ResolveResult {
  /** The selector that matched */
  selector: string;

  /** The element handle */
  element: ElementHandle;

  /** Whether primary or fallback was used */
  usedFallback: boolean;

  /** Index of fallback used (if any) */
  fallbackIndex?: number;
}

/**
 * Selector Resolver - resolves keys to selectors with fallback support
 */
export class SelectorResolver {
  private readonly registry: SelectorRegistry;
  private readonly cache: Map<string, PageSelectorDefinition> = new Map();

  constructor(registry?: SelectorRegistry) {
    this.registry = registry ?? new SelectorRegistry();
  }

  /**
   * Resolve a selector key to the primary selector string
   */
  resolve(pageId: string, selectorKey: string): string | null {
    const pageDef = this.getPageDefinition(pageId);
    if (pageDef === null) {
      return null;
    }

    const selectorDef = pageDef.selectors[selectorKey];
    if (selectorDef === undefined) {
      return null;
    }

    return selectorDef.primary;
  }

  /**
   * Resolve with full fallback chain
   */
  resolveWithFallbacks(pageId: string, selectorKey: string): string[] {
    const pageDef = this.getPageDefinition(pageId);
    if (pageDef === null) {
      return [];
    }

    const selectorDef = pageDef.selectors[selectorKey];
    if (selectorDef === undefined) {
      return [];
    }

    return [selectorDef.primary, ...selectorDef.fallbacks];
  }

  /**
   * Get full selector definition
   */
  getDefinition(pageId: string, selectorKey: string): SelectorDefinition | null {
    const pageDef = this.getPageDefinition(pageId);
    if (pageDef === null) {
      return null;
    }

    return pageDef.selectors[selectorKey] ?? null;
  }

  /**
   * Get all selector keys for a page
   */
  getKeys(pageId: string): string[] {
    const pageDef = this.getPageDefinition(pageId);
    if (pageDef === null) {
      return [];
    }

    return Object.keys(pageDef.selectors);
  }

  /**
   * Check if a page has registered selectors
   */
  hasPage(pageId: string): boolean {
    return this.registry.hasPage(pageId);
  }

  /**
   * Try selectors in order until one works
   *
   * Returns the first matching element with metadata about which selector matched.
   */
  async tryResolve(
    page: Page,
    pageId: string,
    selectorKey: string,
    options: ResolveOptions = {}
  ): Promise<ResolveResult | null> {
    const selectors = this.resolveWithFallbacks(pageId, selectorKey);
    if (selectors.length === 0) {
      return null;
    }

    const { timeout = 5000, state = 'visible' } = options;
    const timeoutPerSelector = Math.max(1000, Math.floor(timeout / selectors.length));

    // Try primary first
    const primarySelector = selectors[0];
    if (primarySelector !== undefined) {
      try {
        const element = await page.waitForSelector(primarySelector, {
          timeout: timeoutPerSelector,
          state,
        });

        if (element !== null) {
          return {
            selector: primarySelector,
            element,
            usedFallback: false,
          };
        }
      } catch {
        // Primary failed, try fallbacks
      }
    }

    // Try fallbacks
    for (let i = 1; i < selectors.length; i++) {
      const fallbackSelector = selectors[i];
      if (fallbackSelector === undefined) {
        continue;
      }

      try {
        const element = await page.waitForSelector(fallbackSelector, {
          timeout: timeoutPerSelector,
          state,
        });

        if (element !== null) {
          return {
            selector: fallbackSelector,
            element,
            usedFallback: true,
            fallbackIndex: i - 1,
          };
        }
      } catch {
        // Try next fallback
      }
    }

    return null;
  }

  /**
   * Build a composite selector string for Playwright
   *
   * Combines primary and fallbacks into a single selector using comma separation.
   * Playwright will match the first one that exists.
   */
  buildCompositeSelector(pageId: string, selectorKey: string): string | null {
    const selectors = this.resolveWithFallbacks(pageId, selectorKey);
    if (selectors.length === 0) {
      return null;
    }

    return selectors.join(', ');
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.registry.clearCache();
  }

  /**
   * Get page definition with caching
   */
  private getPageDefinition(pageId: string): PageSelectorDefinition | null {
    if (this.cache.has(pageId)) {
      return this.cache.get(pageId)!;
    }

    const pageDef = this.registry.getActiveVersion(pageId);
    if (pageDef !== null) {
      this.cache.set(pageId, pageDef);
    }

    return pageDef;
  }
}

/**
 * Create a selector resolver instance
 */
export function createSelectorResolver(registry?: SelectorRegistry): SelectorResolver {
  return new SelectorResolver(registry);
}
