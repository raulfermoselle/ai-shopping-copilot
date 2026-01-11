/**
 * Session Manager
 *
 * Manages the lifecycle of shopping sessions from the Control Panel.
 * Acts as the bridge between the UI layer and the Coordinator agent.
 *
 * Responsibilities:
 * - Create and track sessions
 * - Poll session status
 * - Transform Coordinator ReviewPack to Control Panel format
 * - Handle user modifications and approval
 */

import { randomUUID } from 'crypto';
import type { Page } from 'playwright';
import type { Logger } from '../utils/logger.js';
import type {
  SessionProgress,
  ReviewPack as CPReviewPack,
  StartSessionRequest,
  StartSessionResponse,
  GetSessionStatusResponse,
  SubmitApprovalRequest,
  SubmitApprovalResponse,
  UserApproval,
  AddedItem,
  SlotOption,
} from './types.js';
import type {
  CoordinatorSession,
  CoordinatorConfig,
} from '../agents/coordinator/types.js';
import { Coordinator } from '../agents/coordinator/coordinator.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Internal session state
 */
interface ManagedSession {
  sessionId: string;
  request: StartSessionRequest;
  progress: SessionProgress;
  coordinatorSession?: CoordinatorSession;
  reviewPack?: CPReviewPack;
  coordinator?: Coordinator;
  page?: Page;
  startTime: Date;
  endTime?: Date;
}

/**
 * Session Manager configuration
 */
export interface SessionManagerConfig {
  /** Timeout for sessions in ms */
  sessionTimeout: number;
  /** How often to emit progress updates in ms */
  progressInterval: number;
  /** Whether to capture screenshots */
  captureScreenshots: boolean;
}

/**
 * Session Manager events
 */
export interface SessionManagerEvents {
  onProgress?: (sessionId: string, progress: SessionProgress) => void;
  onReviewPackReady?: (sessionId: string, reviewPack: CPReviewPack) => void;
  onError?: (sessionId: string, error: Error) => void;
  onComplete?: (sessionId: string) => void;
}

// =============================================================================
// Session Manager
// =============================================================================

/**
 * SessionManager handles Control Panel session lifecycle.
 */
export class SessionManager {
  private readonly config: SessionManagerConfig;
  private readonly sessions: Map<string, ManagedSession>;
  private readonly events: SessionManagerEvents;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    config: Partial<SessionManagerConfig> = {},
    events: SessionManagerEvents = {}
  ) {
    this.logger = logger;
    this.config = {
      sessionTimeout: config.sessionTimeout ?? 300000, // 5 minutes
      progressInterval: config.progressInterval ?? 1000, // 1 second
      captureScreenshots: config.captureScreenshots ?? true,
    };
    this.sessions = new Map();
    this.events = events;
  }

  /**
   * Start a new session.
   */
  async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
    const sessionId = randomUUID();

    this.logger.info('Starting new session', { sessionId, username: request.username });

    const session: ManagedSession = {
      sessionId,
      request,
      progress: {
        status: 'initializing',
        progress: 0,
        currentStep: 'Initializing session...',
        stepsCompleted: 0,
        totalSteps: this.calculateTotalSteps(request),
        updatedAt: new Date(),
      },
      startTime: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Start async processing
    this.processSession(sessionId).catch((error) => {
      this.logger.error('Session processing failed', { sessionId, error });
      this.updateSessionError(sessionId, error);
    });

    return {
      sessionId,
      status: 'initializing',
      message: 'Session started. Use getSessionStatus to track progress.',
    };
  }

  /**
   * Get session status and review pack if ready.
   */
  getSessionStatus(sessionId: string): GetSessionStatusResponse | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId,
      progress: session.progress,
      reviewPack: session.reviewPack,
    };
  }

  /**
   * Submit user approval for a session.
   */
  async submitApproval(request: SubmitApprovalRequest): Promise<SubmitApprovalResponse> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      return {
        success: false,
        message: 'Session not found',
      };
    }

    if (session.progress.status !== 'awaiting_review') {
      return {
        success: false,
        message: `Cannot submit approval in status: ${session.progress.status}`,
      };
    }

    const { approval } = request;

    if (approval.approved) {
      // Apply user modifications to cart
      await this.applyModifications(session, approval);

      session.progress.status = 'approved';
      session.progress.currentStep = 'Cart approved - ready for checkout';
      session.progress.updatedAt = new Date();

      return {
        success: true,
        message: 'Cart approved. Navigate to Auchan.pt to complete checkout.',
        cartUrl: 'https://www.auchan.pt/pt/carrinho',
        finalCart: {
          itemCount: session.reviewPack?.addedItems.length ?? 0,
          total: session.reviewPack?.estimatedTotal ?? 0,
        },
      };
    } else {
      session.progress.status = 'cancelled';
      session.progress.currentStep = 'Session cancelled by user';
      session.progress.updatedAt = new Date();
      session.endTime = new Date();

      return {
        success: true,
        message: 'Cart rejected. Session ended.',
      };
    }
  }

  /**
   * Cancel a session.
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.progress.status = 'cancelled';
    session.progress.currentStep = 'Session cancelled';
    session.progress.updatedAt = new Date();
    session.endTime = new Date();

    this.events.onComplete?.(sessionId);
    return true;
  }

  /**
   * Clean up old sessions.
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      const age = now - session.startTime.getTime();
      if (age > maxAgeMs) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Calculate total steps based on request options.
   */
  private calculateTotalSteps(request: StartSessionRequest): number {
    let steps = 4; // login, load_orders, build_cart, generate_review
    if (!request.skipSubstitutions) steps++;
    if (!request.skipPruning) steps++;
    if (!request.skipSlotScout) steps++;
    return steps;
  }

  /**
   * Process session asynchronously.
   */
  private async processSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Update: Loading orders
      this.updateProgress(sessionId, 'loading_orders', 1, 'Loading order history...');

      // Create Coordinator config
      const config: Partial<CoordinatorConfig> = {
        maxOrdersToLoad: session.request.ordersToLoad,
        enableSubstitution: !session.request.skipSubstitutions,
        enableStockPruning: !session.request.skipPruning,
        enableSlotScouting: !session.request.skipSlotScout,
        captureScreenshots: this.config.captureScreenshots,
      };

      session.coordinator = new Coordinator(config);

      // Note: In real implementation, we'd get a Page from browser pool
      // For now, this is a placeholder showing the flow
      this.updateProgress(sessionId, 'building_cart', 2, 'Building cart from orders...');

      // Simulate Coordinator execution (real impl needs browser page)
      // const result = await session.coordinator.run(agentContext);

      // For now, emit simulated progress updates
      await this.simulateCoordinatorExecution(session);

    } catch (error) {
      this.updateSessionError(sessionId, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Simulate coordinator execution for development/testing.
   * In production, this would be replaced with actual Coordinator.run()
   */
  private async simulateCoordinatorExecution(session: ManagedSession): Promise<void> {
    const { sessionId, request } = session;

    // Simulate loading orders
    await this.delay(1000);
    this.updateProgress(sessionId, 'loading_orders', 1, `Loading ${request.ordersToLoad} orders...`);

    // Simulate cart building
    await this.delay(1500);
    this.updateProgress(sessionId, 'building_cart', 2, 'Merging orders into cart...');

    // Simulate availability check (if enabled)
    if (!request.skipSubstitutions) {
      await this.delay(1000);
      this.updateProgress(sessionId, 'checking_availability', 3, 'Checking item availability...');
    }

    // Simulate substitution search (if enabled)
    if (!request.skipSubstitutions) {
      await this.delay(1000);
      this.updateProgress(sessionId, 'finding_substitutes', 4, 'Finding substitutes...');
    }

    // Simulate pruning (if enabled)
    if (!request.skipPruning) {
      await this.delay(800);
      this.updateProgress(sessionId, 'pruning_stock', 5, 'Analyzing restock needs...');
    }

    // Simulate slot scouting (if enabled)
    if (!request.skipSlotScout) {
      await this.delay(800);
      this.updateProgress(sessionId, 'scouting_slots', 6, 'Finding delivery slots...');
    }

    // Generate review pack
    await this.delay(500);
    this.updateProgress(sessionId, 'generating_review', 7, 'Generating review pack...');

    // Create mock review pack for testing
    const reviewPack = this.createMockReviewPack(session);
    session.reviewPack = reviewPack;

    // Final status
    session.progress.status = 'awaiting_review';
    session.progress.progress = 100;
    session.progress.currentStep = 'Review pack ready for approval';
    session.progress.stepsCompleted = session.progress.totalSteps;
    session.progress.updatedAt = new Date();

    this.events.onProgress?.(sessionId, session.progress);
    this.events.onReviewPackReady?.(sessionId, reviewPack);
  }

  /**
   * Create mock review pack for development/testing.
   */
  private createMockReviewPack(session: ManagedSession): CPReviewPack {
    const now = new Date();

    const addedItems: AddedItem[] = [
      { name: 'Leite Mimosa Meio Gordo 1L', quantity: 6, unitPrice: 0.99, totalPrice: 5.94, available: true },
      { name: 'Pão de Forma Integral', quantity: 2, unitPrice: 1.49, totalPrice: 2.98, available: true },
      { name: 'Iogurte Natural Danone', quantity: 4, unitPrice: 0.45, totalPrice: 1.80, available: true },
      { name: 'Maçã Golden', quantity: 1, unitPrice: 2.99, totalPrice: 2.99, available: false },
    ];

    const slotOptions: SlotOption[] = [
      {
        date: new Date(now.getTime() + 86400000),
        dayName: 'Amanhã',
        startTime: '10:00',
        endTime: '12:00',
        isFree: true,
        rank: 1,
        reason: 'Earliest free delivery slot',
        selected: false,
      },
      {
        date: new Date(now.getTime() + 86400000),
        dayName: 'Amanhã',
        startTime: '14:00',
        endTime: '16:00',
        deliveryCost: 2.99,
        isFree: false,
        rank: 2,
        reason: 'Afternoon slot available',
        selected: false,
      },
    ];

    return {
      sessionId: session.sessionId,
      generatedAt: now,
      addedItems,
      suggestedRemovals: [],
      quantityChanges: [],
      unavailableItems: [{
        name: 'Maçã Golden',
        quantity: 1,
        unitPrice: 2.99,
        substitutes: [{
          productId: 'P123',
          name: 'Maçã Fuji',
          unitPrice: 3.29,
          priceDelta: 0.30,
          reason: 'Similar variety, same weight',
          score: 0.85,
          selected: false,
        }],
        userAction: 'pending',
      }],
      slotOptions,
      slotsAvailable: true,
      subtotal: 13.71,
      estimatedDeliveryCost: 0,
      estimatedTotal: 13.71,
      ordersAnalyzed: ['ORD-001', 'ORD-002', 'ORD-003'],
      confidence: 0.92,
      warnings: ['1 item unavailable - substitute suggested'],
    };
  }

  /**
   * Update session progress.
   */
  private updateProgress(
    sessionId: string,
    status: SessionProgress['status'],
    stepsCompleted: number,
    currentStep: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.progress.status = status;
    session.progress.stepsCompleted = stepsCompleted;
    session.progress.currentStep = currentStep;
    session.progress.progress = Math.round((stepsCompleted / session.progress.totalSteps) * 100);
    session.progress.updatedAt = new Date();

    this.events.onProgress?.(sessionId, session.progress);
  }

  /**
   * Update session with error.
   */
  private updateSessionError(sessionId: string, error: Error): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.progress.status = 'error';
    session.progress.error = error.message;
    session.progress.currentStep = 'Session failed';
    session.progress.updatedAt = new Date();
    session.endTime = new Date();

    this.events.onError?.(sessionId, error);
  }

  /**
   * Apply user modifications from approval.
   */
  private async applyModifications(
    session: ManagedSession,
    approval: UserApproval
  ): Promise<void> {
    for (const mod of approval.modifications) {
      switch (mod.type) {
        case 'removal_decision':
          this.logger.info('Applying removal decision', {
            sessionId: session.sessionId,
            productId: mod.productId,
            action: mod.action,
          });
          // In real impl: update cart via Playwright
          break;

        case 'substitute_decision':
          this.logger.info('Applying substitute decision', {
            sessionId: session.sessionId,
            productId: mod.productId,
            action: mod.action,
          });
          // In real impl: add substitute to cart
          break;

        case 'quantity_change':
          this.logger.info('Applying quantity change', {
            sessionId: session.sessionId,
            productId: mod.productId,
            newQuantity: mod.newQuantity,
          });
          // In real impl: update quantity via Playwright
          break;

        case 'slot_selection':
          this.logger.info('Applying slot selection', {
            sessionId: session.sessionId,
            slotIndex: mod.slotIndex,
          });
          // Note: Slot is just recorded, not selected in checkout
          break;
      }
    }
  }

  // Note: transformReviewPack and mapStatus will be used in Phase 2
  // when we connect to real Coordinator execution

  /**
   * Simple delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a SessionManager instance.
 */
export function createSessionManager(
  logger: Logger,
  config?: Partial<SessionManagerConfig>,
  events?: SessionManagerEvents
): SessionManager {
  return new SessionManager(logger, config, events);
}
