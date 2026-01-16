/**
 * Search Products Tool
 *
 * Searches for products on Auchan.pt:
 * - Navigates to search page with query
 * - Extracts product results
 * - Returns substitute candidates
 *
 * IMPORTANT: This is a read-only tool. It never modifies cart state or places orders.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import type { SearchProductsInput, SearchProductsOutput } from './types.js';
import type { SubstituteCandidate } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';
import { dismissSubscriptionPopup } from '../../../utils/popup-handler.js';

/**
 * Auchan search URL template
 */
const SEARCH_URL_TEMPLATE = 'https://www.auchan.pt/pt/pesquisa?q=';

/**
 * Parse currency from Auchan format "1,39 €" or "1,39€" -> 1.39
 */
function parseCurrency(text: string): number {
  // Remove whitespace, replace comma with dot, remove € symbol
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}


/**
 * Search Products Tool
 *
 * Searches for products on Auchan.pt by query.
 */
export const searchProductsTool: Tool<SearchProductsInput, SearchProductsOutput> = {
  name: 'searchProducts',
  description: 'Search for products on Auchan.pt by name or keywords',

  async execute(input, context): Promise<ToolResult<SearchProductsOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Searching for products', {
        query: input.query,
        maxResults: input.maxResults,
        availableOnly: input.availableOnly,
      });

      // Build search URL
      const searchUrl = `${SEARCH_URL_TEMPLATE}${encodeURIComponent(input.query)}`;

      // Navigate to search page
      context.logger.debug('Navigating to search page', { url: searchUrl });
      await context.page.goto(searchUrl, {
        timeout: input.timeout || context.config.navigationTimeout,
        waitUntil: 'domcontentloaded',
      });

      // Wait for content to load
      await context.page.waitForTimeout(2000);

      // Dismiss any popups
      await dismissSubscriptionPopup(context.page, { logger: context.logger });

      // Wait for search results to appear
      // Auchan uses various containers for product grids
      const resultContainerSelectors = [
        resolver.buildCompositeSelector('search', 'resultsContainer'),
        '.auc-product-grid',
        '.search-results',
        '.product-list',
        '[class*="product-grid"]',
        '[class*="search-result"]',
        'main [class*="grid"]',
      ].filter(Boolean).join(', ');

      try {
        await context.page.waitForSelector(resultContainerSelectors, {
          timeout: 5000,
          state: 'visible',
        });
      } catch {
        context.logger.warn('Search results container not found, checking for no-results message');
      }

      // Check for no results
      const noResultsSelectors = [
        resolver.buildCompositeSelector('search', 'noResults'),
        '.no-results',
        '.empty-results',
        '[class*="no-result"]',
        ':has-text("Não encontrámos")',
        ':has-text("sem resultados")',
      ].filter(Boolean).join(', ');

      const noResultsElement = await context.page.locator(noResultsSelectors).first();
      const hasNoResults = await noResultsElement.isVisible().catch(() => false);

      if (hasNoResults) {
        context.logger.info('No search results found', { query: input.query });

        let screenshotPath: string | undefined;
        try {
          screenshotPath = await context.screenshot('search-no-results');
          screenshots.push(screenshotPath);
        } catch {
          // Screenshot failed
        }

        return {
          success: true,
          data: {
            products: [],
            totalFound: 0,
            searchQuery: input.query,
            hasResults: false,
            ...(screenshotPath && { screenshot: screenshotPath }),
          },
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Extract product cards - use VERIFIED selectors from registry
      const productCardSelectors = [
        resolver.buildCompositeSelector('search', 'productTile'),
        '.product-tile[data-pid]',
        '.auc-product-tile[data-pid]',
        '[data-pid]:has(.auc-product-tile__name)',
      ].filter(Boolean).join(', ');

      const productElements = await context.page.locator(productCardSelectors).all();
      context.logger.info('Found product elements', { count: productElements.length });

      // Get total results count if available
      let totalFound = productElements.length;
      try {
        const countSelectors = [
          resolver.buildCompositeSelector('search', 'resultCount'),
          '.result-count',
          '.search-count',
          '[class*="result-count"]',
        ].filter(Boolean).join(', ');

        const countElement = await context.page.locator(countSelectors).first();
        const countText = await countElement.textContent().catch(() => null);
        if (countText) {
          const match = countText.match(/(\d+)/);
          if (match?.[1]) {
            totalFound = parseInt(match[1], 10);
          }
        }
      } catch {
        // Count element not found, use actual count
      }

      // Extract product information via fast JavaScript evaluation (NOT slow Playwright locators)
      const maxToExtract = input.maxResults ?? 10;

      interface RawProduct {
        pid: string;
        name: string;
        href: string | null;
        priceText: string | null;
        pricePerUnit: string | null;
        brand: string | null;
        imageUrl: string | null;
        hasDisabledButton: boolean;
        hasOutOfStock: boolean;
      }

      // Use string evaluation to avoid TypeScript DOM type issues (runs in browser context)
      const rawProducts = await context.page.evaluate(`
        (function() {
          var max = ${maxToExtract};
          var tiles = document.querySelectorAll('.product-tile[data-pid], .auc-product-tile[data-pid], [data-pid]:has(.auc-product-tile__name)');
          var results = [];

          for (var i = 0; i < Math.min(tiles.length, max); i++) {
            var tile = tiles[i];
            if (!tile) continue;

            // Get product ID from data attribute
            var pid = tile.getAttribute('data-pid') || ('search-' + i);

            // Get product name
            var nameEl = tile.querySelector('.auc-product-tile__name, .product-name');
            var name = nameEl ? (nameEl.textContent || '').trim() : '';
            if (!name) continue;

            // Get product URL
            var linkEl = tile.querySelector('a[href*="/produtos/"], a[href*="/pt/"]');
            var href = linkEl ? linkEl.getAttribute('href') : null;

            // Get price - try multiple selectors
            var priceText = null;
            var priceEl = tile.querySelector('.auc-price__no-list .value, .auc-product-tile__prices .price .value, .auc-product-tile__prices .value');
            if (priceEl) {
              priceText = (priceEl.textContent || '').trim() || null;
            }

            // Get price per unit
            var perUnitEl = tile.querySelector('.price-per-unit, .unit-price, [class*="per-unit"], [class*="price-unit"]');
            var pricePerUnit = perUnitEl ? (perUnitEl.textContent || '').trim() : null;

            // Get brand
            var brandEl = tile.querySelector('.auc-product__brand, .product-brand, .brand');
            var brand = brandEl ? (brandEl.textContent || '').trim() : null;

            // Get image URL
            var imgEl = tile.querySelector('img');
            var imageUrl = imgEl ? imgEl.getAttribute('src') : null;
            if (!imageUrl || imageUrl.indexOf('placeholder') >= 0) {
              imageUrl = imgEl ? imgEl.getAttribute('data-src') : null;
            }

            // Check availability
            var hasDisabledButton = !!tile.querySelector('button[disabled], button.auc-button__rounded--primary[disabled]');
            var hasOutOfStock = tile.classList.contains('out-of-stock') || !!tile.querySelector('.out-of-stock');

            results.push({
              pid: pid,
              name: name,
              href: href,
              priceText: priceText,
              pricePerUnit: pricePerUnit,
              brand: brand,
              imageUrl: imageUrl,
              hasDisabledButton: hasDisabledButton,
              hasOutOfStock: hasOutOfStock
            });
          }

          return results;
        })()
      `) as RawProduct[];

      context.logger.info('Extracted products via JS', { count: rawProducts.length });

      // Process raw products into SubstituteCandidate objects
      const products: SubstituteCandidate[] = [];

      for (const raw of rawProducts) {
        // Determine availability
        const available = !raw.hasDisabledButton && !raw.hasOutOfStock;

        // Filter out unavailable if requested
        if (input.availableOnly && !available) {
          context.logger.debug('Skipping unavailable product', { name: raw.name });
          continue;
        }

        // Build product URL
        let productUrl: string | undefined;
        if (raw.href) {
          productUrl = raw.href.startsWith('http') ? raw.href : `https://www.auchan.pt${raw.href}`;
        }

        // Parse price
        const unitPrice = raw.priceText ? parseCurrency(raw.priceText) : 0;

        // Extract size from product name if not found separately
        let size: string | undefined;
        const sizeMatch = raw.name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un|unidades))/i);
        if (sizeMatch?.[1]) {
          size = sizeMatch[1];
        }

        const product: SubstituteCandidate = {
          productId: raw.pid,
          name: raw.name,
          productUrl,
          unitPrice,
          pricePerUnit: raw.pricePerUnit || undefined,
          imageUrl: raw.imageUrl || undefined,
          brand: raw.brand || undefined,
          size,
          available,
        };

        products.push(product);
        context.logger.debug('Extracted product', {
          name: raw.name,
          price: unitPrice,
          available,
        });
      }

      // Capture screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await context.screenshot(`search-results-${input.query.slice(0, 20).replace(/\s/g, '-')}`);
        screenshots.push(screenshotPath);
      } catch {
        // Screenshot failed
      }

      context.logger.info('Product search completed', {
        query: input.query,
        found: products.length,
        totalFound,
      });

      return {
        success: true,
        data: {
          products,
          totalFound,
          searchQuery: input.query,
          hasResults: products.length > 0,
          ...(screenshotPath && { screenshot: screenshotPath }),
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Product search failed', {
        query: input.query,
        error: errorMessage,
      });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot('search-error');
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed
      }

      const toolError: ToolError = {
        message: errorMessage,
        code: errorMessage.includes('timeout') ? 'TIMEOUT_ERROR' : 'SELECTOR_ERROR',
        recoverable: true,
      };

      if (err instanceof Error) {
        toolError.cause = err;
      }

      return {
        success: false,
        error: toolError,
        screenshots,
        duration: Date.now() - start,
      };
    }
  },
};
