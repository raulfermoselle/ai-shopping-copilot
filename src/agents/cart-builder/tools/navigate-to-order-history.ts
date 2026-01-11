/**
 * NavigateToOrderHistoryTool
 *
 * Navigates from any page to the Auchan.pt order history page.
 * Handles auth redirects and validates successful navigation.
 */

import type { Tool, ToolResult, ToolContext, ToolError } from '../../../types/tool.js';
import type {
  NavigateToOrderHistoryInput,
  NavigateToOrderHistoryOutput,
} from './types.js';
import { createSelectorResolver } from '../../../selectors/resolver.js';

const ORDER_HISTORY_URL = 'https://www.auchan.pt/pt/historico-encomendas';
const AUTH_REDIRECT_PATTERN = /\/pt\/login/i;

/**
 * NavigateToOrderHistoryTool implementation.
 *
 * Navigates to the order history page with retry logic and auth detection.
 *
 * @example
 * const result = await navigateToOrderHistoryTool.execute(
 *   { waitForLoad: true, timeout: 30000 },
 *   context
 * );
 */
export const navigateToOrderHistoryTool: Tool<
  NavigateToOrderHistoryInput,
  NavigateToOrderHistoryOutput
> = {
  name: 'navigateToOrderHistory',
  description: 'Navigate to Auchan order history page',

  async execute(
    input: NavigateToOrderHistoryInput,
    context: ToolContext
  ): Promise<ToolResult<NavigateToOrderHistoryOutput>> {
    const start = Date.now();
    const { page, logger, screenshot } = context;
    const { waitForLoad = true, timeout = 30000 } = input;

    const resolver = createSelectorResolver();
    const screenshots: string[] = [];

    try {
      logger.info('Checking current URL before navigation');
      const currentUrl = page.url();

      // Check if already on order history page
      if (currentUrl.includes('historico-encomendas')) {
        logger.info('Already on order history page', { url: currentUrl });

        // Still verify the page is loaded properly
        if (waitForLoad) {
          const containerResult = await resolver.tryResolve(
            page,
            'order-history',
            'orderListContainer',
            { timeout: 5000 }
          );

          if (!containerResult) {
            logger.warn('Order list container not found despite being on correct URL');
          }
        }

        const screenshotPath = await screenshot('order-history-already-loaded');
        screenshots.push(screenshotPath);

        return {
          success: true,
          data: {
            success: true,
            url: currentUrl,
            screenshot: screenshotPath,
          },
          screenshots,
          duration: Date.now() - start,
        };
      }

      // Navigate to order history page
      logger.info('Navigating to order history page', { url: ORDER_HISTORY_URL });

      let navigationAttempts = 0;
      const maxAttempts = 2;

      while (navigationAttempts < maxAttempts) {
        navigationAttempts++;

        try {
          await page.goto(ORDER_HISTORY_URL, {
            timeout,
            waitUntil: 'domcontentloaded',
          });

          // Wait a short moment for any redirects
          await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

          const finalUrl = page.url();
          logger.info('Navigation completed', { finalUrl, attempt: navigationAttempts });

          // Check for auth redirect
          if (AUTH_REDIRECT_PATTERN.test(finalUrl)) {
            logger.error('Redirected to login page - authentication required');

            const screenshotPath = await screenshot('order-history-auth-required');
            screenshots.push(screenshotPath);

            const error: ToolError = {
              message: 'Authentication required. User must log in first.',
              code: 'AUTH_ERROR',
              recoverable: true,
            };

            return {
              success: false,
              error,
              screenshots,
              duration: Date.now() - start,
            };
          }

          // Verify we're on the correct page
          if (!finalUrl.includes('historico-encomendas')) {
            logger.warn('Navigation did not reach order history page', { finalUrl });

            if (navigationAttempts < maxAttempts) {
              logger.info('Retrying navigation');
              await page.waitForTimeout(1000);
              continue;
            }

            const screenshotPath = await screenshot('order-history-wrong-page');
            screenshots.push(screenshotPath);

            const error: ToolError = {
              message: `Navigation reached wrong page: ${finalUrl}`,
              code: 'NETWORK_ERROR',
              recoverable: true,
            };

            return {
              success: false,
              error,
              screenshots,
              duration: Date.now() - start,
            };
          }

          // Wait for order list container if requested
          if (waitForLoad) {
            logger.info('Waiting for order list container to load');

            const containerResult = await resolver.tryResolve(
              page,
              'order-history',
              'orderListContainer',
              { timeout: 10000 }
            );

            if (!containerResult) {
              logger.warn('Order list container not found within timeout');

              const screenshotPath = await screenshot('order-history-container-timeout');
              screenshots.push(screenshotPath);

              const error: ToolError = {
                message: 'Order list container not found after navigation',
                code: 'SELECTOR_ERROR',
                recoverable: true,
              };

              return {
                success: false,
                error,
                screenshots,
                duration: Date.now() - start,
              };
            }

            if (containerResult.usedFallback) {
              logger.warn('Order list container found using fallback selector', {
                fallbackIndex: containerResult.fallbackIndex,
              });
            }
          }

          // Success
          const screenshotPath = await screenshot('order-history-loaded');
          screenshots.push(screenshotPath);

          logger.info('Successfully navigated to order history page', { url: finalUrl });

          return {
            success: true,
            data: {
              success: true,
              url: finalUrl,
              screenshot: screenshotPath,
            },
            screenshots,
            duration: Date.now() - start,
          };
        } catch (err) {
          logger.error('Navigation attempt failed', {
            attempt: navigationAttempts,
            error: err instanceof Error ? err.message : String(err),
          });

          if (navigationAttempts >= maxAttempts) {
            throw err;
          }

          // Wait before retry
          await page.waitForTimeout(1000);
        }
      }

      // This should not be reached, but TypeScript requires it
      const error: ToolError = {
        message: 'Navigation failed after all retry attempts',
        code: 'NETWORK_ERROR',
        recoverable: false,
      };

      return {
        success: false,
        error,
        screenshots,
        duration: Date.now() - start,
      };
    } catch (err) {
      logger.error('NavigateToOrderHistoryTool execution failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      const screenshotPath = await screenshot('order-history-error').catch(() => '');
      if (screenshotPath) {
        screenshots.push(screenshotPath);
      }

      const toolError: ToolError = {
        message: err instanceof Error ? err.message : 'Unknown error during navigation',
        code: err instanceof Error && err.message.includes('Timeout') ? 'TIMEOUT_ERROR' : 'UNKNOWN_ERROR',
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
