/**
 * Coordinator Agent Implementation
 *
 * Orchestrates the shopping cart preparation session by:
 * - Managing session lifecycle (init → login → cart building → review)
 * - Delegating to worker agents (CartBuilder in Phase 1)
 * - Handling errors and retries
 * - Creating the final Review Pack for user approval
 *
 * SAFETY CONSTRAINT: Coordinator NEVER submits orders - stops at review stage.
 *
 * Phase 1 Flow:
 * 1. Initialize session (load config, preferences)
 * 2. Login to Auchan.pt
 * 3. Delegate to CartBuilder (load/merge orders)
 * 4. Generate Review Pack
 * 5. Return ready-to-review cart
 *
 * Phase 2+ Extensions:
 * - Substitution worker (find replacements for unavailable items)
 * - StockPruner worker (remove recently-purchased items)
 * - SlotScout worker (collect delivery slot options)
 */

import type { AgentContext } from '../../types/agent.js';
import type {
  CoordinatorConfig,
  CoordinatorResult,
  CoordinatorSession,
  CoordinatorError,
  ReviewPack,
  CartBuilderWorkerResult,
} from './types.js';
import {
  CoordinatorConfigSchema,
  createSession,
  createError,
  createCartBuilderConfig,
  createDefaultActions,
  toReviewCartItem,
} from './types.js';
import { CartBuilder } from '../cart-builder/cart-builder.js';
import { createLoginTool, type LoginResult } from '../../tools/login.js';
import type { ToolContext, ToolConfig } from '../../types/tool.js';

/**
 * Coordinator Agent
 *
 * Responsible for:
 * 1. Managing the shopping session lifecycle
 * 2. Delegating to worker agents (CartBuilder, etc.)
 * 3. Aggregating worker results
 * 4. Generating the Review Pack for user approval
 *
 * SAFETY: Never auto-purchases - stops at review_ready state.
 */
export class Coordinator {
  private readonly config: CoordinatorConfig;
  private session: CoordinatorSession | null = null;

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = CoordinatorConfigSchema.parse(config);
  }

  /**
   * Run the Coordinator agent.
   *
   * Executes the Phase 1 orchestration flow:
   * 1. Initialize session
   * 2. Login to Auchan.pt (assumes already logged in for Phase 1)
   * 3. Delegate to CartBuilder
   * 4. Generate Review Pack
   * 5. Return ready-to-review cart
   *
   * @param context - Agent execution context
   * @param username - Auchan username (email)
   * @param householdId - Household identifier for preferences
   * @returns CoordinatorResult with Review Pack
   */
  async run(
    context: AgentContext,
    username: string,
    householdId: string
  ): Promise<CoordinatorResult> {
    const { logger, sessionId } = context;
    const logs: string[] = [];
    const startTime = Date.now();

    try {
      // Step 1: Initialize session
      logger.info('Coordinator starting session', { sessionId, username, householdId });
      logs.push('Coordinator session started');

      this.session = createSession(sessionId, username, householdId);
      this.updateStatus('initializing');

      // Step 2: Login to Auchan.pt
      this.updateStatus('authenticating');
      const loginResult = await this.performLogin(context, username);
      if (!loginResult.loggedIn) {
        throw new Error('Login failed');
      }
      logs.push(
        loginResult.sessionRestored
          ? `Login: Session restored for ${loginResult.userName ?? 'user'}`
          : `Login: Fresh login successful for ${loginResult.userName ?? 'user'}`
      );

      // Step 3: Delegate to CartBuilder
      this.updateStatus('loading_cart');
      const cartBuilderResult = await this.delegateToCartBuilder(context);
      logs.push(
        cartBuilderResult.success
          ? `CartBuilder completed: ${cartBuilderResult.report?.diff.summary.addedCount ?? 0} items added`
          : `CartBuilder failed: ${cartBuilderResult.errorMessage}`
      );

      if (!cartBuilderResult.success || !cartBuilderResult.report) {
        throw new Error(cartBuilderResult.errorMessage ?? 'CartBuilder failed without error message');
      }

      // Step 4: Generate Review Pack
      this.updateStatus('generating_review');
      const reviewPack = this.generateReviewPack(cartBuilderResult.report);
      this.session.reviewPack = reviewPack;
      logs.push('Review Pack generated');

      // Step 5: Mark ready for review
      this.updateStatus('review_ready');
      this.session.endTime = new Date();

      const durationMs = Date.now() - startTime;
      logger.info('Coordinator completed successfully', {
        sessionId,
        durationMs,
        itemCount: reviewPack.cart.summary.itemCount,
      });

      return {
        success: true,
        data: {
          sessionId,
          reviewPack,
          screenshots: this.session.screenshots,
          durationMs,
          status: 'review_ready',
        },
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Coordinator failed', { error: err.message });
      logs.push(`Error: ${err.message}`);

      if (this.session) {
        this.updateStatus('cancelled');
        this.session.endTime = new Date();
        this.session.errors.push(
          createError('COORDINATOR_FAILED', err.message, 'fatal', 'coordinator')
        );
      }

      return {
        success: false,
        error: err,
        logs,
      };
    }
  }

  /**
   * Get current session state.
   */
  getSession(): CoordinatorSession | null {
    return this.session;
  }

  // ===========================================================================
  // Private Methods - Session Management
  // ===========================================================================

  /**
   * Update session status.
   */
  private updateStatus(status: CoordinatorSession['status']): void {
    if (this.session) {
      this.session.status = status;
    }
  }

  /**
   * Record an error in the session.
   */
  private recordError(error: CoordinatorError): void {
    if (this.session) {
      this.session.errors.push(error);
    }
  }

  // ===========================================================================
  // Private Methods - Authentication
  // ===========================================================================

  /**
   * Create a ToolContext from AgentContext for tool execution.
   */
  private createToolContext(context: AgentContext): ToolContext {
    const { page, logger } = context;
    const screenshotDir = 'screenshots';

    const toolConfig: ToolConfig = {
      navigationTimeout: 30000,
      elementTimeout: 10000,
      screenshotDir,
    };

    return {
      page,
      logger,
      screenshot: async (name: string): Promise<string> => {
        const timestamp = Date.now();
        const filename = `${name}-${timestamp}.png`;
        const filepath = `${screenshotDir}/${filename}`;
        await page.screenshot({ path: filepath });
        if (this.session) {
          this.session.screenshots.push(filepath);
        }
        return filepath;
      },
      config: toolConfig,
    };
  }

  /**
   * Perform login to Auchan.pt using the LoginTool.
   *
   * @param context - Agent context with page and logger
   * @param email - User email for login
   * @returns Login result with session info
   */
  private async performLogin(context: AgentContext, email: string): Promise<LoginResult> {
    const { logger } = context;

    try {
      logger.info('Starting authentication', { email });

      const loginTool = createLoginTool();
      const toolContext = this.createToolContext(context);

      // Execute login with timeout protection
      const result = await this.executeWithTimeout(
        loginTool.execute({ email }, toolContext),
        this.config.sessionTimeout,
        'Login timed out'
      );

      if (!result.success || !result.data) {
        const errorMsg = result.error?.message ?? 'Login failed';
        this.recordError(
          createError('LOGIN_FAILED', errorMsg, 'fatal', 'login')
        );
        throw new Error(errorMsg);
      }

      logger.info('Authentication completed', {
        sessionRestored: result.data.sessionRestored,
        userName: result.data.userName,
      });

      return result.data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if it's an auth-related error (non-retryable)
      if (!this.isRetryableError(err)) {
        this.recordError(
          createError('AUTH_FAILED', err.message, 'fatal', 'login')
        );
        throw err;
      }

      // For retryable errors, let the caller decide
      throw err;
    }
  }

  // ===========================================================================
  // Private Methods - Worker Delegation
  // ===========================================================================

  /**
   * Delegate to CartBuilder worker with timeout and retry handling.
   *
   * Runtime patterns:
   * - Timeout: Wraps worker execution with configurable timeout
   * - Retry: Attempts recovery for transient failures up to maxRetries
   * - State preservation: Records all attempts and outcomes
   *
   * @param context - Agent context with page and logger
   * @returns CartBuilder worker result
   */
  private async delegateToCartBuilder(context: AgentContext): Promise<CartBuilderWorkerResult> {
    const { logger } = context;
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      attempt++;
      const attemptStartTime = Date.now();

      try {
        logger.info('CartBuilder delegation attempt', {
          attempt,
          maxRetries: this.config.maxRetries,
          timeout: this.config.sessionTimeout,
        });

        const cartBuilderConfig = createCartBuilderConfig(this.config);
        const cartBuilder = new CartBuilder(cartBuilderConfig);

        // Execute with timeout protection
        const result = await this.executeWithTimeout(
          cartBuilder.run(context),
          this.config.sessionTimeout,
          'CartBuilder execution timed out'
        );

        const durationMs = Date.now() - attemptStartTime;

        if (result.success && result.data) {
          const workerResult: CartBuilderWorkerResult = {
            success: true,
            durationMs,
            report: result.data.report,
          };

          if (this.session) {
            this.session.workers.cartBuilder = workerResult;
            // Collect screenshots from CartBuilder
            if (result.data.report.screenshots) {
              this.session.screenshots.push(...result.data.report.screenshots);
            }
          }

          // Log recovery success if we had previous failures
          if (attempt > 1) {
            logger.info('CartBuilder recovered after retry', { attempt, durationMs });
          }

          return workerResult;
        } else {
          // Worker returned failure - check if retryable
          lastError = result.error ?? new Error('Unknown CartBuilder error');

          if (this.isRetryableError(lastError)) {
            const recoveryError = createError(
              'CART_BUILDER_TRANSIENT',
              lastError.message,
              'warning',
              'cart_builder',
              { attempt, willRetry: attempt <= this.config.maxRetries }
            );
            recoveryError.recoveryAttempted = true;
            recoveryError.recoveryOutcome = attempt <= this.config.maxRetries ? 'retrying' : 'exhausted';
            this.recordError(recoveryError);

            logger.warn('CartBuilder transient failure, will retry', {
              attempt,
              error: lastError.message,
            });
            continue;
          }

          // Non-retryable failure
          const workerResult: CartBuilderWorkerResult = {
            success: false,
            durationMs,
            errorMessage: lastError.message,
          };

          if (this.session) {
            this.session.workers.cartBuilder = workerResult;
            this.recordError(
              createError(
                'CART_BUILDER_FAILED',
                workerResult.errorMessage ?? 'CartBuilder failed',
                'error',
                'cart_builder'
              )
            );
          }

          return workerResult;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Check if this is a timeout or retryable error
        if (this.isRetryableError(err) && attempt <= this.config.maxRetries) {
          const recoveryError = createError(
            'CART_BUILDER_TRANSIENT',
            err.message,
            'warning',
            'cart_builder',
            { attempt, willRetry: true }
          );
          recoveryError.recoveryAttempted = true;
          recoveryError.recoveryOutcome = 'retrying';
          this.recordError(recoveryError);

          logger.warn('CartBuilder exception, will retry', {
            attempt,
            error: err.message,
          });
          continue;
        }

        // Final attempt or non-retryable
        const durationMs = Date.now() - startTime;
        const workerResult: CartBuilderWorkerResult = {
          success: false,
          durationMs,
          errorMessage: err.message,
        };

        if (this.session) {
          this.session.workers.cartBuilder = workerResult;
          this.recordError(
            createError('CART_BUILDER_EXCEPTION', err.message, 'error', 'cart_builder', {
              attempt,
              totalDuration: durationMs,
            })
          );
        }

        return workerResult;
      }
    }

    // All retries exhausted
    const durationMs = Date.now() - startTime;
    const workerResult: CartBuilderWorkerResult = {
      success: false,
      durationMs,
      errorMessage: lastError?.message ?? 'All retry attempts exhausted',
    };

    if (this.session) {
      this.session.workers.cartBuilder = workerResult;
      this.recordError(
        createError(
          'CART_BUILDER_RETRIES_EXHAUSTED',
          `Failed after ${attempt} attempts: ${lastError?.message}`,
          'error',
          'cart_builder',
          { attempts: attempt }
        )
      );
    }

    return workerResult;
  }

  /**
   * Execute a promise with timeout protection.
   *
   * @param promise - The promise to execute
   * @param timeoutMs - Timeout in milliseconds
   * @param timeoutMessage - Message for timeout error
   * @returns The promise result
   * @throws Error if timeout is exceeded
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`TIMEOUT: ${timeoutMessage} (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Determine if an error is retryable (transient).
   *
   * Error classification for retry decisions:
   * - Timeout errors: retryable (network/server temporary issues)
   * - Navigation errors: retryable (page load failures)
   * - Element not found: retryable (timing issues, dynamic content)
   * - Authentication errors: NOT retryable (need user action)
   * - Validation errors: NOT retryable (data/logic issues)
   *
   * @param error - The error to classify
   * @returns true if the error is transient and retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Retryable patterns (transient failures)
    const retryablePatterns = [
      'timeout',
      'timed out',
      'network',
      'navigation',
      'net::',
      'econnreset',
      'econnrefused',
      'element not found',
      'waiting for selector',
      'page crashed',
      'context destroyed',
    ];

    // Non-retryable patterns (persistent failures)
    const nonRetryablePatterns = [
      'authentication',
      'login',
      'unauthorized',
      'forbidden',
      'invalid',
      'validation',
      'not logged in',
    ];

    // Check non-retryable first
    if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
      return false;
    }

    // Check if matches retryable pattern
    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  // ===========================================================================
  // Private Methods - Review Pack Generation
  // ===========================================================================

  /**
   * Generate Review Pack from CartBuilder report.
   *
   * Transforms CartDiffReport into user-friendly Review Pack format
   * for display in Control Panel.
   *
   * @param report - CartBuilder diff report
   * @returns Review Pack ready for user approval
   */
  private generateReviewPack(report: CartBuilderWorkerResult['report']): ReviewPack {
    if (!report) {
      throw new Error('Cannot generate Review Pack without CartBuilder report');
    }

    const { cart, diff, warnings, confidence, ordersAnalyzed } = report;

    // Convert cart items to ReviewCartItem format
    const beforeItems = cart.before.items.map(toReviewCartItem);
    const afterItems = cart.after.items.map(toReviewCartItem);

    // Map CartBuilder warnings to ReviewWarnings
    const reviewWarnings = warnings.map((w) => ({
      type: this.mapWarningType(w.type),
      message: w.message,
      severity: 'warning' as const,
      itemName: w.itemName,
      orderId: w.orderId,
    }));

    // Calculate confidence scores
    const cartAccuracy = confidence;
    const dataQuality = warnings.length === 0 ? 1.0 : Math.max(0.5, 1 - warnings.length * 0.1);

    return {
      sessionId: this.session?.sessionId ?? report.sessionId,
      generatedAt: new Date(),
      householdId: this.session?.householdId ?? 'unknown',

      cart: {
        summary: {
          itemCount: cart.after.itemCount,
          totalPrice: cart.after.totalPrice,
          currency: 'EUR',
        },
        diff: {
          added: diff.added.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            sourceOrders: item.sourceOrders,
          })),
          removed: diff.removed.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            sourceOrders: item.sourceOrders,
          })),
          quantityChanged: diff.quantityChanged.map((item) => ({
            name: item.name,
            previousQuantity: item.previousQuantity,
            newQuantity: item.newQuantity,
            unitPrice: item.unitPrice,
            reason: item.reason,
          })),
          summary: diff.summary,
        },
        before: beforeItems,
        after: afterItems,
      },

      warnings: reviewWarnings,
      actions: createDefaultActions(),

      confidence: {
        cartAccuracy,
        dataQuality,
        sourceOrders: ordersAnalyzed,
      },

      // Phase 2+ fields (not populated)
      substitutions: undefined,
      pruning: undefined,
      slots: undefined,
    };
  }

  /**
   * Map CartBuilder warning type to Review warning type.
   */
  private mapWarningType(
    type: 'item_unavailable' | 'price_changed' | 'quantity_adjusted' | 'order_load_partial' | 'reorder_failed'
  ): 'out_of_stock' | 'price_change' | 'data_quality' | 'missing_item' | 'partial_order_load' {
    switch (type) {
      case 'item_unavailable':
        return 'out_of_stock';
      case 'price_changed':
        return 'price_change';
      case 'quantity_adjusted':
        return 'data_quality';
      case 'order_load_partial':
        return 'partial_order_load';
      case 'reorder_failed':
        return 'missing_item';
      default:
        return 'data_quality';
    }
  }
}

/**
 * Create a Coordinator instance with configuration.
 */
export function createCoordinator(config?: Partial<CoordinatorConfig>): Coordinator {
  return new Coordinator(config);
}
