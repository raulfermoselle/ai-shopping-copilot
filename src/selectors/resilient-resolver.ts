/**
 * Resilient Selector Resolver
 *
 * Enhanced resolver with retry logic, escalation strategies, and graceful degradation.
 * Handles UI changes, network delays, and dynamic content with confidence tracking.
 */

import type { Page, ElementHandle } from 'playwright';
import { SelectorRegistry } from './registry.js';
import { SelectorResolver } from './resolver.js';
import {
  tryTextHeuristics,
  tryStructuralHeuristics,
  generateDomTolerantSelectors,
} from './fallback-strategies.js';
import type {
  ResolutionResult,
  ResilientResolveOptions,
  ConfidenceLevel,
  SelectorDefinition,
} from './types.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default options for resilient resolution
 */
const DEFAULT_OPTIONS: Required<ResilientResolveOptions> = {
  timeout: 10000,
  state: 'visible',
  maxAttempts: 4,
  captureScreenshot: true,
  captureDomSnapshot: false,
  enableTextHeuristics: true,
  enableStructuralHeuristics: true,
  textHints: [],
  allowDegraded: true,
};

/**
 * Resilient Selector Resolver
 *
 * Provides intelligent retry logic with escalating fallback strategies:
 * 1. Primary selector (immediate)
 * 2. Registered fallbacks (after 500ms delay)
 * 3. Text-based heuristics (after screenshot capture)
 * 4. Structural heuristics (last resort)
 */
export class ResilientResolver {
  private readonly baseResolver: SelectorResolver;
  private readonly registry: SelectorRegistry;
  private readonly screenshotDir: string;

  constructor(registry?: SelectorRegistry, screenshotDir?: string) {
    this.registry = registry ?? new SelectorRegistry();
    this.baseResolver = new SelectorResolver(this.registry);
    this.screenshotDir = screenshotDir ?? join(process.cwd(), 'data', 'diagnostics', 'selectors');
  }

  /**
   * Resolve selector with full resilience and retry logic
   *
   * Attempts resolution with escalating strategies:
   * - Attempt 1: Primary selector (fast fail)
   * - Attempt 2: Registered fallbacks with delay
   * - Attempt 3: Text-based heuristics + screenshot
   * - Attempt 4: Structural heuristics + DOM tolerance
   */
  async resolve(
    page: Page,
    pageId: string,
    selectorKey: string,
    options: ResilientResolveOptions = {}
  ): Promise<ResolutionResult<ElementHandle>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const warnings: string[] = [];
    const triedSelectors: string[] = [];

    // Get selector definition
    const selectorDef = this.baseResolver.getDefinition(pageId, selectorKey);
    if (selectorDef === null) {
      return {
        success: false,
        confidence: 'very-low' as ConfidenceLevel,
        strategy: 'primary',
        attempts: 0,
        duration: Date.now() - startTime,
        warnings: [],
        error: `Selector not found in registry: ${pageId}.${selectorKey}`,
      };
    }

    // Attempt 1: Try primary selector (fast)
    const attempt1 = await this.tryPrimarySelector(
      page,
      selectorDef,
      Math.min(2000, opts.timeout / 4),
      opts.state
    );

    if (attempt1.success && attempt1.element) {
      return {
        success: true,
        element: attempt1.element,
        matchedSelector: attempt1.selector,
        confidence: 'high' as ConfidenceLevel,
        strategy: 'primary',
        attempts: 1,
        duration: Date.now() - startTime,
        warnings: [],
      };
    }

    triedSelectors.push(selectorDef.primary);

    // Attempt 2: Try registered fallbacks with delay
    if (selectorDef.fallbacks.length > 0) {
      await this.delay(500); // Brief delay for UI to stabilize

      const attempt2 = await this.tryFallbackSelectors(
        page,
        selectorDef.fallbacks,
        Math.min(3000, opts.timeout / 3),
        opts.state
      );

      if (attempt2.success && attempt2.element && attempt2.selector) {
        const confidence = this.calculateFallbackConfidence(
          attempt2.fallbackIndex ?? 0,
          selectorDef.fallbacks.length
        );

        warnings.push(
          `Used fallback selector #${attempt2.fallbackIndex}: ${attempt2.selector}`
        );

        const result: ResolutionResult<ElementHandle> = {
          success: true,
          element: attempt2.element,
          matchedSelector: attempt2.selector,
          confidence,
          strategy: 'fallback',
          attempts: 2,
          duration: Date.now() - startTime,
          warnings,
        };

        if (attempt2.fallbackIndex !== undefined) {
          result.fallbackIndex = attempt2.fallbackIndex;
        }

        return result;
      }

      triedSelectors.push(...selectorDef.fallbacks);
    }

    // Attempt 3: Try text-based heuristics + screenshot
    if (opts.enableTextHeuristics) {
      let screenshotPath: string | undefined;

      if (opts.captureScreenshot) {
        screenshotPath = await this.captureScreenshot(page, pageId, selectorKey, 'attempt-3');
        warnings.push(`Screenshot captured: ${screenshotPath}`);
      }

      const attempt3 = await tryTextHeuristics(
        page,
        selectorDef,
        opts.textHints,
        Math.min(2000, opts.timeout / 4)
      );

      if (attempt3.element !== null && attempt3.selector !== null) {
        warnings.push(`Text heuristic matched: ${attempt3.reason}`);
        warnings.push(`Confidence: ${attempt3.confidence * 100}%`);

        if (!opts.allowDegraded && attempt3.confidence < 0.4) {
          warnings.push('Confidence too low, treating as failure');
        } else {
          const result: ResolutionResult<ElementHandle> = {
            success: true,
            element: attempt3.element,
            matchedSelector: attempt3.selector,
            confidence: 'low' as ConfidenceLevel,
            strategy: 'text-heuristic',
            attempts: 3,
            duration: Date.now() - startTime,
            warnings,
          };

          if (screenshotPath !== undefined) {
            result.screenshot = screenshotPath;
          }

          return result;
        }
      }

      if (attempt3.selector) {
        triedSelectors.push(attempt3.selector);
      }
    }

    // Attempt 4: Try structural heuristics + DOM tolerance
    if (opts.enableStructuralHeuristics) {
      const attempt4 = await tryStructuralHeuristics(
        page,
        selectorDef,
        Math.min(2000, opts.timeout / 4)
      );

      if (attempt4.element !== null && attempt4.selector !== null) {
        warnings.push(`Structural heuristic matched: ${attempt4.reason}`);
        warnings.push(`Confidence: ${attempt4.confidence * 100}%`);

        if (!opts.allowDegraded && attempt4.confidence < 0.4) {
          warnings.push('Confidence too low, treating as failure');
        } else {
          return {
            success: true,
            element: attempt4.element,
            matchedSelector: attempt4.selector,
            confidence: 'very-low' as ConfidenceLevel,
            strategy: 'structural-heuristic',
            attempts: 4,
            duration: Date.now() - startTime,
            warnings,
          };
        }
      }

      if (attempt4.selector) {
        triedSelectors.push(attempt4.selector);
      }
    }

    // All attempts failed - capture diagnostics
    let screenshotPath: string | undefined;
    let domSnapshot: string | undefined;

    if (opts.captureScreenshot) {
      screenshotPath = await this.captureScreenshot(page, pageId, selectorKey, 'failed');
    }

    if (opts.captureDomSnapshot) {
      domSnapshot = await page.content();
    }

    const diagnostic: {
      triedSelectors: string[];
      domSnapshot?: string;
      pageUrl?: string;
      timestamp: string;
    } = {
      triedSelectors,
      pageUrl: page.url(),
      timestamp: new Date().toISOString(),
    };

    if (domSnapshot !== undefined) {
      diagnostic.domSnapshot = domSnapshot;
    }

    const result: ResolutionResult<ElementHandle> = {
      success: false,
      confidence: 'very-low' as ConfidenceLevel,
      strategy: 'structural-heuristic',
      attempts: opts.maxAttempts,
      duration: Date.now() - startTime,
      warnings,
      error: `All resolution strategies failed for ${pageId}.${selectorKey}`,
      diagnostic,
    };

    if (screenshotPath !== undefined) {
      result.screenshot = screenshotPath;
    }

    return result;
  }

  /**
   * Resolve selector with tolerance for minor DOM changes
   *
   * Generates DOM-tolerant variants of selectors to handle wrapper divs
   * and CSS module suffixes.
   */
  async resolveWithDomTolerance(
    page: Page,
    pageId: string,
    selectorKey: string,
    options: ResilientResolveOptions = {}
  ): Promise<ResolutionResult<ElementHandle>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // First try standard resolution
    const standardResult = await this.resolve(page, pageId, selectorKey, opts);
    if (standardResult.success) {
      return standardResult;
    }

    // Get selector definition and generate tolerant variants
    const selectorDef = this.baseResolver.getDefinition(pageId, selectorKey);
    if (selectorDef === null) {
      return standardResult;
    }

    const tolerantSelectors = generateDomTolerantSelectors(selectorDef.primary);
    if (tolerantSelectors.length === 0) {
      return standardResult;
    }

    // Try tolerant variants
    const attempt = await this.tryFallbackSelectors(
      page,
      tolerantSelectors,
      opts.timeout / 2,
      opts.state
    );

    if (attempt.success && attempt.element && attempt.selector) {
      const warnings = [
        ...standardResult.warnings,
        'Used DOM-tolerant selector variant',
        `Matched: ${attempt.selector}`,
      ];

      const result: ResolutionResult<ElementHandle> = {
        success: true,
        element: attempt.element,
        matchedSelector: attempt.selector,
        confidence: 'medium' as ConfidenceLevel,
        strategy: 'fallback',
        attempts: standardResult.attempts + 1,
        duration: standardResult.duration,
        warnings,
      };

      if (attempt.fallbackIndex !== undefined) {
        result.fallbackIndex = attempt.fallbackIndex;
      }

      return result;
    }

    return standardResult;
  }

  /**
   * Batch resolve multiple selectors with parallelization
   *
   * Resolves multiple selectors concurrently for efficiency.
   * Returns a map of selector keys to resolution results.
   */
  async resolveBatch(
    page: Page,
    pageId: string,
    selectorKeys: string[],
    options: ResilientResolveOptions = {}
  ): Promise<Map<string, ResolutionResult<ElementHandle>>> {
    const results = new Map<string, ResolutionResult<ElementHandle>>();

    const promises = selectorKeys.map(async (key) => {
      const result = await this.resolve(page, pageId, key, options);
      return { key, result };
    });

    const settled = await Promise.allSettled(promises);

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.set(outcome.value.key, outcome.value.result);
      }
    }

    return results;
  }

  /**
   * Check if page has registered selectors
   */
  hasPage(pageId: string): boolean {
    return this.baseResolver.hasPage(pageId);
  }

  /**
   * Get selector definition
   */
  getDefinition(pageId: string, selectorKey: string): SelectorDefinition | null {
    return this.baseResolver.getDefinition(pageId, selectorKey);
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.baseResolver.clearCache();
  }

  /**
   * Try primary selector with timeout
   */
  private async tryPrimarySelector(
    page: Page,
    selectorDef: SelectorDefinition,
    timeout: number,
    state: 'visible' | 'attached' | 'hidden'
  ): Promise<{
    success: boolean;
    element?: ElementHandle;
    selector: string;
  }> {
    try {
      const element = await page.waitForSelector(selectorDef.primary, {
        timeout,
        state,
      });

      if (element !== null) {
        return {
          success: true,
          element,
          selector: selectorDef.primary,
        };
      }

      return {
        success: false,
        selector: selectorDef.primary,
      };
    } catch {
      return {
        success: false,
        selector: selectorDef.primary,
      };
    }
  }

  /**
   * Try fallback selectors in order
   */
  private async tryFallbackSelectors(
    page: Page,
    fallbacks: string[],
    timeout: number,
    state: 'visible' | 'attached' | 'hidden'
  ): Promise<{
    success: boolean;
    element?: ElementHandle;
    selector?: string;
    fallbackIndex?: number;
  }> {
    const timeoutPerSelector = Math.max(500, Math.floor(timeout / fallbacks.length));

    for (let i = 0; i < fallbacks.length; i++) {
      const selector = fallbacks[i];
      if (!selector) continue;

      try {
        const element = await page.waitForSelector(selector, {
          timeout: timeoutPerSelector,
          state,
        });

        if (element !== null) {
          return {
            success: true,
            element,
            selector,
            fallbackIndex: i,
          };
        }
      } catch {
        // Try next fallback
        continue;
      }
    }

    return { success: false };
  }

  /**
   * Calculate confidence based on fallback index
   */
  private calculateFallbackConfidence(
    fallbackIndex: number,
    totalFallbacks: number
  ): ConfidenceLevel {
    if (fallbackIndex === 0 && totalFallbacks > 0) {
      return 'high' as ConfidenceLevel; // First fallback
    } else if (fallbackIndex < totalFallbacks / 2) {
      return 'medium' as ConfidenceLevel; // Early fallback
    } else {
      return 'low' as ConfidenceLevel; // Late fallback
    }
  }

  /**
   * Capture screenshot for diagnostics
   */
  private async captureScreenshot(
    page: Page,
    pageId: string,
    selectorKey: string,
    attempt: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${pageId}_${selectorKey}_${attempt}_${timestamp}.png`;
    const filepath = join(this.screenshotDir, filename);

    // Ensure directory exists
    const dir = this.screenshotDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await page.screenshot({ path: filepath, fullPage: false });

    return filepath;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a resilient resolver instance
 */
export function createResilientResolver(
  registry?: SelectorRegistry,
  screenshotDir?: string
): ResilientResolver {
  return new ResilientResolver(registry, screenshotDir);
}
