/**
 * Run Orchestrator
 *
 * Coordinates the shopping session phases using the state machine.
 * Handles phase execution from initializing through cart, substitution,
 * slots, and finalizing.
 *
 * SAFETY CONSTRAINT (ADR-007):
 * - NO checkout/purchase states exist
 * - 'review' state is terminal for automation
 * - User must manually proceed with checkout in the browser
 *
 * @module
 */

import type { IStoragePort } from '../../ports/storage.js';
import type { IMessagingPort } from '../../ports/messaging.js';
import type { ITabsPort } from '../../ports/tabs.js';
import type { ILLMPort } from '../../ports/llm.js';
import type {
  StateMachine,
  RunPhase,
  RunError,
  CartPhaseStep,
  SubstitutionPhaseStep,
  SlotsPhaseStep,
} from './types.js';
import type { LoginState } from '../../types/state.js';
import type { CartItem, CartDiff, SubstitutionProposal, ProductInfo } from '../../types/cart.js';
import type { OrderSummary } from '../../types/orders.js';
import type { DeliverySlot, ScoredSlot, SlotRecommendation } from '../../types/slots.js';
import type {
  ExtensionResponse,
  CartScanResponse,
  OrderExtractHistoryResponse,
  SlotsExtractResponse,
  LoginCheckResponse,
} from '../../types/messages.js';
import { createRequest, ERROR_CODES } from '../../types/messages.js';
import { logger } from '../../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies injected into the orchestrator
 */
export interface OrchestratorDeps {
  storage: IStoragePort;
  messaging: IMessagingPort;
  tabs: ITabsPort;
  llm: ILLMPort;
  stateMachine: StateMachine;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Timeout for phase execution in ms (default: 120000) */
  phaseTimeoutMs: number;
  /** Timeout for individual operations in ms (default: 30000) */
  operationTimeoutMs: number;
  /** Maximum retries for recoverable errors (default: 3) */
  maxRetries: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  phaseTimeoutMs: 120000,
  operationTimeoutMs: 30000,
  maxRetries: 3,
  debug: false,
};

/**
 * Run context - accumulated data during a run
 */
export interface RunContext {
  /** Tab ID where run is executing */
  tabId: number;
  /** Order selected for reorder */
  selectedOrder: OrderSummary | null;
  /** Loaded order history */
  orderHistory: OrderSummary[];
  /** Current cart items */
  cartItems: CartItem[];
  /** Cart diff (original vs current) */
  cartDiff: CartDiff | null;
  /** Unavailable items that need substitution */
  unavailableItems: CartItem[];
  /** Substitution proposals */
  substitutions: SubstitutionProposal[];
  /** Extracted delivery slots */
  deliverySlots: DeliverySlot[];
  /** Slot recommendation */
  slotRecommendation: SlotRecommendation | null;
}

/**
 * Review pack - final output for user review
 */
export interface ReviewPack {
  /** Run ID */
  runId: string;
  /** Original order (if any) */
  originalOrder: OrderSummary | null;
  /** Current cart state */
  cartItems: CartItem[];
  /** Cart diff summary */
  cartDiff: CartDiff | null;
  /** Substitution proposals */
  substitutions: SubstitutionProposal[];
  /** Slot recommendations */
  slotRecommendation: SlotRecommendation | null;
  /** Run statistics */
  stats: {
    totalItems: number;
    unavailableItems: number;
    substitutesProposed: number;
    slotsFound: number;
    executionTimeMs: number;
  };
  /** Timestamp when pack was generated */
  generatedAt: number;
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Create a RunError from an exception
 */
function createRunError(
  code: string,
  message: string,
  phase: RunPhase,
  recoverable: boolean,
  retryCount: number = 0
): RunError {
  return {
    code,
    message,
    phase,
    recoverable,
    timestamp: Date.now(),
    retryCount,
  };
}

/**
 * Transient error codes that are retryable
 */
const TRANSIENT_ERROR_CODES: string[] = [
  ERROR_CODES.TIMEOUT,
  ERROR_CODES.NETWORK_ERROR,
  ERROR_CODES.PAGE_NOT_READY,
];

/**
 * Check if an error is transient (retryable)
 */
function isTransientError(code: string): boolean {
  return TRANSIENT_ERROR_CODES.includes(code);
}

// =============================================================================
// Run Orchestrator Class
// =============================================================================

/**
 * RunOrchestrator - Coordinates shopping session phases
 *
 * Phase flow:
 * 1. initializing: Check login, setup
 * 2. cart: Load orders, reorder, scan cart, compute diff
 * 3. substitution: Find substitutes for unavailable items
 * 4. slots: Extract and score delivery slots
 * 5. finalizing: Prepare review pack
 *
 * After finalizing, the state machine transitions to 'review'
 * where the user must approve before manual checkout.
 */
export class RunOrchestrator {
  private deps: OrchestratorDeps;
  private config: OrchestratorConfig;
  private context: RunContext | null = null;
  private abortController: AbortController | null = null;

  constructor(
    deps: OrchestratorDeps,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.deps = deps;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Start a new shopping run
   *
   * @param tabId - Tab ID where Auchan.pt is open
   * @param orderId - Optional specific order ID to reorder
   */
  async startRun(tabId: number, orderId?: string): Promise<void> {
    const { stateMachine } = this.deps;

    // Validate we're in idle state
    const currentState = stateMachine.getState();
    if (currentState.status !== 'idle') {
      throw new Error(`Cannot start run: current status is '${currentState.status}'`);
    }

    // Initialize context
    this.context = this.createEmptyContext(tabId);
    this.abortController = new AbortController();

    // Start the run via state machine
    // Note: Only include orderId in payload if it's defined (exactOptionalPropertyTypes)
    const startPayload: { tabId: number; orderId?: string } = { tabId };
    if (orderId !== undefined) {
      startPayload.orderId = orderId;
    }
    stateMachine.dispatch({
      type: 'START_RUN',
      payload: startPayload,
    });

    // Execute phases sequentially
    try {
      await this.executeRunLoop();
    } catch (error) {
      this.handleFatalError(error);
    }
  }

  /**
   * Pause the current run
   */
  pauseRun(): void {
    const { stateMachine } = this.deps;
    stateMachine.dispatch({ type: 'PAUSE_RUN' });
    this.abortController?.abort();
  }

  /**
   * Resume a paused run
   */
  async resumeRun(): Promise<void> {
    const { stateMachine } = this.deps;
    const state = stateMachine.getState();

    if (state.status !== 'paused') {
      throw new Error(`Cannot resume: current status is '${state.status}'`);
    }

    // Resume via state machine
    stateMachine.dispatch({ type: 'RESUME_RUN' });

    // Create new abort controller
    this.abortController = new AbortController();

    // Continue execution from current phase
    try {
      await this.executeRunLoop();
    } catch (error) {
      this.handleFatalError(error);
    }
  }

  /**
   * Cancel the current run
   */
  cancelRun(): void {
    const { stateMachine } = this.deps;
    stateMachine.dispatch({ type: 'CANCEL_RUN' });
    this.abortController?.abort();
    this.context = null;
  }

  /**
   * Get the current run context (for testing/debugging)
   */
  getContext(): RunContext | null {
    return this.context;
  }

  /**
   * Get the generated review pack (only valid in review state)
   */
  async getReviewPack(): Promise<ReviewPack | null> {
    const { stateMachine, storage } = this.deps;
    const state = stateMachine.getState();

    if (state.status !== 'review') {
      return null;
    }

    // Try to load from storage
    const stored = await storage.get<{ reviewPack: ReviewPack }>(['reviewPack'], 'session');
    return stored.reviewPack ?? null;
  }

  // ===========================================================================
  // Run Loop
  // ===========================================================================

  /**
   * Main execution loop - executes phases in sequence
   */
  private async executeRunLoop(): Promise<void> {
    const { stateMachine } = this.deps;

    while (true) {
      const state = stateMachine.getState();

      // Check for abort
      if (this.abortController?.signal.aborted) {
        this.log('Run aborted');
        return;
      }

      // Check if we're still running
      if (state.status !== 'running') {
        this.log(`Run loop exiting: status is '${state.status}'`);
        return;
      }

      // Execute current phase
      const phase = state.phase;
      this.log(`Executing phase: ${phase}`);

      try {
        await this.executePhase(phase);

        // Phase completed successfully - dispatch completion
        stateMachine.dispatch({
          type: 'PHASE_COMPLETE',
          payload: { phase },
        });

        // Check if we transitioned to review (finalizing complete)
        const newState = stateMachine.getState();
        if (newState.status === 'review') {
          this.log('Run complete - awaiting user review');
          return;
        }
      } catch (error) {
        // Handle phase error
        const runError = this.createErrorFromException(error, phase);

        if (runError.recoverable && state.errorCount < this.config.maxRetries) {
          // Recoverable error - pause and let user retry
          stateMachine.dispatch({
            type: 'ERROR_OCCURRED',
            payload: { error: runError },
          });
          this.log(`Recoverable error in phase ${phase}: ${runError.message}`);
          return;
        } else {
          // Fatal error - pause with non-recoverable flag
          stateMachine.dispatch({
            type: 'ERROR_OCCURRED',
            payload: {
              error: { ...runError, recoverable: false },
            },
          });
          this.log(`Fatal error in phase ${phase}: ${runError.message}`);
          return;
        }
      }
    }
  }

  /**
   * Execute a specific phase
   */
  private async executePhase(phase: RunPhase): Promise<void> {
    switch (phase) {
      case 'initializing':
        await this.executeInitializingPhase();
        break;
      case 'cart':
        await this.executeCartPhase();
        break;
      case 'substitution':
        await this.executeSubstitutionPhase();
        break;
      case 'slots':
        await this.executeSlotsPhase();
        break;
      case 'finalizing':
        await this.executeFinalizingPhase();
        break;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  // ===========================================================================
  // Phase: Initializing
  // ===========================================================================

  /**
   * Initializing phase: Check login, validate tab
   */
  private async executeInitializingPhase(): Promise<void> {
    const { tabs } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Verify tab exists and is on Auchan.pt
    const tabInfo = await tabs.get(this.context.tabId);
    if (!tabInfo) {
      throw new Error('Target tab not found');
    }

    if (!tabInfo.url?.includes('auchan.pt')) {
      throw new Error('Tab is not on Auchan.pt');
    }

    // Wait for page to be fully loaded
    if (tabInfo.loading) {
      await tabs.waitForLoad(this.context.tabId, this.config.operationTimeoutMs);
    }

    // Check login status via content script
    const loginResponse = await this.sendToTab<LoginCheckResponse>(
      this.context.tabId,
      'login.check'
    );

    if (!loginResponse.success || !loginResponse.data?.isLoggedIn) {
      throw new Error('User is not logged in to Auchan.pt. Please log in manually and try again.');
    }

    // Store login state
    const loginState: LoginState = {
      isLoggedIn: true,
      userName: loginResponse.data.userName ?? null,
      loginTimestamp: Date.now(),
      detectedOnUrl: tabInfo.url ?? null,
    };

    await this.deps.storage.set({ loginState }, 'session');

    this.log(`Initialized - User logged in as: ${loginState.userName ?? 'Unknown'}`);
  }

  // ===========================================================================
  // Phase: Cart
  // ===========================================================================

  /**
   * Cart phase: Load orders, merge last 3 orders, scan cart
   *
   * Multi-order merge flow:
   * 1. Load order history
   * 2. Take last 3 orders, sort oldest-to-newest
   * 3. Reorder each: first with 'replace', rest with 'merge'
   * 4. Scan final cart
   * 5. Compute diff for unavailable items
   */
  private async executeCartPhase(): Promise<void> {
    const { stateMachine } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Step 1: Load order history
    this.updateStep('loading-orders');
    const allOrders = await this.loadOrderHistory();

    // Take up to 3 orders for merging
    const ordersToMerge = allOrders.slice(0, 3);
    this.context.orderHistory = ordersToMerge;

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        ordersLoaded: ordersToMerge.length,
        ordersTotal: ordersToMerge.length,
      },
    });

    // Step 2: Sort orders oldest-to-newest for merge sequence
    this.updateStep('selecting-order');
    const sortedOrders = [...ordersToMerge].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB; // Oldest first
    });

    // Store the most recent order as the "selected" order (for reference)
    this.context.selectedOrder = ordersToMerge[0] ?? null;

    if (sortedOrders.length === 0) {
      this.log('No orders found - proceeding with current cart');
    } else {
      // Step 3: Reorder each order in sequence
      // First order uses 'replace' mode (starts fresh cart)
      // Subsequent orders use 'merge' mode (adds to existing cart)
      for (let i = 0; i < sortedOrders.length; i++) {
        const order = sortedOrders[i]!;
        const mode = i === 0 ? 'replace' : 'merge';

        this.updateStep('reordering');
        stateMachine.dispatch({
          type: 'PROGRESS_UPDATE',
          payload: {
            itemsProcessed: i + 1,
            itemsTotal: sortedOrders.length,
          },
        });

        this.log(`Merging order ${i + 1}/${sortedOrders.length} (${order.orderId}) with mode: ${mode}`);
        await this.reorderOrder(order, mode);
      }
    }

    // Step 4: Scan current cart
    this.updateStep('scanning-cart');
    const cartItems = await this.scanCart();
    this.context.cartItems = cartItems;

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        itemsTotal: cartItems.length,
      },
    });

    // Step 5: Compute cart diff
    this.updateStep('comparing');
    const unavailable = cartItems.filter((item) => item.availability === 'out-of-stock');
    this.context.unavailableItems = unavailable;

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        unavailableItems: unavailable.length,
      },
    });

    this.log(`Cart phase complete: ${sortedOrders.length} orders merged, ${cartItems.length} items, ${unavailable.length} unavailable`);
  }

  /**
   * Load order history from content script
   */
  private async loadOrderHistory(): Promise<OrderSummary[]> {
    const { tabs } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Navigate to order history page
    await tabs.update(this.context.tabId, {
      url: 'https://www.auchan.pt/pt/historico-encomendas',
    });
    await tabs.waitForLoad(this.context.tabId, this.config.operationTimeoutMs);

    // Extract orders via content script
    const response = await this.sendToTab<OrderExtractHistoryResponse>(
      this.context.tabId,
      'order.extractHistory',
      { limit: 10 }
    );

    if (!response.success) {
      throw new Error(`Failed to load orders: ${response.error?.message ?? 'Unknown error'}`);
    }

    return response.data?.orders ?? [];
  }

  /**
   * Reorder a specific order
   *
   * IMPORTANT: Must navigate to order DETAIL page before reorder.
   * The reorder button only exists on detail pages, not the order list.
   *
   * @param order - The order to reorder (must have detailUrl)
   * @param mode - 'replace' clears cart first, 'merge' adds to existing cart
   */
  private async reorderOrder(order: OrderSummary, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
    const { tabs } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // CRITICAL: Navigate to order DETAIL page first
    // The reorder button ("Encomendar de novo") only exists on order detail pages,
    // NOT on the order history list page
    const detailUrl = order.detailUrl;
    if (!detailUrl) {
      this.log(`Order ${order.orderId} has no detailUrl - cannot navigate to detail page`);
      return;
    }
    this.log(`Navigating to order detail page`, { orderId: order.orderId, detailUrl });

    await tabs.update(this.context.tabId, { url: detailUrl });
    await tabs.waitForLoad(this.context.tabId, this.config.operationTimeoutMs);

    // Give the page time to fully render (including any popups)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Send reorder request to content script
    let response = await this.sendToTab<ExtensionResponse<{ clicked?: boolean; expanded?: boolean }>>(
      this.context.tabId,
      'order.reorder',
      { orderId: order.orderId, mode }
    );

    // If order was expanded (clicked to view details), wait and retry
    if (response.success && response.data?.expanded && !response.data?.clicked) {
      this.log(`Order ${order.orderId} expanded, waiting for detail page...`);

      // Wait for the page to load (either detail page or same page with expanded content)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Re-inject content script in case we navigated
      try {
        await this.injectContentScript();
      } catch {
        // Ignore injection errors
      }

      // Retry the reorder
      response = await this.sendToTab<ExtensionResponse<{ clicked?: boolean; expanded?: boolean }>>(
        this.context.tabId,
        'order.reorder',
        { orderId: order.orderId, mode }
      );
    }

    if (!response.success) {
      // Reorder might fail if items are unavailable - this is not fatal
      this.log(`Reorder warning: ${response.error?.message}`);
      return; // Don't wait for cart if reorder failed
    }

    if (!response.data?.clicked) {
      this.log(`Reorder did not click button for ${order.orderId}`);
      return;
    }

    // Wait for cart page to load after reorder (modal click triggers redirect)
    // Use a longer timeout since modal animation and redirect take time
    try {
      await tabs.waitForUrl(
        this.context.tabId,
        /cart/,
        this.config.operationTimeoutMs
      );
    } catch {
      // Cart redirect might not happen immediately (especially for merge mode)
      // We'll verify cart state in the scan step
      this.log(`Did not redirect to cart after reorder (may be normal for merge mode)`);
    }
  }

  /**
   * Inject content script into current tab
   */
  private async injectContentScript(): Promise<void> {
    if (!this.context) return;

    await chrome.scripting.executeScript({
      target: { tabId: this.context.tabId },
      files: ['dist/content-script.js'],
    });
  }

  /**
   * Scan current cart contents
   */
  private async scanCart(): Promise<CartItem[]> {
    const { tabs } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Navigate to cart if not already there
    const tabInfo = await tabs.get(this.context.tabId);
    if (!tabInfo?.url?.includes('/cart')) {
      await tabs.update(this.context.tabId, {
        url: 'https://www.auchan.pt/pt/cart',
      });
      await tabs.waitForLoad(this.context.tabId, this.config.operationTimeoutMs);
    }

    // Extract cart items via content script
    const response = await this.sendToTab<CartScanResponse>(
      this.context.tabId,
      'cart.scan',
      { includeOutOfStock: true }
    );

    if (!response.success) {
      throw new Error(`Failed to scan cart: ${response.error?.message ?? 'Unknown error'}`);
    }

    return response.data?.items ?? [];
  }

  // ===========================================================================
  // Phase: Substitution
  // ===========================================================================

  /**
   * Substitution phase: Find substitutes for unavailable items
   */
  private async executeSubstitutionPhase(): Promise<void> {
    const { stateMachine, llm } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    const unavailable = this.context.unavailableItems;

    if (unavailable.length === 0) {
      this.log('No unavailable items - skipping substitution phase');
      return;
    }

    // Check if LLM is available for enhanced substitution
    const llmAvailable = await llm.isAvailable();

    // Step 1: Identify items needing substitution
    this.updateStep('identifying');

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        itemsTotal: unavailable.length,
        itemsProcessed: 0,
      },
    });

    const substitutions: SubstitutionProposal[] = [];

    // Process each unavailable item
    for (let i = 0; i < unavailable.length; i++) {
      const item = unavailable[i]!;

      // Update progress
      stateMachine.dispatch({
        type: 'PROGRESS_UPDATE',
        payload: { itemsProcessed: i + 1 },
      });

      // Step 2: Search for substitutes
      this.updateStep('searching');
      const candidates = await this.searchSubstitutes(item);

      if (candidates.length === 0) {
        this.log(`No substitutes found for: ${item.name}`);
        continue;
      }

      // Step 3: Score candidates
      this.updateStep('scoring');
      const scored = this.scoreSubstitutes(item, candidates);

      // Step 4: Create proposal (optionally with LLM explanation)
      this.updateStep('proposing');
      const bestCandidate = scored[0];

      if (bestCandidate) {
        let llmExplanation: string | undefined;

        if (llmAvailable) {
          try {
            llmExplanation = await this.getLLMExplanation(item, bestCandidate);
          } catch (error) {
            // LLM failure is not fatal - continue without explanation
            this.log(`LLM explanation failed: ${error}`);
          }
        }

        // Build proposal (handle exactOptionalPropertyTypes)
        const proposal: SubstitutionProposal = {
          originalItem: item,
          substitute: bestCandidate.product,
          score: bestCandidate.score,
          scoreBreakdown: bestCandidate.breakdown,
          reason: bestCandidate.reason,
          userAction: 'pending',
        };
        if (llmExplanation !== undefined) {
          proposal.llmExplanation = llmExplanation;
        }
        substitutions.push(proposal);
      }
    }

    this.context.substitutions = substitutions;

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        substitutesProposed: substitutions.length,
      },
    });

    this.log(`Substitution phase complete: ${substitutions.length} proposals`);
  }

  /**
   * Search for substitute products
   */
  private async searchSubstitutes(item: CartItem): Promise<ProductInfo[]> {
    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Use item name as search query
    const query = item.brand
      ? `${item.brand} ${item.name.replace(item.brand, '').trim()}`
      : item.name;

    const response = await this.sendToTab(
      this.context.tabId,
      'search.products',
      { query, maxResults: 10 }
    ) as ExtensionResponse<{ products: ProductInfo[] }>;

    if (!response.success) {
      return [];
    }

    // Filter out unavailable products
    return (response.data?.products ?? []).filter(
      (p) => p.availability === 'available' || p.availability === 'low-stock'
    );
  }

  /**
   * Score substitute candidates
   */
  private scoreSubstitutes(
    original: CartItem,
    candidates: ProductInfo[]
  ): Array<{
    product: ProductInfo;
    score: number;
    breakdown: SubstitutionProposal['scoreBreakdown'];
    reason: string;
  }> {
    return candidates
      .map((candidate) => {
        // Price score: closer to original is better
        const priceDiff = Math.abs(candidate.price - original.price) / original.price;
        const priceScore = Math.max(0, 1 - priceDiff);

        // Brand score: same brand is best
        const brandScore =
          original.brand && candidate.brand?.toLowerCase() === original.brand.toLowerCase()
            ? 1
            : 0.5;

        // Category score: same category is best
        const categoryScore =
          original.category &&
          candidate.categoryPath?.some((c) =>
            c.toLowerCase().includes(original.category!.toLowerCase())
          )
            ? 1
            : 0.6;

        // Rating score: higher is better
        const ratingScore = candidate.rating ? candidate.rating / 5 : 0.5;

        // Overall score (weighted average)
        const score =
          priceScore * 0.35 +
          brandScore * 0.25 +
          categoryScore * 0.25 +
          ratingScore * 0.15;

        // Generate reason
        const reasons: string[] = [];
        if (brandScore === 1) reasons.push('Same brand');
        if (priceScore > 0.9) reasons.push('Similar price');
        if (candidate.rating && candidate.rating >= 4) reasons.push(`${candidate.rating} stars`);

        return {
          product: candidate,
          score,
          breakdown: {
            priceScore,
            brandScore,
            categoryScore,
            ratingScore,
          },
          reason: reasons.join(', ') || 'Best available match',
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get LLM explanation for a substitution
   */
  private async getLLMExplanation(
    original: CartItem,
    substitute: { product: ProductInfo; score: number; reason: string }
  ): Promise<string> {
    const { llm } = this.deps;

    const response = await llm.complete(
      [
        {
          role: 'user',
          content: `The item "${original.name}" (${original.brand ?? 'no brand'}, ${original.price.toFixed(2)} EUR) is unavailable.

I'm proposing "${substitute.product.name}" (${substitute.product.brand ?? 'no brand'}, ${substitute.product.price.toFixed(2)} EUR) as a substitute.

In 1-2 sentences, explain why this is a good substitute or any concerns the shopper should know about.`,
        },
      ],
      {
        systemPrompt:
          'You are helping with grocery shopping. Be concise and practical.',
        maxTokens: 150,
        temperature: 0.3,
      }
    );

    return response.content;
  }

  // ===========================================================================
  // Phase: Slots
  // ===========================================================================

  /**
   * Slots phase: Extract and score delivery slots
   */
  private async executeSlotsPhase(): Promise<void> {
    const { stateMachine, tabs } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    // Step 1: Navigate to delivery slots
    this.updateStep('navigating');
    await tabs.update(this.context.tabId, {
      url: 'https://www.auchan.pt/pt/checkout/delivery',
    });
    await tabs.waitForLoad(this.context.tabId, this.config.operationTimeoutMs);

    // Step 2: Extract slots
    this.updateStep('extracting');
    const response = await this.sendToTab<SlotsExtractResponse>(
      this.context.tabId,
      'slots.extract'
    );

    if (!response.success) {
      throw new Error(`Failed to extract slots: ${response.error?.message ?? 'Unknown error'}`);
    }

    const slots = response.data?.slots ?? [];
    this.context.deliverySlots = slots;

    stateMachine.dispatch({
      type: 'PROGRESS_UPDATE',
      payload: {
        slotsFound: slots.filter((s) => s.available).length,
      },
    });

    // Step 3: Score slots based on preferences
    this.updateStep('scoring');
    const recommendation = await this.scoreSlots(slots);
    this.context.slotRecommendation = recommendation;

    this.log(`Slots phase complete: ${slots.length} slots, ${recommendation.recommended.length} recommended`);
  }

  /**
   * Score delivery slots based on user preferences
   */
  private async scoreSlots(slots: DeliverySlot[]): Promise<SlotRecommendation> {
    const { storage } = this.deps;

    // Load user preferences
    const stored = await storage.get<{
      userPreferences: {
        preferredDays: string[];
        preferredTimeStart: string;
        preferredTimeEnd: string;
        maxPriceDiffPercent: number;
      };
    }>(['userPreferences'], 'sync');

    const prefs = stored.userPreferences ?? {
      preferredDays: ['saturday', 'sunday'],
      preferredTimeStart: '10:00',
      preferredTimeEnd: '14:00',
    };

    const availableSlots = slots.filter((s) => s.available);

    const scored: ScoredSlot[] = availableSlots.map((slot) => {
      // Day preference score
      const dayScore = prefs.preferredDays.includes(slot.dayOfWeek.toLowerCase()) ? 1 : 0.5;

      // Time preference score
      const slotMid = this.timeToMinutes(slot.timeStart) +
        (this.timeToMinutes(slot.timeEnd) - this.timeToMinutes(slot.timeStart)) / 2;
      const prefMid =
        (this.timeToMinutes(prefs.preferredTimeStart) +
          this.timeToMinutes(prefs.preferredTimeEnd)) /
        2;
      const timeDiff = Math.abs(slotMid - prefMid) / 60; // hours difference
      const timeScore = Math.max(0, 1 - timeDiff / 6); // 6 hours max diff

      // Fee score (lower is better)
      const maxFee = 7.99;
      const feeScore = slot.isFree ? 1 : Math.max(0, 1 - slot.fee / maxFee);

      // Availability score (remaining capacity)
      const availabilityScore =
        slot.remainingCapacity === 'high'
          ? 1
          : slot.remainingCapacity === 'medium'
          ? 0.7
          : slot.remainingCapacity === 'low'
          ? 0.4
          : 0.8;

      // Overall score
      const score = dayScore * 40 + timeScore * 30 + feeScore * 20 + availabilityScore * 10;

      // Generate reason
      const reasons: string[] = [];
      if (dayScore === 1) reasons.push(`Preferred day (${slot.dayOfWeek})`);
      if (timeScore > 0.8) reasons.push('Preferred time');
      if (slot.isFree) reasons.push('Free delivery');
      else if (feeScore > 0.8) reasons.push(`Low fee (${slot.fee.toFixed(2)} EUR)`);

      return {
        ...slot,
        score,
        scoreBreakdown: {
          dayScore: dayScore * 40,
          timeScore: timeScore * 30,
          feeScore: feeScore * 20,
          availabilityScore: availabilityScore * 10,
        },
        reason: reasons.join(', ') || 'Available slot',
      };
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Find special slots
    const bestFreeSlot = scored.find((s) => s.isFree);
    const cheapestSlot = [...scored].sort((a, b) => a.fee - b.fee)[0];
    const soonestSlot = [...scored].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.timeStart}`);
      const dateB = new Date(`${b.date}T${b.timeStart}`);
      return dateA.getTime() - dateB.getTime();
    })[0];

    // Build recommendation (handle exactOptionalPropertyTypes)
    const recommendation: SlotRecommendation = {
      recommended: scored.slice(0, 3),
      allSlots: scored,
    };
    if (bestFreeSlot !== undefined) {
      recommendation.bestFreeSlot = bestFreeSlot;
    }
    if (cheapestSlot !== undefined) {
      recommendation.cheapestSlot = cheapestSlot;
    }
    if (soonestSlot !== undefined) {
      recommendation.soonestSlot = soonestSlot;
    }

    return recommendation;
  }

  /**
   * Convert time string (HH:MM) to minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  }

  // ===========================================================================
  // Phase: Finalizing
  // ===========================================================================

  /**
   * Finalizing phase: Prepare review pack
   */
  private async executeFinalizingPhase(): Promise<void> {
    const { storage, stateMachine } = this.deps;

    if (!this.context) {
      throw new Error('Run context not initialized');
    }

    const state = stateMachine.getState();

    // Build review pack
    const reviewPack: ReviewPack = {
      runId: state.runId!,
      originalOrder: this.context.selectedOrder,
      cartItems: this.context.cartItems,
      cartDiff: this.context.cartDiff,
      substitutions: this.context.substitutions,
      slotRecommendation: this.context.slotRecommendation,
      stats: {
        totalItems: this.context.cartItems.length,
        unavailableItems: this.context.unavailableItems.length,
        substitutesProposed: this.context.substitutions.length,
        slotsFound: this.context.deliverySlots.filter((s) => s.available).length,
        executionTimeMs: Date.now() - (state.startedAt ?? Date.now()),
      },
      generatedAt: Date.now(),
    };

    // Persist review pack
    await storage.set({ reviewPack }, 'session');

    this.log(`Review pack generated: ${reviewPack.stats.totalItems} items, ${reviewPack.stats.substitutesProposed} substitutions, ${reviewPack.stats.slotsFound} slots`);

    // SAFETY: At this point, state machine will transition to 'review'
    // User must manually approve before any checkout action
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Create an empty run context
   */
  private createEmptyContext(tabId: number): RunContext {
    return {
      tabId,
      selectedOrder: null,
      orderHistory: [],
      cartItems: [],
      cartDiff: null,
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
      slotRecommendation: null,
    };
  }

  /**
   * Update the current step within a phase
   */
  private updateStep(
    step: CartPhaseStep | SubstitutionPhaseStep | SlotsPhaseStep
  ): void {
    this.deps.stateMachine.dispatch({
      type: 'STEP_UPDATE',
      payload: { step },
    });
  }

  /**
   * Send a message to the content script in the target tab
   */
  private async sendToTab<T extends ExtensionResponse>(
    tabId: number,
    action: string,
    payload?: unknown
  ): Promise<T> {
    const request = createRequest(action as any, payload);
    return this.deps.messaging.sendToTab<T>(tabId, request);
  }

  /**
   * Create a RunError from an exception
   */
  private createErrorFromException(error: unknown, phase: RunPhase): RunError {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof Error && 'code' in error
        ? String((error as { code: unknown }).code)
        : ERROR_CODES.UNKNOWN;

    return createRunError(code, message, phase, isTransientError(code), 0);
  }

  /**
   * Handle a fatal error that cannot be recovered
   */
  private handleFatalError(error: unknown): void {
    const { stateMachine } = this.deps;
    const state = stateMachine.getState();

    const runError = this.createErrorFromException(error, state.phase);
    runError.recoverable = false;

    stateMachine.dispatch({
      type: 'ERROR_OCCURRED',
      payload: { error: runError },
    });

    this.log(`Fatal error: ${runError.message}`);
  }

  /**
   * Log a message (if debug enabled)
   */
  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      if (data !== undefined) {
        logger.info('Orchestrator', message, data);
      } else {
        logger.info('Orchestrator', message);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a RunOrchestrator instance
 */
export function createOrchestrator(
  deps: OrchestratorDeps,
  config?: Partial<OrchestratorConfig>
): RunOrchestrator {
  return new RunOrchestrator(deps, config);
}

