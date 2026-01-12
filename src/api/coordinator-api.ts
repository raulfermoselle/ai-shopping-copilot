/**
 * Coordinator REST API Handlers
 *
 * Framework-agnostic route handlers for the Control Panel integration.
 * These handlers manage Coordinator sessions and provide real-time
 * status updates to the UI.
 *
 * Endpoints:
 * - POST /api/coordinator/session/start - Start new session
 * - GET  /api/coordinator/session/:id - Get session status
 * - GET  /api/coordinator/session/:id/review-pack - Get Review Pack
 * - POST /api/coordinator/session/:id/approve - Approve cart
 * - POST /api/coordinator/session/:id/cancel - Cancel session
 *
 * Phase 3 New Endpoints:
 * - GET  /api/coordinator/session/:id/progress - Real-time progress
 * - GET  /api/coordinator/session/:id/preferences - Active preferences
 * - GET  /api/coordinator/session/:id/explanations - Decision explanations
 *
 * Design:
 * - Handlers return framework-agnostic HandlerResult objects
 * - Zod validation for all inputs
 * - In-memory session storage (production: use persistence.ts)
 * - Structured logging with sensitive data redaction
 *
 * SAFETY: Agent NEVER places orders - stops at review_ready state.
 */

import { z, ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { createLogger, type Logger } from '../utils/logger.js';
import { Coordinator, createCoordinator } from '../agents/coordinator/coordinator.js';
import type { CoordinatorSession } from '../agents/coordinator/types.js';
import type { AgentContext } from '../types/agent.js';
import {
  type HandlerResult,
  type ApiErrorResponse,
  type StartSessionResponse,
  type GetSessionResponse,
  type GetReviewPackResponse,
  type ApproveSessionResponse,
  type CancelSessionResponse,
  type CartModification,
  StartSessionRequestSchema,
  ApproveSessionRequestSchema,
  CancelSessionRequestSchema,
  API_ERROR_CODES,
  successResponse,
  errorResponse,
  statusToProgress,
  toApiError,
} from './types.js';
import type {
  GetProgressResponse,
  GetPreferencesResponse,
  GetExplanationsResponse,
  ProgressState,
  DecisionReasoning,
  PreferenceDisplay,
} from '../control-panel/types.js';
import {
  createInitialProgressState,
  preferenceDisplayBuilder,
  createSamplePreferenceRules,
  createSampleApplications,
  createAddedFromOrderReasoning,
  createSubstitutionReasoning,
} from '../control-panel/components/index.js';

// =============================================================================
// Session Storage (In-Memory)
// =============================================================================

/**
 * Internal session record with additional metadata.
 */
interface SessionRecord {
  /** The Coordinator session state */
  session: CoordinatorSession;
  /** The Coordinator instance managing this session */
  coordinator: Coordinator;
  /** Whether the session is actively running */
  running: boolean;
  /** Promise for the running session (for awaiting completion) */
  runPromise?: Promise<void>;
  /** Any pending modifications from approval */
  pendingModifications?: CartModification[];

  // Phase 3: Enhanced tracking
  /** Real-time progress state */
  progressState: ProgressState;
  /** Decision explanations */
  explanations: DecisionReasoning[];
  /** Active preferences */
  preferences: PreferenceDisplay;
}

/**
 * In-memory session store.
 * TODO: Replace with persistence.ts in production.
 */
const sessions = new Map<string, SessionRecord>();

/**
 * Logger for API operations.
 */
let apiLogger: Logger = createLogger('info', 'CoordinatorAPI');

/**
 * Configure the API logger.
 */
export function configureApiLogger(logger: Logger): void {
  apiLogger = logger;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a session by ID or return error response.
 */
function getSessionOrError(sessionId: string): SessionRecord | HandlerResult<ApiErrorResponse> {
  const record = sessions.get(sessionId);
  if (!record) {
    return errorResponse(404, API_ERROR_CODES.SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
  }
  return record;
}

/**
 * Validate request body with Zod schema.
 */
function validateRequest<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): T | HandlerResult<ApiErrorResponse> {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return errorResponse(400, API_ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
        issues,
      });
    }
    return errorResponse(400, API_ERROR_CODES.VALIDATION_ERROR, 'Invalid request body');
  }
}

/**
 * Check if a value is a HandlerResult (error response).
 */
function isErrorResult(value: unknown): value is HandlerResult<ApiErrorResponse> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    'body' in value &&
    typeof (value as HandlerResult<ApiErrorResponse>).body === 'object' &&
    (value as HandlerResult<ApiErrorResponse>).body !== null &&
    'success' in (value as HandlerResult<ApiErrorResponse>).body &&
    (value as HandlerResult<ApiErrorResponse>).body.success === false
  );
}

/**
 * Redact sensitive fields from log output.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'credential', 'auth'];
  const redacted = { ...obj };

  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  return `sess_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
}

// =============================================================================
// Handler: POST /api/coordinator/session/start
// =============================================================================

/**
 * Context factory for creating agent contexts.
 * This is injected for testability.
 */
export type AgentContextFactory = (
  sessionId: string,
  logger: Logger
) => Promise<AgentContext>;

/**
 * Default context factory (requires page to be provided).
 * In production, this would manage browser lifecycle.
 */
let contextFactory: AgentContextFactory | null = null;

/**
 * Configure the agent context factory.
 * Call this during application startup.
 */
export function configureContextFactory(factory: AgentContextFactory): void {
  contextFactory = factory;
}

/**
 * Start a new Coordinator session.
 *
 * Creates a new session, initializes the Coordinator, and starts
 * the cart preparation process in the background.
 *
 * @param body - Request body (validated against StartSessionRequestSchema)
 * @returns HandlerResult with session ID and initial status
 */
export async function handleStartSession(
  body: unknown
): Promise<HandlerResult<{ success: true; data: StartSessionResponse } | ApiErrorResponse>> {
  // Validate request
  const validated = validateRequest(StartSessionRequestSchema, body);
  if (isErrorResult(validated)) {
    return validated;
  }

  const { username, householdId, config } = validated;
  const sessionId = generateSessionId();

  apiLogger.info('Starting new session', {
    sessionId,
    username: redactSensitive({ username }).username,
    householdId,
  });

  try {
    // Create Coordinator with optional config overrides
    // Filter out undefined values to satisfy strict optional property types
    const cleanConfig = config
      ? Object.fromEntries(
          Object.entries(config).filter(([_, v]) => v !== undefined)
        )
      : undefined;
    const coordinator = createCoordinator(cleanConfig);

    // Phase 3: Initialize preferences (in production, load from persistence)
    const sampleRules = createSamplePreferenceRules();
    const sampleApplications = createSampleApplications();
    const preferences = preferenceDisplayBuilder()
      .addRules(sampleRules)
      .recordApplications(sampleApplications)
      .build();

    // Create initial session record
    const record: SessionRecord = {
      session: {
        sessionId,
        startTime: new Date(),
        username,
        householdId,
        status: 'initializing',
        workers: {
          cartBuilder: null,
          substitution: null,
          stockPruner: null,
          slotScout: null,
        },
        reviewPack: null,
        errors: [],
        screenshots: [],
      },
      coordinator,
      running: true,

      // Phase 3: Initialize enhanced tracking
      progressState: createInitialProgressState(),
      explanations: [],
      preferences,
    };

    sessions.set(sessionId, record);

    // Start coordinator in background (if context factory is configured)
    if (contextFactory) {
      record.runPromise = runCoordinatorInBackground(
        sessionId,
        coordinator,
        username,
        householdId
      );
    } else {
      apiLogger.warn('No context factory configured - session created but not started', {
        sessionId,
      });
    }

    apiLogger.info('Session created successfully', { sessionId, status: 'initializing' });

    return successResponse<StartSessionResponse>(201, {
      sessionId,
      status: 'initializing',
      message: 'Session started successfully. Poll for status updates.',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    apiLogger.error('Failed to create session', { error: err.message });

    // Clean up failed session
    sessions.delete(sessionId);

    return errorResponse(
      500,
      API_ERROR_CODES.SESSION_CREATION_FAILED,
      'Failed to create session',
      { error: err.message }
    );
  }
}

/**
 * Run coordinator in background and update session state.
 */
async function runCoordinatorInBackground(
  sessionId: string,
  coordinator: Coordinator,
  username: string,
  householdId: string
): Promise<void> {
  const record = sessions.get(sessionId);
  if (!record) {
    apiLogger.error('Session not found for background run', { sessionId });
    return;
  }

  try {
    if (!contextFactory) {
      throw new Error('Context factory not configured');
    }

    const context = await contextFactory(sessionId, apiLogger);

    const result = await coordinator.run(context, username, householdId);

    // Update session state from coordinator
    const coordSession = coordinator.getSession();
    if (coordSession) {
      record.session = coordSession;
    }

    if (result.success && result.data) {
      record.session.status = 'review_ready';
      record.session.reviewPack = result.data.reviewPack;
      apiLogger.info('Session completed successfully', {
        sessionId,
        itemCount: result.data.reviewPack.cart.summary.itemCount,
      });
    } else {
      record.session.status = 'cancelled';
      apiLogger.error('Session failed', {
        sessionId,
        error: result.error?.message,
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    record.session.status = 'cancelled';
    apiLogger.error('Session execution error', { sessionId, error: err.message });
  } finally {
    record.running = false;
  }
}

// =============================================================================
// Handler: GET /api/coordinator/session/:id
// =============================================================================

/**
 * Get current session status.
 *
 * Returns the session state, progress information, and any errors.
 * Used for polling to update the UI.
 *
 * @param sessionId - Session ID from URL parameter
 * @returns HandlerResult with session status
 */
export async function handleGetSession(
  sessionId: string
): Promise<HandlerResult<{ success: true; data: GetSessionResponse } | ApiErrorResponse>> {
  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;
  const { session } = record;

  // Get latest session state from coordinator if running
  const coordSession = record.coordinator.getSession();
  if (coordSession) {
    record.session = coordSession;
  }

  const response: GetSessionResponse = {
    sessionId: session.sessionId,
    status: session.status,
    progress: statusToProgress(session.status),
    reviewPackReady: session.status === 'review_ready' && session.reviewPack !== null,
    errors: session.errors.map(toApiError),
    startedAt: session.startTime.toISOString(),
    endedAt: session.endTime?.toISOString() ?? null,
  };

  return successResponse<GetSessionResponse>(200, response);
}

// =============================================================================
// Handler: GET /api/coordinator/session/:id/review-pack
// =============================================================================

/**
 * Get the Review Pack for a session.
 *
 * Returns the full Review Pack when the session is in review_ready state.
 * Returns 404 if the Review Pack is not yet ready.
 *
 * @param sessionId - Session ID from URL parameter
 * @returns HandlerResult with Review Pack or error
 */
export async function handleGetReviewPack(
  sessionId: string
): Promise<HandlerResult<{ success: true; data: GetReviewPackResponse } | ApiErrorResponse>> {
  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;
  const { session } = record;

  // Check if Review Pack is ready
  if (session.status !== 'review_ready') {
    return errorResponse(
      404,
      API_ERROR_CODES.REVIEW_PACK_NOT_READY,
      `Review Pack not ready. Current status: ${session.status}`,
      { currentStatus: session.status }
    );
  }

  if (!session.reviewPack) {
    return errorResponse(
      404,
      API_ERROR_CODES.REVIEW_PACK_NOT_READY,
      'Review Pack not available despite review_ready status'
    );
  }

  return successResponse<GetReviewPackResponse>(200, {
    sessionId: session.sessionId,
    reviewPack: session.reviewPack,
  });
}

// =============================================================================
// Handler: POST /api/coordinator/session/:id/approve
// =============================================================================

/**
 * Approve a session cart.
 *
 * Marks the session as completed after optional modifications.
 * SAFETY: This does NOT place an order - it marks the cart as approved
 * for the user to manually complete checkout.
 *
 * @param sessionId - Session ID from URL parameter
 * @param body - Request body with optional modifications
 * @returns HandlerResult with completion status
 */
export async function handleApproveSession(
  sessionId: string,
  body: unknown
): Promise<HandlerResult<{ success: true; data: ApproveSessionResponse } | ApiErrorResponse>> {
  // Validate request
  const validated = validateRequest(ApproveSessionRequestSchema, body);
  if (isErrorResult(validated)) {
    return validated;
  }

  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;
  const { session } = record;

  // Check session state
  if (session.status === 'completed') {
    return errorResponse(
      400,
      API_ERROR_CODES.SESSION_ALREADY_COMPLETED,
      'Session has already been completed'
    );
  }

  if (session.status === 'cancelled') {
    return errorResponse(
      400,
      API_ERROR_CODES.SESSION_ALREADY_CANCELLED,
      'Cannot approve a cancelled session'
    );
  }

  if (session.status !== 'review_ready') {
    return errorResponse(
      400,
      API_ERROR_CODES.INVALID_SESSION_STATE,
      `Cannot approve session in state: ${session.status}`,
      { currentStatus: session.status }
    );
  }

  const modifications = validated.modifications ?? [];
  const modificationsApplied = modifications.length;

  apiLogger.info('Approving session', {
    sessionId,
    modificationsCount: modificationsApplied,
  });

  // Store modifications (would be applied via browser automation in production)
  if (modificationsApplied > 0) {
    record.pendingModifications = modifications;
    apiLogger.info('Modifications queued', {
      sessionId,
      modifications: modifications.map((m) => ({
        type: m.type,
        product: m.productName,
      })),
    });
  }

  // Mark session as completed
  session.status = 'completed';
  session.endTime = new Date();

  apiLogger.info('Session approved successfully', { sessionId });

  return successResponse<ApproveSessionResponse>(200, {
    sessionId: session.sessionId,
    status: 'completed',
    message: 'Cart approved. Ready for manual checkout.',
    modificationsApplied,
  });
}

// =============================================================================
// Handler: POST /api/coordinator/session/:id/cancel
// =============================================================================

/**
 * Cancel a session.
 *
 * Marks the session as cancelled and stops any running operations.
 *
 * @param sessionId - Session ID from URL parameter
 * @param body - Request body with optional reason
 * @returns HandlerResult with cancellation status
 */
export async function handleCancelSession(
  sessionId: string,
  body: unknown
): Promise<HandlerResult<{ success: true; data: CancelSessionResponse } | ApiErrorResponse>> {
  // Validate request (body is optional)
  const validated = validateRequest(CancelSessionRequestSchema, body ?? {});
  if (isErrorResult(validated)) {
    return validated;
  }

  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;
  const { session } = record;

  // Check if already in terminal state
  if (session.status === 'cancelled') {
    return errorResponse(
      400,
      API_ERROR_CODES.SESSION_ALREADY_CANCELLED,
      'Session has already been cancelled'
    );
  }

  if (session.status === 'completed') {
    return errorResponse(
      400,
      API_ERROR_CODES.SESSION_ALREADY_COMPLETED,
      'Cannot cancel a completed session'
    );
  }

  const reason = validated.reason ?? 'User requested cancellation';

  apiLogger.info('Cancelling session', { sessionId, reason });

  // Mark session as cancelled
  session.status = 'cancelled';
  session.endTime = new Date();
  record.running = false;

  apiLogger.info('Session cancelled successfully', { sessionId });

  return successResponse<CancelSessionResponse>(200, {
    sessionId: session.sessionId,
    status: 'cancelled',
    message: reason,
  });
}

// =============================================================================
// Session Management Utilities
// =============================================================================

/**
 * Get all active sessions.
 * Utility for monitoring/debugging.
 */
export function getActiveSessions(): Array<{
  sessionId: string;
  status: string;
  running: boolean;
  startedAt: string;
}> {
  return Array.from(sessions.entries()).map(([id, record]) => ({
    sessionId: id,
    status: record.session.status,
    running: record.running,
    startedAt: record.session.startTime.toISOString(),
  }));
}

/**
 * Clear a specific session from memory.
 * Use for cleanup after session completion.
 */
export function clearSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Clear all sessions from memory.
 * Use for testing or shutdown cleanup.
 */
export function clearAllSessions(): void {
  sessions.clear();
}

/**
 * Get session count.
 */
export function getSessionCount(): number {
  return sessions.size;
}

// =============================================================================
// Testing Utilities
// =============================================================================

/**
 * Inject a mock session for testing.
 * Only use in test environments.
 */
export function injectMockSession(
  sessionId: string,
  session: Partial<CoordinatorSession>,
  coordinator?: Coordinator
): void {
  const fullSession: CoordinatorSession = {
    sessionId,
    startTime: new Date(),
    username: 'test@example.com',
    householdId: 'test-household',
    status: 'initializing',
    workers: {
      cartBuilder: null,
      substitution: null,
      stockPruner: null,
      slotScout: null,
    },
    reviewPack: null,
    errors: [],
    screenshots: [],
    ...session,
  };

  // Phase 3: Initialize with sample preferences
  const sampleRules = createSamplePreferenceRules();
  const sampleApplications = createSampleApplications();
  const preferences = preferenceDisplayBuilder()
    .addRules(sampleRules)
    .recordApplications(sampleApplications)
    .build();

  sessions.set(sessionId, {
    session: fullSession,
    coordinator: coordinator ?? createCoordinator(),
    running: false,
    progressState: createInitialProgressState(),
    explanations: [],
    preferences,
  });
}

/**
 * Get internal session record for testing.
 */
export function getSessionRecord(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

// =============================================================================
// Phase 3: New API Handlers
// =============================================================================

/**
 * Get real-time progress state for a session.
 *
 * Returns the current phase, worker statuses, and time estimates.
 * Used for polling to update the progress UI.
 *
 * @param sessionId - Session ID from URL parameter
 * @returns HandlerResult with progress state
 */
export async function handleGetProgress(
  sessionId: string
): Promise<HandlerResult<{ success: true; data: GetProgressResponse } | ApiErrorResponse>> {
  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;

  return successResponse<GetProgressResponse>(200, {
    sessionId,
    progress: record.progressState,
  });
}

/**
 * Get active preferences for a session.
 *
 * Returns the preference rules affecting the session and which items they influenced.
 *
 * @param sessionId - Session ID from URL parameter
 * @returns HandlerResult with preference display
 */
export async function handleGetPreferences(
  sessionId: string
): Promise<HandlerResult<{ success: true; data: GetPreferencesResponse } | ApiErrorResponse>> {
  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;

  return successResponse<GetPreferencesResponse>(200, {
    sessionId,
    preferences: record.preferences,
  });
}

/**
 * Get decision explanations for a session.
 *
 * Returns explanations for each cart decision (added, removed, substituted, etc.)
 * with confidence scores and factor breakdowns.
 *
 * @param sessionId - Session ID from URL parameter
 * @returns HandlerResult with decision explanations
 */
export async function handleGetExplanations(
  sessionId: string
): Promise<HandlerResult<{ success: true; data: GetExplanationsResponse } | ApiErrorResponse>> {
  const recordOrError = getSessionOrError(sessionId);
  if (isErrorResult(recordOrError)) {
    return recordOrError;
  }

  const record = recordOrError;

  // If session has a review pack but no explanations, generate them
  if (record.explanations.length === 0 && record.session.reviewPack) {
    record.explanations = generateExplanationsFromReviewPack(
      sessionId,
      record.session.reviewPack
    );
  }

  const explanations = record.explanations;
  const highConfidence = explanations.filter((e) => e.confidence.level === 'high').length;
  const mediumConfidence = explanations.filter((e) => e.confidence.level === 'medium').length;
  const lowConfidence = explanations.filter((e) => e.confidence.level === 'low').length;

  return successResponse<GetExplanationsResponse>(200, {
    sessionId,
    explanations,
    summary: {
      totalDecisions: explanations.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
    },
  });
}

/**
 * Generate decision explanations from a review pack.
 * In production, this would be done by the workers during execution.
 */
function generateExplanationsFromReviewPack(
  _sessionId: string,
  reviewPack: NonNullable<CoordinatorSession['reviewPack']>
): DecisionReasoning[] {
  const explanations: DecisionReasoning[] = [];

  // Explain items in cart
  for (const item of reviewPack.cart.after) {
    explanations.push(
      createAddedFromOrderReasoning(
        `item-${item.name.replace(/\s+/g, '-').toLowerCase()}`,
        item.name,
        reviewPack.confidence.sourceOrders,
        reviewPack.confidence.sourceOrders.length,
        reviewPack.confidence.sourceOrders.length,
        item.quantity
      )
    );
  }

  // Explain substitutions if present
  if (reviewPack.substitutions) {
    for (const sub of reviewPack.substitutions.substitutionResults) {
      if (sub.substitutes.length > 0) {
        const bestSub = sub.substitutes[0];
        if (bestSub) {
          explanations.push(
            createSubstitutionReasoning(
              `sub-${sub.originalProduct.name.replace(/\s+/g, '-').toLowerCase()}`,
              sub.originalProduct.name,
              bestSub.candidate.name,
              {
                originalName: sub.originalProduct.name,
                substituteName: bestSub.candidate.name,
                priceDifference: bestSub.priceDelta,
                originalUnitPrice: bestSub.candidate.unitPrice - bestSub.priceDelta,
                substituteUnitPrice: bestSub.candidate.unitPrice,
                similarityScore: bestSub.score.overall,
                differences: [bestSub.reason],
                selectionReason: bestSub.reason || 'Best available substitute',
              }
            )
          );
        }
      }
    }
  }

  return explanations;
}
