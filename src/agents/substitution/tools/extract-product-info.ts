/**
 * Extract Product Info Tool
 *
 * Extracts detailed product information from an Auchan.pt product page:
 * - Basic info: name, price, brand, size
 * - Availability status
 * - Optional details: description, ingredients, nutrition
 *
 * IMPORTANT: This is a read-only tool. It never modifies cart state or places orders.
 */

import type { Tool, ToolResult, ToolError } from '../../../types/tool.js';
import type {
  ExtractProductInfoInput,
  ExtractProductInfoOutput,
  ProductDetails,
} from './types.js';
import type { SubstituteCandidate } from '../types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';
import { dismissSubscriptionPopup } from '../../../utils/popup-handler.js';

/**
 * Parse currency from Auchan format "1,39 €" or "1,39€" -> 1.39
 */
function parseCurrency(text: string): number {
  const cleaned = text.replace(/\s/g, '').replace('€', '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Extract product ID from URL
 */
function extractProductId(url: string): string {
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

  const segments = url.split('/').filter(Boolean);
  return segments[segments.length - 1]?.split('?')[0] || '';
}

/**
 * Extract Product Info Tool
 *
 * Navigates to a product page and extracts detailed information.
 */
export const extractProductInfoTool: Tool<ExtractProductInfoInput, ExtractProductInfoOutput> = {
  name: 'extractProductInfo',
  description: 'Extract detailed product information from an Auchan.pt product page',

  async execute(input, context): Promise<ToolResult<ExtractProductInfoOutput>> {
    const start = Date.now();
    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      context.logger.info('Extracting product info', {
        url: input.productUrl,
        includeDetails: input.includeDetails,
      });

      // Navigate to product page
      await context.page.goto(input.productUrl, {
        timeout: input.timeout || context.config.navigationTimeout,
        waitUntil: 'domcontentloaded',
      });

      await context.page.waitForTimeout(1500);

      // Dismiss any popups
      await dismissSubscriptionPopup(context.page, { logger: context.logger });

      // Wait for product content to load
      const productContainerSelectors = [
        resolver.buildCompositeSelector('product', 'container'),
        '.auc-product-detail',
        '.product-detail',
        '[class*="product-detail"]',
        'main article',
        'main [class*="product"]',
      ].filter(Boolean).join(', ');

      try {
        await context.page.waitForSelector(productContainerSelectors, {
          timeout: 5000,
          state: 'visible',
        });
      } catch {
        context.logger.warn('Product container not found, attempting extraction anyway');
      }

      // Extract product name
      let name = '';
      const nameSelectors = [
        resolver.buildCompositeSelector('product', 'name'),
        '.auc-product__name',
        '.product-name',
        'h1[class*="product"]',
        'h1',
        '[class*="product-title"]',
      ].filter(Boolean).join(', ');

      try {
        const nameElement = await context.page.locator(nameSelectors).first();
        name = (await nameElement.textContent())?.trim() || '';
      } catch {
        context.logger.warn('Product name not found');
      }

      // Extract price
      let unitPrice = 0;
      const priceSelectors = [
        resolver.buildCompositeSelector('product', 'price'),
        '.auc-product__price',
        '.product-price',
        '.price-current',
        '[class*="price"]:not([class*="per-unit"])',
      ].filter(Boolean).join(', ');

      try {
        const priceElement = await context.page.locator(priceSelectors).first();
        const priceText = await priceElement.textContent();
        if (priceText) {
          unitPrice = parseCurrency(priceText);
        }
      } catch {
        context.logger.warn('Product price not found');
      }

      // Extract price per unit
      let pricePerUnit: string | undefined;
      const perUnitSelectors = [
        resolver.buildCompositeSelector('product', 'pricePerUnit'),
        '.price-per-unit',
        '.unit-price',
        '[class*="per-unit"]',
        '[class*="price-unit"]',
      ].filter(Boolean).join(', ');

      try {
        const perUnitElement = await context.page.locator(perUnitSelectors).first();
        pricePerUnit = (await perUnitElement.textContent())?.trim();
      } catch {
        // Price per unit not found
      }

      // Extract brand
      let brand: string | undefined;
      const brandSelectors = [
        resolver.buildCompositeSelector('product', 'brand'),
        '.auc-product__brand',
        '.product-brand',
        '.brand',
        '[class*="brand"]',
        'a[href*="/marcas/"]',
      ].filter(Boolean).join(', ');

      try {
        const brandElement = await context.page.locator(brandSelectors).first();
        brand = (await brandElement.textContent())?.trim();
      } catch {
        // Brand not found
      }

      // Extract size/weight
      let size: string | undefined;
      const sizeSelectors = [
        resolver.buildCompositeSelector('product', 'size'),
        '.auc-product__size',
        '.product-size',
        '.product-weight',
        '[class*="size"]',
        '[class*="weight"]',
      ].filter(Boolean).join(', ');

      try {
        const sizeElement = await context.page.locator(sizeSelectors).first();
        size = (await sizeElement.textContent())?.trim();
      } catch {
        // Try to extract from name
        const sizeMatch = name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un|unidades))/i);
        if (sizeMatch?.[1]) {
          size = sizeMatch[1];
        }
      }

      // Extract image URL
      let imageUrl: string | undefined;
      const imageSelectors = [
        resolver.buildCompositeSelector('product', 'image'),
        '.auc-product__image img',
        '.product-image img',
        '[class*="product-image"] img',
        'main img[src*="auchan"]',
      ].filter(Boolean).join(', ');

      try {
        const imgElement = await context.page.locator(imageSelectors).first();
        imageUrl = await imgElement.getAttribute('src') || undefined;
        if (!imageUrl || imageUrl.includes('placeholder')) {
          imageUrl = await imgElement.getAttribute('data-src') || undefined;
        }
      } catch {
        // Image not found
      }

      // Check availability
      let available = true;
      const unavailableSelectors = [
        resolver.buildCompositeSelector('product', 'unavailable'),
        '.unavailable',
        '.out-of-stock',
        '.esgotado',
        '[class*="unavailable"]',
        '[class*="esgotado"]',
        'button[disabled]:has-text("Esgotado")',
        '.add-to-cart[disabled]',
      ].filter(Boolean).join(', ');

      try {
        const unavailableElement = await context.page.locator(unavailableSelectors).first();
        const hasUnavailable = await unavailableElement.isVisible().catch(() => false);
        available = !hasUnavailable;
      } catch {
        // Assume available
      }

      // Build product candidate
      const productId = extractProductId(input.productUrl);
      const product: SubstituteCandidate = {
        productId,
        name,
        productUrl: input.productUrl,
        unitPrice,
        pricePerUnit,
        imageUrl,
        brand,
        size,
        available,
      };

      // Extract additional details if requested
      let details: ProductDetails | undefined;
      if (input.includeDetails) {
        details = {};

        // Extract description
        const descSelectors = [
          resolver.buildCompositeSelector('product', 'description'),
          '.auc-product__description',
          '.product-description',
          '[class*="description"]',
          '.product-info p',
        ].filter(Boolean).join(', ');

        try {
          const descElement = await context.page.locator(descSelectors).first();
          const descText = (await descElement.textContent())?.trim();
          if (descText) {
            details.description = descText;
          }
        } catch {
          // Description not found
        }

        // Extract ingredients
        const ingredientsSelectors = [
          resolver.buildCompositeSelector('product', 'ingredients'),
          '.ingredients',
          '[class*="ingredient"]',
          ':has-text("Ingredientes:") + *',
        ].filter(Boolean).join(', ');

        try {
          const ingredientsElement = await context.page.locator(ingredientsSelectors).first();
          const ingredientsText = (await ingredientsElement.textContent())?.trim();
          if (ingredientsText) {
            details.ingredients = ingredientsText;
          }
        } catch {
          // Ingredients not found
        }

        // Extract weight/volume
        if (size) {
          details.weight = size;
        }

        // Extract allergens (often in ingredients or separate section)
        const allergenSelectors = [
          resolver.buildCompositeSelector('product', 'allergens'),
          '.allergens',
          '[class*="allergen"]',
          ':has-text("Alerg") *',
        ].filter(Boolean).join(', ');

        try {
          const allergenElement = await context.page.locator(allergenSelectors).first();
          const allergenText = (await allergenElement.textContent())?.trim();
          if (allergenText) {
            // Parse allergens from text (often comma or newline separated)
            details.allergens = allergenText
              .split(/[,\n]/)
              .map((a) => a.trim())
              .filter(Boolean);
          }
        } catch {
          // Allergens not found
        }

        // Extract origin/country
        const originSelectors = [
          resolver.buildCompositeSelector('product', 'origin'),
          '.origin',
          '[class*="origin"]',
          ':has-text("Origem:") + *',
          ':has-text("País:") + *',
        ].filter(Boolean).join(', ');

        try {
          const originElement = await context.page.locator(originSelectors).first();
          const originText = (await originElement.textContent())?.trim();
          if (originText) {
            details.origin = originText;
          }
        } catch {
          // Origin not found
        }

        // Extract nutrition info (simplified - just key values)
        const nutritionSelectors = [
          resolver.buildCompositeSelector('product', 'nutrition'),
          '.nutrition',
          '.nutritional-info',
          '[class*="nutrition"]',
          'table:has-text("Energia")',
        ].filter(Boolean).join(', ');

        try {
          const nutritionElement = await context.page.locator(nutritionSelectors).first();
          const nutritionText = await nutritionElement.textContent();
          if (nutritionText) {
            details.nutrition = {};
            // Try to parse key nutrition values
            const patterns = [
              { key: 'energia', pattern: /Energia[:\s]*(\d+(?:,\d+)?\s*k?[cC]al)/i },
              { key: 'proteinas', pattern: /Prote[íi]nas?[:\s]*(\d+(?:,\d+)?\s*g)/i },
              { key: 'hidratos', pattern: /Hidratos[:\s]*(\d+(?:,\d+)?\s*g)/i },
              { key: 'gorduras', pattern: /Gordura[s]?[:\s]*(\d+(?:,\d+)?\s*g)/i },
              { key: 'fibra', pattern: /Fibra[:\s]*(\d+(?:,\d+)?\s*g)/i },
              { key: 'sal', pattern: /Sal[:\s]*(\d+(?:,\d+)?\s*g)/i },
            ];

            for (const { key, pattern } of patterns) {
              const match = nutritionText.match(pattern);
              if (match?.[1]) {
                details.nutrition[key] = match[1];
              }
            }
          }
        } catch {
          // Nutrition info not found
        }
      }

      // Capture screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await context.screenshot(`product-${productId}`);
        screenshots.push(screenshotPath);
      } catch {
        // Screenshot failed
      }

      context.logger.info('Product info extracted', {
        name,
        price: unitPrice,
        available,
        hasDetails: !!details,
      });

      // Build output with conditional properties
      const outputData: ExtractProductInfoOutput = {
        product,
        pageUrl: input.productUrl,
      };
      if (details !== undefined) {
        outputData.details = details;
      }
      if (screenshotPath !== undefined) {
        outputData.screenshot = screenshotPath;
      }

      return {
        success: true,
        data: outputData,
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger.error('Product info extraction failed', {
        url: input.productUrl,
        error: errorMessage,
      });

      // Capture error screenshot
      try {
        const screenshot = await context.screenshot('product-info-error');
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
