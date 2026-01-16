/**
 * Orchestrator Types
 *
 * Defines actions, guards, and interfaces for the run state machine.
 * The state machine manages the lifecycle of shopping session runs.
 *
 * SAFETY CONSTRAINT (ADR-007): No checkout/purchase states exist.
 * The 'review' state is terminal for automation - only user can proceed.
 */

import type {
  RunState,
  RunStatus,
  RunPhase,
  RunProgress,
  RunError,
  LoginState,
  CartPhaseStep,
  SubstitutionPhaseStep,
  SlotsPhaseStep,
} from '../../types/state.js';
import type { IStoragePort } from '../../ports/storage.js';

// =============================================================================
// Run Actions
// =============================================================================

/**
 * All possible actions that can be dispatched to the state machine.
 *
 * User-initiated actions:
 * - START_RUN: User clicks "Start Run" button
 * - PAUSE_RUN: User manually pauses the run
 * - RESUME_RUN: User resumes from paused state
 * - CANCEL_RUN: User cancels and returns to idle
 * - APPROVE_CART: User approves the review pack (terminal action)
 *
 * System-generated actions:
 * - ERROR_OCCURRED: Error detected during execution
 * - PHASE_COMPLETE: Phase finished successfully, advance to next
 * - STEP_UPDATE: Update the current step within a phase
 * - PROGRESS_UPDATE: Update progress counters
 * - RECOVERY_COMPLETE: Service worker recovery finished
 */
export type RunAction =
  | StartRunAction
  | PauseRunAction
  | ResumeRunAction
  | CancelRunAction
  | ApproveCartAction
  | ErrorOccurredAction
  | PhaseCompleteAction
  | StepUpdateAction
  | ProgressUpdateAction
  | RecoveryCompleteAction;

export interface StartRunAction {
  type: 'START_RUN';
  payload: {
    /** Tab ID where Auchan.pt is open */
    tabId: number;
    /** Optional: specific order ID to reorder */
    orderId?: string;
  };
}

export interface PauseRunAction {
  type: 'PAUSE_RUN';
}

export interface ResumeRunAction {
  type: 'RESUME_RUN';
}

export interface CancelRunAction {
  type: 'CANCEL_RUN';
}

export interface ApproveCartAction {
  type: 'APPROVE_CART';
}

export interface ErrorOccurredAction {
  type: 'ERROR_OCCURRED';
  payload: {
    error: RunError;
  };
}

export interface PhaseCompleteAction {
  type: 'PHASE_COMPLETE';
  payload: {
    phase: RunPhase;
  };
}

export interface StepUpdateAction {
  type: 'STEP_UPDATE';
  payload: {
    step: CartPhaseStep | SubstitutionPhaseStep | SlotsPhaseStep | string;
  };
}

export interface ProgressUpdateAction {
  type: 'PROGRESS_UPDATE';
  payload: Partial<RunProgress>;
}

export interface RecoveryCompleteAction {
  type: 'RECOVERY_COMPLETE';
}

// =============================================================================
// Guard Function Types
// =============================================================================

/**
 * Guard function to check if user is logged in to Auchan.pt
 */
export type IsLoggedInGuard = (loginState: LoginState) => boolean;

/**
 * Guard function to check if run can be retried after error
 * Conditions: errorCount < 3 AND error is recoverable
 */
export type CanRetryGuard = (state: RunState) => boolean;

/**
 * Guard function to check if review pack is ready
 * Conditions: phase === 'finalizing' AND step === null
 */
export type PackReadyGuard = (state: RunState) => boolean;

/**
 * Guard function to validate state transitions
 * Uses VALID_TRANSITIONS lookup table
 */
export type ValidTransitionGuard = (from: RunStatus, to: RunStatus) => boolean;

// =============================================================================
// State Machine Interface
// =============================================================================

/**
 * The state machine manages run orchestration state.
 * All state changes are persisted to storage automatically.
 */
export interface StateMachine {
  /**
   * Get current state (immutable snapshot)
   */
  getState(): RunState;

  /**
   * Dispatch an action to transition state.
   * Returns new state (or unchanged state if action is invalid).
   * Side effects (persistence, listeners) happen after reducer.
   */
  dispatch(action: RunAction): RunState;

  /**
   * Check if transition to target status is valid from current state
   */
  canTransition(to: RunStatus): boolean;

  /**
   * Get current phase (null if not running)
   */
  getCurrentPhase(): RunPhase | null;

  /**
   * Subscribe to state changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: StateChangeListener): () => void;
}

/**
 * Listener callback for state changes
 */
export type StateChangeListener = (state: RunState) => void;

/**
 * Dependencies injected into the state machine factory
 */
export interface StateMachineDeps {
  /** Storage port for persistence */
  storage: IStoragePort;
  /** Optional callback for external state change handling */
  onStateChange?: StateChangeListener;
}

/**
 * Configuration options for the state machine
 */
export interface StateMachineConfig {
  /** Maximum consecutive errors before requiring user intervention */
  maxErrorCount: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  maxErrorCount: 3,
  debug: false,
};

// =============================================================================
// Audit Log Types (for debugging and safety compliance)
// =============================================================================

/**
 * Audit log entry for state transitions
 */
export interface TransitionLogEntry {
  timestamp: number;
  fromStatus: RunStatus;
  toStatus: RunStatus;
  fromPhase: RunPhase;
  toPhase: RunPhase;
  action: RunAction['type'];
  runId: string | null;
}

/**
 * Utility type for extracting action type strings
 */
export type ActionType = RunAction['type'];

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type {
  RunState,
  RunStatus,
  RunPhase,
  RunProgress,
  RunError,
  LoginState,
  CartPhaseStep,
  SubstitutionPhaseStep,
  SlotsPhaseStep,
} from '../../types/state.js';
