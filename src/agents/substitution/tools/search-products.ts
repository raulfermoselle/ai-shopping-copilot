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
 * Extract product ID from URL
 * URL format: https://www.auchan.pt/pt/produtos/ID or /pt/algo/ID
 */
function extractProductId(url: string): string {
  // Try to extract from various URL patterns
  const patterns = [
    /\/produtos\/([a-zA-Z0-9-]+)/,
    /\/([a-zA-Z0-9-]+)(?:\?|$)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  // Fallback: use last path segment
  const segments = url.split('/').filter(Boolean);
  return segments[segments.length - 1]?.split('?')[0] || '';
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

      // Extract product cards
      const productCardSelectors = [
        resolver.buildCompositeSelector('search', 'productCard'),
        '.auc-product-card',
        '.product-card',
        '[class*="product-card"]',
        '[class*="product-tile"]',
        'article[class*="product"]',
        '.product-item',
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

      // Extract product information
      const products: SubstituteCandidate[] = [];
      const maxToExtract = Math.min(productElements.length, input.maxResults ?? 10);

      for (let i = 0; i < maxToExtract; i++) {
        const productElement = productElements[i];
        if (!productElement) continue;

        try {
          // Extract product name
          const nameSelectors = [
            resolver.buildCompositeSelector('search', 'productName'),
            '.auc-product__name',
            '.product-name',
            '.product-title',
            'h2, h3, h4',
            'a[href*="/produtos/"]',
          ].filter(Boolean).join(', ');

          const nameElement = await productElement.locator(nameSelectors).first();
          const name = (await nameElement.textContent())?.trim() || '';

          if (!name) {
            context.logger.debug('Skipping product without name', { index: i });
            continue;
          }

          // Extract product URL
          let productUrl: string | undefined;
          try {
            const linkElement = await productElement.locator('a[href*="/produtos/"], a[href*="/pt/"]').first();
            const href = await linkElement.getAttribute('href');
            if (href) {
              productUrl = href.startsWith('http') ? href : `https://www.auchan.pt${href}`;
            }
          } catch {
            productUrl = undefined;
          }

          const productId = productUrl ? extractProductId(productUrl) : `search-${i}`;

          // Extract price
          let unitPrice = 0;
          try {
            const priceSelectors = [
              resolver.buildCompositeSelector('search', 'productPrice'),
              '.auc-product__price',
              '.product-price',
              '.price',
              '[class*="price"]',
            ].filter(Boolean).join(', ');

            const priceElement = await productElement.locator(priceSelectors).first();
            const priceText = await priceElement.textContent();
            if (priceText) {
              unitPrice = parseCurrency(priceText);
            }
          } catch {
            // Price not found
          }

          // Extract price per unit (e.g., "2,50€/kg")
          let pricePerUnit: string | undefined;
          try {
            const perUnitSelectors = [
              resolver.buildCompositeSelector('search', 'pricePerUnit'),
              '.price-per-unit',
              '.unit-price',
              '[class*="per-unit"]',
              '[class*="price-unit"]',
            ].filter(Boolean).join(', ');

            const perUnitElement = await productElement.locator(perUnitSelectors).first();
            pricePerUnit = (await perUnitElement.textContent())?.trim();
          } catch {
            // Per unit price not found
          }

          // Extract brand
          let brand: string | undefined;
          try {
            const brandSelectors = [
              resolver.buildCompositeSelector('search', 'productBrand'),
              '.auc-product__brand',
              '.product-brand',
              '.brand',
              '[class*="brand"]',
            ].filter(Boolean).join(', ');

            const brandElement = await productElement.locator(brandSelectors).first();
            brand = (await brandElement.textContent())?.trim();
          } catch {
            // Brand not found
          }

          // Extract size/weight
          let size: string | undefined;
          try {
            const sizeSelectors = [
              resolver.buildCompositeSelector('search', 'productSize'),
              '.auc-product__size',
              '.product-size',
              '.weight',
              '[class*="size"]',
              '[class*="weight"]',
            ].filter(Boolean).join(', ');

            const sizeElement = await productElement.locator(sizeSelectors).first();
            size = (await sizeElement.textContent())?.trim();
          } catch {
            // Size not found - try to extract from name
            const sizeMatch = name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un|unidades))/i);
            if (sizeMatch?.[1]) {
              size = sizeMatch[1];
            }
          }

          // Extract image URL
          let imageUrl: string | undefined;
          try {
            const imgElement = await productElement.locator('img').first();
            imageUrl = await imgElement.getAttribute('src') || undefined;
            // Handle lazy loading
            if (!imageUrl || imageUrl.includes('placeholder')) {
              imageUrl = await imgElement.getAttribute('data-src') || undefined;
            }
          } catch {
            // Image not found
          }

          // Check availability
          let available = true;
          try {
            const unavailableSelectors = [
              resolver.buildCompositeSelector('search', 'unavailableIndicator'),
              '.unavailable',
              '.out-of-stock',
              '.esgotado',
              '[class*="unavailable"]',
              '[class*="esgotado"]',
              'button[disabled]:has-text("Esgotado")',
            ].filter(Boolean).join(', ');

            const unavailableElement = await productElement.locator(unavailableSelectors).first();
            const hasUnavailable = await unavailableElement.isVisible().catch(() => false);
            available = !hasUnavailable;
          } catch {
            // Assume available if check fails
          }

          // Filter out unavailable if requested
          if (input.availableOnly && !available) {
            context.logger.debug('Skipping unavailable product', { name });
            continue;
          }

          const product: SubstituteCandidate = {
            productId,
            name,
            productUrl,
            unitPrice,
            pricePerUnit,
            imageUrl,
            brand,
            size,
            available,
          };

          products.push(product);
          context.logger.debug('Extracted product', {
            name,
            price: unitPrice,
            available,
          });
        } catch (err) {
          context.logger.warn('Failed to extract product', {
            index: i,
            error: err instanceof Error ? err.message : String(err),
          });
          // Continue with next product
        }
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
