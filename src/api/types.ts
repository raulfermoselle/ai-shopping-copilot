/**
 * Coordinator API Types
 *
 * Request and response types for the Control Panel REST API.
 * These types define the contract between the UI and the Coordinator agent.
 *
 * Design Principles:
 * - Zod schemas for runtime validation
 * - TypeScript types for static analysis
 * - Framework-agnostic (no Express/Fastify specifics)
 */

import { z } from 'zod';
import type {
  SessionStatus,
  CoordinatorError,
  ReviewPack,
} from '../agents/coordinator/types.js';
import { SessionStatusSchema, CoordinatorConfigSchema } from '../agents/coordinator/types.js';

// =============================================================================
// Common Response Types
// =============================================================================

/**
 * Standard API error response.
 * Returned when an endpoint fails with a known error.
 */
export const ApiErrorResponseSchema = z.object({
  /** Error indicator */
  success: z.literal(false),
  /** HTTP status code */
  statusCode: z.number().int(),
  /** Error code for client handling */
  errorCode: z.string(),
  /** Human-readable error message */
  message: z.string(),
  /** Additional error details (debugging) */
  details: z.record(z.unknown()).optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Generic success response wrapper.
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// =============================================================================
// Session Progress Types
// =============================================================================

/**
 * Progress information for a session.
 * Used for polling UI updates.
 */
export const SessionProgressSchema = z.object({
  /** Current step name */
  currentStep: z.string(),
  /** Total number of steps */
  totalSteps: z.number().int().nonnegative(),
  /** Current step index (0-based) */
  currentStepIndex: z.number().int().nonnegative(),
  /** Percentage complete (0-100) */
  percentComplete: z.number().min(0).max(100),
});

export type SessionProgress = z.infer<typeof SessionProgressSchema>;

/**
 * Map session status to progress information.
 */
export function statusToProgress(status: SessionStatus): SessionProgress {
  const steps: SessionStatus[] = [
    'initializing',
    'authenticating',
    'loading_cart',
    'generating_review',
    'review_ready',
  ];

  const stepNames: Record<SessionStatus, string> = {
    initializing: 'Initializing session',
    authenticating: 'Authenticating',
    loading_cart: 'Loading cart',
    generating_review: 'Generating review',
    review_ready: 'Ready for review',
    cancelled: 'Cancelled',
    completed: 'Completed',
  };

  const currentStepIndex = steps.indexOf(status);
  const index = currentStepIndex >= 0 ? currentStepIndex : steps.length - 1;

  return {
    currentStep: stepNames[status],
    totalSteps: steps.length,
    currentStepIndex: index,
    percentComplete: Math.round((index / (steps.length - 1)) * 100),
  };
}

// =============================================================================
// POST /api/coordinator/session/start
// =============================================================================

/**
 * Request body for starting a new Coordinator session.
 */
export const StartSessionRequestSchema = z.object({
  /** Auchan username (email) */
  username: z.string().email('Invalid email format'),
  /** Household identifier for preference lookup */
  householdId: z.string().min(1, 'Household ID is required'),
  /** Optional configuration overrides */
  config: CoordinatorConfigSchema.partial().optional(),
});

export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

/**
 * Response for successful session start.
 */
export const StartSessionResponseSchema = z.object({
  /** Unique session identifier */
  sessionId: z.string(),
  /** Initial session status */
  status: SessionStatusSchema,
  /** Message for UI display */
  message: z.string(),
});

export type StartSessionResponse = z.infer<typeof StartSessionResponseSchema>;

// =============================================================================
// GET /api/coordinator/session/:id
// =============================================================================

/**
 * Simplified error for API response (no internal context).
 */
export const ApiCoordinatorErrorSchema = z.object({
  /** Error code */
  code: z.string(),
  /** Human-readable message */
  message: z.string(),
  /** Severity level */
  severity: z.enum(['info', 'warning', 'error', 'fatal']),
  /** Source of error */
  source: z.string(),
  /** When error occurred */
  timestamp: z.string(),
});

export type ApiCoordinatorError = z.infer<typeof ApiCoordinatorErrorSchema>;

/**
 * Convert internal CoordinatorError to API error.
 */
export function toApiError(error: CoordinatorError): ApiCoordinatorError {
  return {
    code: error.code,
    message: error.message,
    severity: error.severity,
    source: error.source,
    timestamp: error.timestamp.toISOString(),
  };
}

/**
 * Response for session status query.
 */
export const GetSessionResponseSchema = z.object({
  /** Session identifier */
  sessionId: z.string(),
  /** Current status */
  status: SessionStatusSchema,
  /** Progress information */
  progress: SessionProgressSchema,
  /** Whether Review Pack is available */
  reviewPackReady: z.boolean(),
  /** Errors encountered */
  errors: z.array(ApiCoordinatorErrorSchema),
  /** Session start time */
  startedAt: z.string(),
  /** Session end time (if completed/cancelled) */
  endedAt: z.string().nullable(),
});

export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

// =============================================================================
// GET /api/coordinator/session/:id/review-pack
// =============================================================================

/**
 * Response for review pack retrieval.
 * Returns the full ReviewPack when session is in review_ready state.
 */
export const GetReviewPackResponseSchema = z.object({
  /** Session identifier */
  sessionId: z.string(),
  /** The Review Pack data */
  reviewPack: z.custom<ReviewPack>(),
});

export type GetReviewPackResponse = z.infer<typeof GetReviewPackResponseSchema>;

// =============================================================================
// POST /api/coordinator/session/:id/approve
// =============================================================================

/**
 * Cart modification for approval request.
 * Allows user to modify cart items before final approval.
 */
export const CartModificationSchema = z.object({
  /** Type of modification */
  type: z.enum(['remove', 'quantity_change']),
  /** Product name to modify */
  productName: z.string().min(1),
  /** New quantity (for quantity_change) */
  newQuantity: z.number().int().nonnegative().optional(),
});

export type CartModification = z.infer<typeof CartModificationSchema>;

/**
 * Request body for approving a session.
 */
export const ApproveSessionRequestSchema = z.object({
  /** Optional modifications to apply before approval */
  modifications: z.array(CartModificationSchema).optional(),
});

export type ApproveSessionRequest = z.infer<typeof ApproveSessionRequestSchema>;

/**
 * Response for session approval.
 */
export const ApproveSessionResponseSchema = z.object({
  /** Session identifier */
  sessionId: z.string(),
  /** Updated status (should be 'completed') */
  status: SessionStatusSchema,
  /** Confirmation message */
  message: z.string(),
  /** Number of modifications applied */
  modificationsApplied: z.number().int().nonnegative(),
});

export type ApproveSessionResponse = z.infer<typeof ApproveSessionResponseSchema>;

// =============================================================================
// POST /api/coordinator/session/:id/cancel
// =============================================================================

/**
 * Request body for cancelling a session.
 */
export const CancelSessionRequestSchema = z.object({
  /** Optional reason for cancellation */
  reason: z.string().optional(),
});

export type CancelSessionRequest = z.infer<typeof CancelSessionRequestSchema>;

/**
 * Response for session cancellation.
 */
export const CancelSessionResponseSchema = z.object({
  /** Session identifier */
  sessionId: z.string(),
  /** Updated status (should be 'cancelled') */
  status: SessionStatusSchema,
  /** Confirmation message */
  message: z.string(),
});

export type CancelSessionResponse = z.infer<typeof CancelSessionResponseSchema>;

// =============================================================================
// Error Codes
// =============================================================================

/**
 * API error codes for client handling.
 */
export const API_ERROR_CODES = {
  // Request errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  REVIEW_PACK_NOT_READY: 'REVIEW_PACK_NOT_READY',
  SESSION_ALREADY_COMPLETED: 'SESSION_ALREADY_COMPLETED',
  SESSION_ALREADY_CANCELLED: 'SESSION_ALREADY_CANCELLED',
  INVALID_SESSION_STATE: 'INVALID_SESSION_STATE',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  COORDINATOR_ERROR: 'COORDINATOR_ERROR',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// =============================================================================
// Handler Result Types
// =============================================================================

/**
 * Result type for API handlers.
 * Framework-agnostic representation of HTTP response.
 */
export interface HandlerResult<T> {
  /** HTTP status code */
  statusCode: number;
  /** Response body */
  body: T | ApiErrorResponse;
}

/**
 * Create a success response.
 */
export function successResponse<T>(statusCode: number, data: T): HandlerResult<{ success: true; data: T }> {
  return {
    statusCode,
    body: {
      success: true,
      data,
    },
  };
}

/**
 * Create an error response.
 */
export function errorResponse(
  statusCode: number,
  errorCode: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): HandlerResult<ApiErrorResponse> {
  return {
    statusCode,
    body: {
      success: false,
      statusCode,
      errorCode,
      message,
      details,
    },
  };
}
