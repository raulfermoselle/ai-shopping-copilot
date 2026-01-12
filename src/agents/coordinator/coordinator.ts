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
  SubstitutionWorkerResult,
  StockPrunerWorkerResult,
  SlotScoutWorkerResult,
  FeedbackStatus,
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
import { Substitution } from '../substitution/substitution.js';
import { StockPruner, type StockPrunerRunInput } from '../stock-pruner/stock-pruner.js';
import { SlotScout } from '../slot-scout/slot-scout.js';
import { createLoginTool, type LoginResult } from '../../tools/login.js';
import type { ToolContext, ToolConfig } from '../../types/tool.js';
import type { CartSnapshot } from '../cart-builder/types.js';
import type { SubstitutionWorkerInput } from '../substitution/types.js';
import type { PurchaseRecord } from '../stock-pruner/types.js';
import type { SlotScoutInput } from '../slot-scout/types.js';
import {
  type FeedbackCollector,
  createFeedbackCollector,
  createFeedbackProcessor,
  type SubmitItemFeedbackInput,
  type SessionFeedback,
  type FeedbackSubmissionResult,
  type FeedbackProcessingResult,
} from './feedback/index.js';

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
   * Executes the Phase 2 orchestration flow:
   * 1. Initialize session
   * 2. Login to Auchan.pt
   * 3. Delegate to CartBuilder (load/merge orders)
   * 4. Delegate to Substitution (if enabled) - check availability, find substitutes
   * 5. Delegate to StockPruner (if enabled) - analyze cart against purchase history
   * 6. Delegate to SlotScout (if enabled) - find delivery slots
   * 7. Generate Review Pack (with all worker results)
   * 8. Return ready-to-review cart
   *
   * SAFETY CONSTRAINT: Coordinator NEVER submits orders - stops at review stage.
   *
   * @param context - Agent execution context
   * @param username - Auchan username (email)
   * @param householdId - Household identifier for preferences
   * @param purchaseHistory - Optional purchase history for StockPruner
   * @returns CoordinatorResult with Review Pack
   */
  async run(
    context: AgentContext,
    username: string,
    householdId: string,
    purchaseHistory?: PurchaseRecord[]
  ): Promise<CoordinatorResult> {
    const { logger, sessionId } = context;
    const logs: string[] = [];
    const startTime = Date.now();

    try {
      // Step 1: Initialize session
      logger.info('Coordinator starting session', {
        sessionId,
        username,
        householdId,
        enableSubstitution: this.config.enableSubstitution,
        enableStockPruning: this.config.enableStockPruning,
        enableSlotScouting: this.config.enableSlotScouting,
      });
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

      // Get cart snapshot for Phase 2 workers
      const cartSnapshot = cartBuilderResult.report.cart.after;

      // Step 4: Delegate to Substitution (if enabled)
      // Non-blocking: failures here don't stop the session
      let substitutionResult: SubstitutionWorkerResult = null;
      if (this.config.enableSubstitution && cartSnapshot.items.length > 0) {
        logger.info('Running Substitution worker');
        substitutionResult = await this.delegateToSubstitution(context, cartSnapshot.items);
        logs.push(
          substitutionResult?.success
            ? `Substitution completed: ${substitutionResult.summary?.unavailableItems ?? 0} unavailable items, ${substitutionResult.summary?.itemsWithSubstitutes ?? 0} with substitutes`
            : `Substitution failed: ${substitutionResult?.errorMessage ?? 'Unknown error'}`
        );
      }

      // Step 5: Delegate to StockPruner (if enabled)
      // Non-blocking: failures here don't stop the session
      let stockPrunerResult: StockPrunerWorkerResult = null;
      if (this.config.enableStockPruning && cartSnapshot.items.length > 0) {
        logger.info('Running StockPruner worker');
        // Use provided purchase history or empty array
        const history = purchaseHistory ?? [];
        stockPrunerResult = await this.delegateToStockPruner(context, cartSnapshot, history);
        logs.push(
          stockPrunerResult?.success
            ? `StockPruner completed: ${stockPrunerResult.summary?.suggestedForPruning ?? 0} items suggested for removal`
            : `StockPruner failed: ${stockPrunerResult?.errorMessage ?? 'Unknown error'}`
        );
      }

      // Step 6: Delegate to SlotScout (if enabled)
      // Non-blocking: failures here don't stop the session
      let slotScoutResult: SlotScoutWorkerResult = null;
      if (this.config.enableSlotScouting) {
        logger.info('Running SlotScout worker');
        slotScoutResult = await this.delegateToSlotScout(context, cartSnapshot.totalPrice);
        logs.push(
          slotScoutResult?.success
            ? `SlotScout completed: ${slotScoutResult.summary?.availableSlots ?? 0} available slots found`
            : `SlotScout failed: ${slotScoutResult?.errorMessage ?? 'Unknown error'}`
        );
      }

      // Step 7: Generate Review Pack with all worker results
      this.updateStatus('generating_review');
      const reviewPack = this.generateReviewPack(
        cartBuilderResult.report,
        substitutionResult,
        stockPrunerResult,
        slotScoutResult
      );
      this.session.reviewPack = reviewPack;
      logs.push('Review Pack generated');

      // Step 8: Mark ready for review
      this.updateStatus('review_ready');
      this.session.endTime = new Date();

      const durationMs = Date.now() - startTime;
      logger.info('Coordinator completed successfully', {
        sessionId,
        durationMs,
        itemCount: reviewPack.cart.summary.itemCount,
        substitutionEnabled: this.config.enableSubstitution,
        stockPruningEnabled: this.config.enableStockPruning,
        slotScoutingEnabled: this.config.enableSlotScouting,
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
   * Delegate to Substitution worker with timeout handling.
   *
   * Checks item availability and finds substitutes for unavailable items.
   * Non-blocking: if this worker fails, the session continues with other workers.
   *
   * @param context - Agent context with page and logger
   * @param cartItems - Items to check availability for
   * @returns Substitution worker result
   */
  private async delegateToSubstitution(
    context: AgentContext,
    cartItems: CartSnapshot['items']
  ): Promise<SubstitutionWorkerResult> {
    const { logger } = context;
    const startTime = Date.now();

    try {
      logger.info('Substitution delegation starting', {
        itemCount: cartItems.length,
        timeout: this.config.sessionTimeout,
      });

      const substitution = new Substitution();

      // Convert cart items to Substitution input format
      const input: SubstitutionWorkerInput = {
        items: cartItems.map((item) => ({
          productId: item.productId,
          name: item.name,
          productUrl: item.productUrl,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };

      // Execute with timeout protection
      const result = await this.executeWithTimeout(
        substitution.run(context, input),
        this.config.sessionTimeout,
        'Substitution execution timed out'
      );

      const durationMs = Date.now() - startTime;

      if (result.success && result.data) {
        const workerResult: SubstitutionWorkerResult = {
          success: true,
          durationMs,
          availabilityResults: result.data.availabilityResults,
          substitutionResults: result.data.substitutionResults,
          summary: result.data.summary,
        };

        if (this.session) {
          this.session.workers.substitution = workerResult;
        }

        logger.info('Substitution completed', {
          summary: result.data.summary,
          durationMs,
        });

        return workerResult;
      } else {
        // Worker returned failure
        const workerResult: SubstitutionWorkerResult = {
          success: false,
          durationMs,
          errorMessage: result.error?.message ?? 'Substitution failed',
        };

        if (this.session) {
          this.session.workers.substitution = workerResult;
          this.recordError(
            createError(
              'SUBSTITUTION_FAILED',
              workerResult.errorMessage ?? 'Substitution failed',
              'warning',
              'substitution'
            )
          );
        }

        return workerResult;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = Date.now() - startTime;

      logger.warn('Substitution exception (non-blocking)', { error: err.message });

      const workerResult: SubstitutionWorkerResult = {
        success: false,
        durationMs,
        errorMessage: err.message,
      };

      if (this.session) {
        this.session.workers.substitution = workerResult;
        this.recordError(
          createError('SUBSTITUTION_EXCEPTION', err.message, 'warning', 'substitution')
        );
      }

      return workerResult;
    }
  }

  /**
   * Delegate to StockPruner worker with timeout handling.
   *
   * Analyzes cart items against purchase history to suggest items
   * that may not need reordering. Non-blocking: if this worker fails,
   * the session continues with other workers.
   *
   * @param context - Agent context with page and logger
   * @param cart - Current cart snapshot
   * @param purchaseHistory - Historical purchase records
   * @returns StockPruner worker result
   */
  private async delegateToStockPruner(
    context: AgentContext,
    cart: CartSnapshot,
    purchaseHistory: PurchaseRecord[]
  ): Promise<StockPrunerWorkerResult> {
    const { logger } = context;
    const startTime = Date.now();

    try {
      logger.info('StockPruner delegation starting', {
        cartItemCount: cart.itemCount,
        historyRecordCount: purchaseHistory.length,
        timeout: this.config.sessionTimeout,
      });

      const stockPruner = new StockPruner();

      const input: StockPrunerRunInput = {
        cart,
        purchaseHistory,
      };

      // Execute with timeout protection
      const result = await this.executeWithTimeout(
        stockPruner.run(context, input),
        this.config.sessionTimeout,
        'StockPruner execution timed out'
      );

      const durationMs = Date.now() - startTime;

      if (result.success && result.data) {
        const workerResult: StockPrunerWorkerResult = {
          success: true,
          durationMs,
          report: result.data.report,
          recommendedRemovals: result.data.recommendedRemovals,
          uncertainItems: result.data.uncertainItems,
          summary: {
            totalItems: result.data.report.itemsAnalyzed,
            suggestedForPruning: result.data.report.itemsSuggestedForPruning,
            keepInCart: result.data.keepItems.length,
            lowConfidenceDecisions: result.data.uncertainItems.length,
          },
        };

        if (this.session) {
          this.session.workers.stockPruner = workerResult;
        }

        logger.info('StockPruner completed', {
          summary: workerResult.summary,
          durationMs,
        });

        return workerResult;
      } else {
        // Worker returned failure
        const workerResult: StockPrunerWorkerResult = {
          success: false,
          durationMs,
          errorMessage: result.error?.message ?? 'StockPruner failed',
        };

        if (this.session) {
          this.session.workers.stockPruner = workerResult;
          this.recordError(
            createError(
              'STOCK_PRUNER_FAILED',
              workerResult.errorMessage ?? 'StockPruner failed',
              'warning',
              'stock_pruner'
            )
          );
        }

        return workerResult;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = Date.now() - startTime;

      logger.warn('StockPruner exception (non-blocking)', { error: err.message });

      const workerResult: StockPrunerWorkerResult = {
        success: false,
        durationMs,
        errorMessage: err.message,
      };

      if (this.session) {
        this.session.workers.stockPruner = workerResult;
        this.recordError(
          createError('STOCK_PRUNER_EXCEPTION', err.message, 'warning', 'stock_pruner')
        );
      }

      return workerResult;
    }
  }

  /**
   * Delegate to SlotScout worker with timeout handling.
   *
   * Navigates to delivery slot selection and extracts available slots.
   * Non-blocking: if this worker fails, the session continues with other workers.
   *
   * SAFETY: SlotScout always returns to cart after scouting - never completes checkout.
   *
   * @param context - Agent context with page and logger
   * @param cartTotal - Current cart total for free delivery threshold checks
   * @returns SlotScout worker result
   */
  private async delegateToSlotScout(
    context: AgentContext,
    cartTotal?: number
  ): Promise<SlotScoutWorkerResult> {
    const { logger } = context;
    const startTime = Date.now();

    try {
      logger.info('SlotScout delegation starting', {
        cartTotal,
        timeout: this.config.sessionTimeout,
      });

      const slotScout = new SlotScout();

      const input: SlotScoutInput = {};
      if (cartTotal !== undefined) {
        input.cartTotal = cartTotal;
      }

      // Execute with timeout protection
      const result = await this.executeWithTimeout(
        slotScout.run(context, input),
        this.config.sessionTimeout,
        'SlotScout execution timed out'
      );

      const durationMs = Date.now() - startTime;

      if (result.success && result.data) {
        const workerResult: SlotScoutWorkerResult = {
          success: true,
          durationMs,
          slotsByDay: result.data.slotsByDay,
          rankedSlots: result.data.rankedSlots,
          summary: result.data.summary,
          minimumOrder: result.data.minimumOrder,
        };

        if (this.session) {
          this.session.workers.slotScout = workerResult;
        }

        logger.info('SlotScout completed', {
          summary: result.data.summary,
          durationMs,
        });

        return workerResult;
      } else {
        // Worker returned failure
        const workerResult: SlotScoutWorkerResult = {
          success: false,
          durationMs,
          errorMessage: result.error?.message ?? 'SlotScout failed',
        };

        if (this.session) {
          this.session.workers.slotScout = workerResult;
          this.recordError(
            createError(
              'SLOT_SCOUT_FAILED',
              workerResult.errorMessage ?? 'SlotScout failed',
              'warning',
              'slot_scout'
            )
          );
        }

        return workerResult;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const durationMs = Date.now() - startTime;

      logger.warn('SlotScout exception (non-blocking)', { error: err.message });

      const workerResult: SlotScoutWorkerResult = {
        success: false,
        durationMs,
        errorMessage: err.message,
      };

      if (this.session) {
        this.session.workers.slotScout = workerResult;
        this.recordError(
          createError('SLOT_SCOUT_EXCEPTION', err.message, 'warning', 'slot_scout')
        );
      }

      return workerResult;
    }
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
   * Generate Review Pack from all worker results.
   *
   * Transforms CartDiffReport and Phase 2 worker results into user-friendly
   * Review Pack format for display in Control Panel.
   *
   * @param report - CartBuilder diff report
   * @param substitutionResult - Substitution worker result (optional)
   * @param stockPrunerResult - StockPruner worker result (optional)
   * @param slotScoutResult - SlotScout worker result (optional)
   * @returns Review Pack ready for user approval
   */
  private generateReviewPack(
    report: CartBuilderWorkerResult['report'],
    substitutionResult?: SubstitutionWorkerResult,
    stockPrunerResult?: StockPrunerWorkerResult,
    slotScoutResult?: SlotScoutWorkerResult
  ): ReviewPack {
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

    // Build Phase 2 sections if results are available
    const substitutions = this.buildSubstitutionsSection(substitutionResult);
    const pruning = this.buildPruningSection(stockPrunerResult);
    const slots = this.buildSlotsSection(slotScoutResult);

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

      // Phase 2 fields - populated if workers ran successfully
      substitutions,
      pruning,
      slots,
    };
  }

  /**
   * Build substitutions section for Review Pack from Substitution worker result.
   */
  private buildSubstitutionsSection(
    result: SubstitutionWorkerResult | undefined
  ): ReviewPack['substitutions'] {
    if (!result?.success || !result.summary) {
      return undefined;
    }

    return {
      availabilityResults: result.availabilityResults ?? [],
      substitutionResults: result.substitutionResults ?? [],
      summary: result.summary,
    };
  }

  /**
   * Build pruning section for Review Pack from StockPruner worker result.
   */
  private buildPruningSection(
    result: StockPrunerWorkerResult | undefined
  ): ReviewPack['pruning'] {
    if (!result?.success || !result.summary) {
      return undefined;
    }

    return {
      recommendedRemovals: result.recommendedRemovals ?? [],
      uncertainItems: result.uncertainItems ?? [],
      summary: {
        totalItems: result.summary.totalItems,
        suggestedForPruning: result.summary.suggestedForPruning,
        keepInCart: result.summary.keepInCart,
      },
      overallConfidence: result.report?.overallConfidence ?? 0.5,
    };
  }

  /**
   * Build slots section for Review Pack from SlotScout worker result.
   */
  private buildSlotsSection(
    result: SlotScoutWorkerResult | undefined
  ): ReviewPack['slots'] {
    if (!result?.success || !result.summary) {
      return undefined;
    }

    const slotsSection: NonNullable<ReviewPack['slots']> = {
      slotsByDay: result.slotsByDay ?? [],
      rankedSlots: result.rankedSlots ?? [],
      summary: result.summary,
    };

    if (result.minimumOrder !== undefined) {
      slotsSection.minimumOrder = result.minimumOrder;
    }

    return slotsSection;
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

  // ===========================================================================
  // Phase 3: Feedback Methods
  // ===========================================================================

  /**
   * Create a feedback collector for the current session.
   * Should be called after the session reaches review_ready or completed state.
   *
   * IMPORTANT: This method enforces the "zero questioning during run" principle.
   * Feedback can only be collected after the run completes.
   *
   * @returns FeedbackCollector instance configured for this session
   */
  createFeedbackCollector(): FeedbackCollector | null {
    if (!this.session) {
      return null;
    }

    // Enforce post-run feedback principle
    if (this.session.status !== 'review_ready' && this.session.status !== 'completed') {
      return null;
    }

    const collector = createFeedbackCollector({
      householdId: this.session.householdId,
    });

    // Set the active session for context
    collector.setActiveSession(this.session);

    return collector;
  }

  /**
   * Submit feedback for an item in the current session.
   *
   * @param input - Item feedback input
   * @returns Submission result
   */
  async submitFeedback(input: SubmitItemFeedbackInput): Promise<FeedbackSubmissionResult> {
    if (!this.session) {
      return {
        success: false,
        error: 'No active session',
      };
    }

    // Enforce post-run feedback principle
    if (this.session.status !== 'review_ready' && this.session.status !== 'completed') {
      return {
        success: false,
        error: 'Feedback can only be submitted after the run completes',
      };
    }

    const collector = createFeedbackCollector({
      householdId: this.session.householdId,
    });
    collector.setActiveSession(this.session);

    const result = await collector.submitItemFeedback({
      ...input,
      sessionId: this.session.sessionId,
    });

    // Update session feedback summary
    if (result.success) {
      this.updateFeedbackSummary();
    }

    return result;
  }

  /**
   * Get feedback for the current session.
   *
   * @returns Session feedback or null
   */
  async getFeedback(): Promise<SessionFeedback | null> {
    if (!this.session) {
      return null;
    }

    const collector = createFeedbackCollector({
      householdId: this.session.householdId,
    });

    return collector.getFeedback(this.session.sessionId);
  }

  /**
   * Process pending feedback and apply learning actions.
   * Processes all unprocessed feedback for the household.
   *
   * @param autoApply - Whether to automatically apply learning actions
   * @returns Processing result
   */
  async processPendingFeedback(autoApply: boolean = true): Promise<FeedbackProcessingResult> {
    if (!this.session) {
      return {
        success: false,
        processedCount: 0,
        actionsGenerated: 0,
        actionsApplied: 0,
        errors: ['No active session'],
      };
    }

    const processor = createFeedbackProcessor({
      householdId: this.session.householdId,
      autoApply,
    });

    const result = await processor.processPendingFeedback();

    // Update feedback status in session
    if (result.success && result.processedCount > 0) {
      this.updateFeedbackStatus('processed');
    }

    return result;
  }

  /**
   * Start feedback collection for the current session.
   * Updates the session feedback status to 'collecting'.
   */
  startFeedbackCollection(): void {
    if (this.session && this.isReadyForFeedback()) {
      this.updateFeedbackStatus('collecting');
    }
  }

  /**
   * Complete feedback collection for the current session.
   * Marks the session as ready for feedback processing.
   */
  async completeFeedbackCollection(): Promise<void> {
    if (!this.session) {
      return;
    }

    const collector = createFeedbackCollector({
      householdId: this.session.householdId,
    });

    await collector.completeFeedbackCollection(this.session.sessionId);
    this.updateFeedbackStatus('collected');
    this.updateFeedbackSummary();
  }

  /**
   * Skip feedback collection for the current session.
   */
  skipFeedbackCollection(): void {
    if (this.session) {
      this.updateFeedbackStatus('skipped');
    }
  }

  /**
   * Check if the session is ready for feedback collection.
   */
  isReadyForFeedback(): boolean {
    return this.session?.status === 'review_ready' || this.session?.status === 'completed';
  }

  /**
   * Get available items for feedback from the review pack.
   * Returns items that can receive feedback with their decision types.
   */
  getAvailableFeedbackItems(): Array<{
    productName: string;
    decisionType: string;
    productId?: string;
  }> {
    const collector = this.createFeedbackCollector();
    if (!collector) {
      return [];
    }
    return collector.getAvailableFeedbackItems();
  }

  // ===========================================================================
  // Private Methods - Feedback Helpers
  // ===========================================================================

  /**
   * Update the feedback status in the session.
   */
  private updateFeedbackStatus(status: FeedbackStatus): void {
    if (this.session?.feedback) {
      this.session.feedback.status = status;
      this.session.feedback.lastUpdated = new Date();
    }
  }

  /**
   * Update the feedback summary in the session.
   */
  private async updateFeedbackSummary(): Promise<void> {
    if (!this.session) {
      return;
    }

    const sessionFeedback = await this.getFeedback();
    if (!sessionFeedback || !this.session.feedback) {
      return;
    }

    const summary = sessionFeedback.summary;
    if (summary) {
      this.session.feedback.itemsReviewed = summary.totalItemsReviewed;
      this.session.feedback.positiveCount = summary.goodFeedbackCount;
      this.session.feedback.negativeCount =
        summary.removeNextTimeCount +
        summary.wrongSubstitutionCount +
        summary.ranOutEarlyCount;
    }

    this.session.feedback.overallRating = sessionFeedback.overallRating;
    this.session.feedback.cartApproved = sessionFeedback.cartApproved;
    this.session.feedback.lastUpdated = new Date();
  }
}

/**
 * Create a Coordinator instance with configuration.
 */
export function createCoordinator(config?: Partial<CoordinatorConfig>): Coordinator {
  return new Coordinator(config);
}
