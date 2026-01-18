/**
 * Navigate to Replacements Page Tool
 *
 * Navigates to Auchan's curated replacement suggestions page via the "Substituir" link.
 * This is the PREFERRED source for substitutes as Auchan provides relevant alternatives
 * in the same category as the unavailable item.
 *
 * The tool:
 * 1. Finds the "Substituir" link for an unavailable product on the cart page
 * 2. Navigates to the linked category page
 * 3. Extracts products from the category page as substitute candidates
 *
 * IMPORTANT: This is a read-only tool. It never modifies cart state or places orders.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import type { SubstituteCandidate } from '../types.js';
import { dismissSubscriptionPopup } from '../../../utils/popup-handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input for NavigateToReplacementsPageTool.
 */
export interface NavigateToReplacementsInput {
  /** Product ID (data-pid) from the cart item */
  productId: string;
  /** Product name for logging/context */
  productName: string;
  /** Direct URL to replacement page if already extracted from cart */
  replacementUrl?: string;
  /** Maximum products to extract */
  maxResults?: number;
  /** Only return available products */
  availableOnly?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

/**
 * Output from NavigateToReplacementsPageTool.
 */
export interface NavigateToReplacementsOutput {
  /** Products found on the replacement/category page */
  products: SubstituteCandidate[];
  /** URL of the category page navigated to */
  categoryUrl: string;
  /** Name of the category (if extracted) */
  categoryName?: string;
  /** Total products found on page */
  totalFound: number;
  /** Whether the page had products */
  hasResults: boolean;
  /** Screenshot of the category page */
  screenshot?: string;
}

// =============================================================================
// Selectors
// =============================================================================

const CART_SELECTORS = {
  /** Substituir link for unavailable items */
  replacementLink: '.auc-find-replacement',
  /** Replacement link by product ID */
  replacementLinkByPid: (pid: string) => `.auc-find-replacement[data-pid="${pid}"]`,
};

const CATEGORY_PAGE_SELECTORS = {
  /** Product grid on category page */
  productGrid: '.auc-product-grid, .product-grid, [class*="product-grid"]',
  /** Product tiles */
  productTile: '.product-tile[data-pid], .auc-product-tile[data-pid], [data-pid]:has(.auc-product-tile__name)',
  /** Category title */
  categoryTitle: '.auc-category-title, h1.category-name, .breadcrumb-item.active',
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse currency from Auchan format "1,39 €" or "1,39€" -> 1.39
 */
function parseCurrency(text: string): number {
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

// =============================================================================
// Tool Implementation
// =============================================================================

/**
 * Navigate to Replacements Page Tool
 *
 * Navigates to Auchan's curated replacement suggestions page.
 */
export const navigateToReplacementsPageTool: Tool<NavigateToReplacementsInput, NavigateToReplacementsOutput> = {
  name: 'navigateToReplacementsPage',
  description: 'Navigate to Auchan\'s replacement suggestions page for an unavailable product',

  async execute(input, context): Promise<ToolResult<NavigateToReplacementsOutput>> {
    const start = Date.now();
    const screenshots: string[] = [];
    const timeout = input.timeout ?? 30000;
    const maxResults = input.maxResults ?? 10;
    const availableOnly = input.availableOnly ?? true;

    try {
      context.logger.info('Navigating to replacement suggestions', {
        productId: input.productId,
        productName: input.productName,
        hasDirectUrl: !!input.replacementUrl,
      });

      let categoryUrl: string;

      // Strategy 1: Use direct URL if provided
      if (input.replacementUrl) {
        categoryUrl = input.replacementUrl.startsWith('http')
          ? input.replacementUrl
          : `https://www.auchan.pt${input.replacementUrl}`;

        context.logger.debug('Using provided replacement URL', { url: categoryUrl });
      } else {
        // Strategy 2: Find and extract the Substituir link from cart page
        const currentUrl = context.page.url();
        const isOnCartPage = currentUrl.includes('/carrinho-compras');

        if (!isOnCartPage) {
          context.logger.info('Not on cart page, navigating to cart first');
          await context.page.goto('https://www.auchan.pt/pt/carrinho-compras', {
            timeout,
            waitUntil: 'domcontentloaded',
          });
          await context.page.waitForTimeout(2000);
          await dismissSubscriptionPopup(context.page, { logger: context.logger });
        }

        // Find the Substituir link for this product
        const linkSelector = CART_SELECTORS.replacementLinkByPid(input.productId);
        const linkElement = context.page.locator(linkSelector);

        const linkExists = await linkElement.count().catch(() => 0) > 0;

        if (!linkExists) {
          // Try generic selector and filter by parent context
          context.logger.debug('Specific link not found, trying generic selector');
          const allLinks = context.page.locator(CART_SELECTORS.replacementLink);
          const linkCount = await allLinks.count().catch(() => 0);

          if (linkCount === 0) {
            context.logger.warn('No replacement links found on cart page');

            const toolError: ToolError = {
              message: `No "Substituir" link found for product ${input.productId}`,
              code: 'SELECTOR_ERROR',
              recoverable: true,
            };

            return {
              success: false,
              error: toolError,
              screenshots,
              duration: Date.now() - start,
            };
          }
        }

        // Extract the href from the link
        const href = await linkElement.first().getAttribute('href').catch(() => null);

        if (!href) {
          const toolError: ToolError = {
            message: `Replacement link found but has no href attribute`,
            code: 'SELECTOR_ERROR',
            recoverable: true,
          };

          return {
            success: false,
            error: toolError,
            screenshots,
            duration: Date.now() - start,
          };
        }

        categoryUrl = href.startsWith('http') ? href : `https://www.auchan.pt${href}`;
      }

      context.logger.info('Navigating to category page', { url: categoryUrl });

      // Navigate to the category page
      await context.page.goto(categoryUrl, {
        timeout,
        waitUntil: 'domcontentloaded',
      });

      await context.page.waitForTimeout(2000);
      await dismissSubscriptionPopup(context.page, { logger: context.logger });

      // Wait for product grid to appear
      try {
        await context.page.waitForSelector(CATEGORY_PAGE_SELECTORS.productGrid, {
          timeout: 5000,
          state: 'visible',
        });
      } catch {
        context.logger.warn('Product grid not found on category page');
      }

      // Extract category name
      let categoryName: string | undefined;
      try {
        const titleElement = context.page.locator(CATEGORY_PAGE_SELECTORS.categoryTitle).first();
        categoryName = await titleElement.textContent().catch(() => null) || undefined;
        if (categoryName) {
          categoryName = categoryName.trim();
        }
      } catch {
        // Category name extraction failed
      }

      // Extract products via fast JavaScript evaluation
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

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const rawProducts = await context.page.evaluate(`
        (function() {
          var max = ${maxResults * 2};
          var tiles = document.querySelectorAll('.product-tile[data-pid], .auc-product-tile[data-pid], [data-pid]:has(.auc-product-tile__name)');
          var results = [];

          for (var i = 0; i < Math.min(tiles.length, max); i++) {
            var tile = tiles[i];
            if (!tile) continue;

            var pid = tile.getAttribute('data-pid') || ('cat-' + i);

            var nameEl = tile.querySelector('.auc-product-tile__name, .product-name');
            var name = nameEl ? (nameEl.textContent || '').trim() : '';
            if (!name) continue;

            var linkEl = tile.querySelector('a[href*="/produtos/"], a[href*="/pt/"]');
            var href = linkEl ? linkEl.getAttribute('href') : null;

            var priceText = null;
            var priceEl = tile.querySelector('.auc-price__no-list .value, .auc-product-tile__prices .price .value, .auc-product-tile__prices .value');
            if (priceEl) {
              priceText = (priceEl.textContent || '').trim() || null;
            }

            var perUnitEl = tile.querySelector('.price-per-unit, .unit-price, [class*="per-unit"], [class*="price-unit"]');
            var pricePerUnit = perUnitEl ? (perUnitEl.textContent || '').trim() : null;

            var brandEl = tile.querySelector('.auc-product__brand, .product-brand, .brand');
            var brand = brandEl ? (brandEl.textContent || '').trim() : null;

            var imgEl = tile.querySelector('img');
            var imageUrl = imgEl ? imgEl.getAttribute('src') : null;
            if (!imageUrl || imageUrl.indexOf('placeholder') >= 0) {
              imageUrl = imgEl ? imgEl.getAttribute('data-src') : null;
            }

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

      context.logger.info('Extracted products from category page', { count: rawProducts.length });

      // Process raw products into SubstituteCandidate objects
      const products: SubstituteCandidate[] = [];

      for (const raw of rawProducts) {
        const available = !raw.hasDisabledButton && !raw.hasOutOfStock;

        if (availableOnly && !available) {
          context.logger.debug('Skipping unavailable product', { name: raw.name });
          continue;
        }

        let productUrl: string | undefined;
        if (raw.href) {
          productUrl = raw.href.startsWith('http') ? raw.href : `https://www.auchan.pt${raw.href}`;
        }

        const unitPrice = raw.priceText ? parseCurrency(raw.priceText) : 0;

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

        // Limit to maxResults
        if (products.length >= maxResults) {
          break;
        }
      }

      // Capture screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await context.screenshot(`replacements-${input.productId}`);
        screenshots.push(screenshotPath);
      } catch {
        // Screenshot failed
      }

      context.logger.info('Replacement page extraction completed', {
        productId: input.productId,
        found: products.length,
        categoryUrl,
        categoryName,
      });

      return {
        success: true,
        data: {
          products,
          categoryUrl,
          ...(categoryName !== undefined && { categoryName }),
          totalFound: rawProducts.length,
          hasResults: products.length > 0,
          ...(screenshotPath && { screenshot: screenshotPath }),
        },
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Replacement page navigation failed', {
        productId: input.productId,
        productName: input.productName,
        error: errorMessage,
      });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot('replacements-error');
        screenshots.push(screenshot);
      } catch {
        // Screenshot failed
      }

      const toolError: ToolError = {
        message: errorMessage,
        code: errorMessage.includes('timeout') ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
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

