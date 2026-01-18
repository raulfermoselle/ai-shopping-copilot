/**
 * State Transitions
 *
 * Pure reducer function and guard implementations for the run state machine.
 * All functions are side-effect free and can be unit tested in isolation.
 *
 * SAFETY CONSTRAINT (ADR-007):
 * - NO 'checkout', 'purchase', 'payment', or 'order' states
 * - 'review' state is terminal for automation
 * - 'running' can ONLY transition to 'paused' or 'review', NOT 'complete'
 * - 'complete' is ONLY reachable from 'review'
 */

import {
  VALID_TRANSITIONS,
  PHASE_ORDER,
  DEFAULT_RUN_STATE,
} from '../../types/state.js';

import type {
  RunAction,
  RunState,
  RunStatus,
  RunPhase,
  LoginState,
  CartPhaseStep,
  SubstitutionPhaseStep,
  SlotsPhaseStep,
  IsLoggedInGuard,
  CanRetryGuard,
  PackReadyGuard,
  ValidTransitionGuard,
} from './types.js';

// =============================================================================
// Guards
// =============================================================================

/**
 * Check if user is logged in to Auchan.pt
 */
export const isLoggedIn: IsLoggedInGuard = (loginState: LoginState): boolean => {
  return loginState.isLoggedIn === true;
};

/**
 * Check if run can be retried after error
 * Conditions: errorCount < 3 AND error is recoverable
 */
export const canRetry: CanRetryGuard = (state: RunState): boolean => {
  return state.errorCount < 3 && state.error?.recoverable === true;
};

/**
 * Check if review pack is ready to be shown to user
 * Conditions: phase === 'finalizing' AND step === null (finalization complete)
 */
export const packReady: PackReadyGuard = (state: RunState): boolean => {
  return state.phase === 'finalizing' && state.step === null;
};

/**
 * Validate state transition against allowed transitions table
 *
 * SAFETY: This function enforces:
 * - 'running' can only go to 'paused' or 'review'
 * - 'complete' is only reachable from 'review'
 */
export const validTransition: ValidTransitionGuard = (
  from: RunStatus,
  to: RunStatus
): boolean => {
  const allowed = VALID_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Exhaustive check helper that returns the fallback value.
 * TypeScript will error at compile time if this is reachable with a known type.
 */
function assertNever(_value: never, fallback: RunState): RunState {
  return fallback;
}

/**
 * Generate a unique run ID
 * Format: run_<timestamp>_<random>
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Get the next phase in the phase order
 * Returns null if current phase is the last one
 */
export function getNextPhase(currentPhase: RunPhase): RunPhase | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= PHASE_ORDER.length - 1) {
    return null;
  }
  const nextPhase = PHASE_ORDER[currentIndex + 1];
  return nextPhase ?? null;
}

/**
 * Step type for any phase
 */
export type PhaseStep =
  | CartPhaseStep
  | SubstitutionPhaseStep
  | SlotsPhaseStep
  | null;

/**
 * Get the initial step for a phase
 * Returns null for phases without defined steps
 */
export function getInitialStepForPhase(phase: RunPhase): PhaseStep {
  switch (phase) {
    case 'initializing':
      return null;
    case 'cart':
      return 'loading-orders' as const;
    case 'substitution':
      return 'identifying' as const;
    case 'slots':
      return 'navigating' as const;
    case 'finalizing':
      return null;
    default:
      return null;
  }
}

/**
 * Create initial progress state
 */
export function createInitialProgress(): RunState['progress'] {
  return {
    ordersLoaded: 0,
    ordersTotal: 0,
    itemsProcessed: 0,
    itemsTotal: 0,
    unavailableItems: 0,
    substitutesProposed: 0,
    slotsFound: 0,
  };
}

// =============================================================================
// Reducer
// =============================================================================

/**
 * Pure reducer for run state transitions.
 *
 * IMPORTANT:
 * - This function is PURE - no side effects
 * - Returns unchanged state if action is invalid
 * - All persistence happens in the state machine wrapper
 *
 * SAFETY ENFORCEMENT:
 * - START_RUN: Only from 'idle'
 * - PHASE_COMPLETE: Advances phase, triggers 'review' when finalization completes
 * - APPROVE_CART: Only from 'review' to 'complete'
 * - CANCEL_RUN: Returns to 'idle' from any active state
 */
export function runReducer(state: RunState, action: RunAction): RunState {
  const now = Date.now();

  switch (action.type) {
    // =========================================================================
    // START_RUN: Begin a new run
    // Valid from: idle
    // Transitions to: running (initializing phase)
    // =========================================================================
    case 'START_RUN': {
      if (state.status !== 'idle') {
        // Invalid transition - return unchanged
        return state;
      }

      return {
        ...state,
        runId: generateRunId(),
        status: 'running',
        phase: 'initializing',
        step: null,
        progress: createInitialProgress(),
        error: null,
        errorCount: 0,
        startedAt: now,
        updatedAt: now,
        tabId: action.payload.tabId,
        recoveryNeeded: false,
      };
    }

    // =========================================================================
    // PAUSE_RUN: Pause the current run (due to error or user action)
    // Valid from: running
    // Transitions to: paused
    // =========================================================================
    case 'PAUSE_RUN': {
      if (state.status !== 'running') {
        return state;
      }

      return {
        ...state,
        status: 'paused',
        updatedAt: now,
      };
    }

    // =========================================================================
    // RESUME_RUN: Resume from paused state
    // Valid from: paused
    // Transitions to: running (same phase/step as before)
    // =========================================================================
    case 'RESUME_RUN': {
      if (state.status !== 'paused') {
        return state;
      }

      // Check if we can retry (error count not exceeded)
      if (state.error && !canRetry(state)) {
        return state;
      }

      return {
        ...state,
        status: 'running',
        error: null, // Clear error on resume
        updatedAt: now,
        recoveryNeeded: false,
      };
    }

    // =========================================================================
    // CANCEL_RUN: User cancels the run, return to idle
    // Valid from: running, paused, review
    // Transitions to: idle
    // =========================================================================
    case 'CANCEL_RUN': {
      if (state.status === 'idle' || state.status === 'complete') {
        return state;
      }

      return {
        ...DEFAULT_RUN_STATE,
        updatedAt: now,
      };
    }

    // =========================================================================
    // APPROVE_CART: User approves the review pack
    // Valid from: review ONLY (SAFETY: this is the terminal automation state)
    // Transitions to: complete
    // =========================================================================
    case 'APPROVE_CART': {
      if (state.status !== 'review') {
        return state;
      }

      return {
        ...state,
        status: 'complete',
        updatedAt: now,
      };
    }

    // =========================================================================
    // ERROR_OCCURRED: An error happened during execution
    // Valid from: running
    // Transitions to: paused (preserves phase/step for recovery)
    // =========================================================================
    case 'ERROR_OCCURRED': {
      if (state.status !== 'running') {
        return state;
      }

      const newErrorCount = state.errorCount + 1;

      return {
        ...state,
        status: 'paused',
        error: action.payload.error,
        errorCount: newErrorCount,
        updatedAt: now,
      };
    }

    // =========================================================================
    // PHASE_COMPLETE: Current phase finished, advance to next
    // Valid from: running
    // Transitions to: running (next phase) OR review (if finalizing complete)
    // =========================================================================
    case 'PHASE_COMPLETE': {
      if (state.status !== 'running') {
        return state;
      }

      // Verify the completed phase matches current phase
      if (action.payload.phase !== state.phase) {
        // Mismatch - this shouldn't happen, log and return unchanged
        return state;
      }

      const nextPhase = getNextPhase(state.phase);

      // If we were in 'finalizing' and it completed, transition to 'review'
      if (state.phase === 'finalizing') {
        return {
          ...state,
          status: 'review',
          step: null,
          updatedAt: now,
        };
      }

      // If no next phase (shouldn't happen before finalizing), stay in current state
      if (!nextPhase) {
        return state;
      }

      // Advance to next phase
      return {
        ...state,
        phase: nextPhase,
        step: getInitialStepForPhase(nextPhase),
        updatedAt: now,
      };
    }

    // =========================================================================
    // STEP_UPDATE: Update the current step within a phase
    // Valid from: running
    // Does not change status, only step
    // =========================================================================
    case 'STEP_UPDATE': {
      if (state.status !== 'running') {
        return state;
      }

      return {
        ...state,
        step: action.payload.step as RunState['step'],
        updatedAt: now,
      };
    }

    // =========================================================================
    // PROGRESS_UPDATE: Update progress counters
    // Valid from: running
    // Does not change status, only progress
    // =========================================================================
    case 'PROGRESS_UPDATE': {
      if (state.status !== 'running') {
        return state;
      }

      return {
        ...state,
        progress: {
          ...state.progress,
          ...action.payload,
        },
        updatedAt: now,
      };
    }

    // =========================================================================
    // RECOVERY_COMPLETE: Service worker recovery finished
    // Valid from: any (clears recovery flag)
    // Does not change status
    // =========================================================================
    case 'RECOVERY_COMPLETE': {
      return {
        ...state,
        recoveryNeeded: false,
        updatedAt: now,
      };
    }

    default: {
      // Unknown action - return unchanged state
      // TypeScript exhaustiveness check catches missing cases at compile time
      return assertNever(action, state);
    }
  }
}

// =============================================================================
// Transition Validation Helpers
// =============================================================================

/**
 * Get the status that would result from an action
 * Useful for UI to show disabled states
 */
export function getTargetStatus(action: RunAction['type']): RunStatus | null {
  switch (action) {
    case 'START_RUN':
      return 'running';
    case 'PAUSE_RUN':
      return 'paused';
    case 'RESUME_RUN':
      return 'running';
    case 'CANCEL_RUN':
      return 'idle';
    case 'APPROVE_CART':
      return 'complete';
    case 'ERROR_OCCURRED':
      return 'paused';
    case 'PHASE_COMPLETE':
      return null; // Depends on current phase
    case 'STEP_UPDATE':
    case 'PROGRESS_UPDATE':
    case 'RECOVERY_COMPLETE':
      return null; // Does not change status
    default:
      return null;
  }
}

/**
 * Check if an action is valid for the current state
 */
export function isActionValid(state: RunState, action: RunAction): boolean {
  const targetStatus = getTargetStatus(action.type);

  // Actions that don't change status are always valid when running
  if (targetStatus === null) {
    if (action.type === 'PHASE_COMPLETE') {
      return state.status === 'running';
    }
    if (
      action.type === 'STEP_UPDATE' ||
      action.type === 'PROGRESS_UPDATE'
    ) {
      return state.status === 'running';
    }
    if (action.type === 'RECOVERY_COMPLETE') {
      return true; // Always valid
    }
    return false;
  }

  // Check if transition is valid
  return validTransition(state.status, targetStatus);
}
