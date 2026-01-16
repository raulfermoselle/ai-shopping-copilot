/**
 * State Machine Factory
 *
 * Creates a state machine instance that wraps the pure reducer with:
 * - Automatic persistence to chrome.storage.session
 * - Subscription system for state change notifications
 * - Transition validation
 * - Audit logging for debugging
 *
 * SAFETY CONSTRAINT (ADR-007):
 * - The state machine has NO checkout/purchase/payment states
 * - 'review' is the terminal state for automation
 * - User must manually proceed with checkout in the browser
 *
 * @module
 */

import { DEFAULT_RUN_STATE } from '../../types/state.js';
import { runReducer, validTransition } from './transitions.js';

import type {
  StateMachine,
  StateMachineDeps,
  StateMachineConfig,
  StateChangeListener,
  RunAction,
  RunState,
  RunStatus,
  RunPhase,
  TransitionLogEntry,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: StateMachineConfig = {
  maxErrorCount: 3,
  debug: false,
};

/** Maximum number of transition log entries to keep */
const MAX_TRANSITION_LOG_SIZE = 100;

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new state machine instance.
 *
 * The state machine:
 * 1. Maintains run state in memory
 * 2. Persists every state change to chrome.storage.session
 * 3. Notifies all subscribers on state change
 * 4. Validates transitions before applying
 * 5. Logs all transitions for debugging/auditing
 *
 * @param deps - Dependencies (storage port, optional change callback)
 * @param config - Configuration options
 * @returns StateMachine instance
 *
 * @example
 * ```typescript
 * const stateMachine = createStateMachine({
 *   storage: chromeStorageAdapter,
 *   onStateChange: (state) => console.log('State changed:', state.status),
 * });
 *
 * stateMachine.dispatch({ type: 'START_RUN', payload: { tabId: 123 } });
 * ```
 */
export function createStateMachine(
  deps: StateMachineDeps,
  config: Partial<StateMachineConfig> = {}
): StateMachine {
  const { storage, onStateChange } = deps;
  const mergedConfig: StateMachineConfig = { ...DEFAULT_CONFIG, ...config };

  // Internal state
  let currentState: RunState = { ...DEFAULT_RUN_STATE };
  const listeners: Set<StateChangeListener> = new Set();
  const transitionLog: TransitionLogEntry[] = [];

  // =============================================================================
  // Internal Helpers
  // =============================================================================

  /**
   * Log a transition for debugging/auditing
   */
  function logTransition(
    prevState: RunState,
    newState: RunState,
    action: RunAction
  ): void {
    const entry: TransitionLogEntry = {
      timestamp: Date.now(),
      fromStatus: prevState.status,
      toStatus: newState.status,
      fromPhase: prevState.phase,
      toPhase: newState.phase,
      action: action.type,
      runId: newState.runId,
    };

    transitionLog.push(entry);

    // Keep log bounded
    if (transitionLog.length > MAX_TRANSITION_LOG_SIZE) {
      transitionLog.shift();
    }

    if (mergedConfig.debug) {
      console.log(
        `[STATE] ${entry.fromStatus} -> ${entry.toStatus} (${entry.action}) at ${new Date(entry.timestamp).toISOString()}`
      );
    }
  }

  /**
   * Persist state to storage
   */
  async function persistState(state: RunState): Promise<void> {
    try {
      await storage.set({ runState: state }, 'session');
    } catch (error) {
      // Log but don't throw - persistence failure shouldn't break state machine
      console.error('[STATE] Failed to persist state:', error);
    }
  }

  /**
   * Notify all listeners of state change
   */
  function notifyListeners(state: RunState): void {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        // Don't let a listener error break other listeners
        console.error('[STATE] Listener error:', error);
      }
    });

    // Also call the injected callback if provided
    if (onStateChange) {
      try {
        onStateChange(state);
      } catch (error) {
        console.error('[STATE] onStateChange callback error:', error);
      }
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================

  const stateMachine: StateMachine = {
    /**
     * Get current state (returns a shallow copy for immutability)
     */
    getState(): RunState {
      return { ...currentState };
    },

    /**
     * Dispatch an action to transition state.
     *
     * Flow:
     * 1. Run pure reducer to compute new state
     * 2. If state changed:
     *    a. Update internal state
     *    b. Log transition
     *    c. Persist to storage (async, non-blocking)
     *    d. Notify listeners
     * 3. Return new state
     */
    dispatch(action: RunAction): RunState {
      const prevState = currentState;
      const newState = runReducer(currentState, action);

      // Check if state actually changed
      if (newState === prevState) {
        // Reducer returned same object = no change (invalid transition or no-op)
        if (mergedConfig.debug) {
          console.log(
            `[STATE] Action ${action.type} did not change state (current: ${prevState.status})`
          );
        }
        return currentState;
      }

      // Update internal state
      currentState = newState;

      // Log the transition
      logTransition(prevState, newState, action);

      // Persist to storage (fire and forget - don't block on persistence)
      persistState(newState);

      // Notify listeners
      notifyListeners(newState);

      return currentState;
    },

    /**
     * Check if transition to target status is valid from current state
     */
    canTransition(to: RunStatus): boolean {
      return validTransition(currentState.status, to);
    },

    /**
     * Get current phase (null if not in running status)
     */
    getCurrentPhase(): RunPhase | null {
      if (currentState.status !== 'running') {
        return null;
      }
      return currentState.phase;
    },

    /**
     * Subscribe to state changes.
     * Returns unsubscribe function.
     *
     * @param listener - Callback invoked on every state change
     * @returns Unsubscribe function
     */
    subscribe(listener: StateChangeListener): () => void {
      listeners.add(listener);

      // Return unsubscribe function
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return stateMachine;
}

// =============================================================================
// Recovery Helper
// =============================================================================

/**
 * Load persisted state from storage and create a state machine.
 * Used when service worker restarts and needs to recover state.
 *
 * @param deps - Dependencies
 * @param config - Configuration
 * @returns Promise resolving to state machine with recovered state
 *
 * @example
 * ```typescript
 * // On service worker startup
 * const stateMachine = await createStateMachineWithRecovery({
 *   storage: chromeStorageAdapter,
 * });
 *
 * if (stateMachine.getState().recoveryNeeded) {
 *   // Resume interrupted operation
 * }
 * ```
 */
export async function createStateMachineWithRecovery(
  deps: StateMachineDeps,
  config: Partial<StateMachineConfig> = {}
): Promise<StateMachine> {
  const { storage } = deps;

  // Try to load persisted state
  let recoveredState: RunState = { ...DEFAULT_RUN_STATE };

  try {
    const stored = await storage.get<{ runState: RunState }>(['runState'], 'session');

    if (stored.runState) {
      recoveredState = stored.runState;

      // Check if we were in the middle of a run when terminated
      if (recoveredState.status === 'running') {
        const timeSinceUpdate = Date.now() - recoveredState.updatedAt;

        // If more than 30 seconds since last update, we likely terminated unexpectedly
        if (timeSinceUpdate > 30000) {
          recoveredState = {
            ...recoveredState,
            recoveryNeeded: true,
          };
        }
      }
    }
  } catch (error) {
    console.error('[STATE] Failed to load persisted state:', error);
    // Continue with default state
  }

  // Create state machine
  const stateMachine = createStateMachine(deps, config);

  // If we recovered state, we need to set it manually
  // This is a bit of a hack - we're bypassing the reducer to restore state
  if (recoveredState !== DEFAULT_RUN_STATE) {
    // Directly set the internal state by dispatching a special recovery action
    // Actually, let's properly handle this by persisting the recovered state
    // and letting the state machine pick it up through a recovery mechanism

    // For now, we'll create a new state machine with the recovered state
    // by using a wrapper that overrides getState initially
    return createStateMachineFromState(deps, recoveredState, config);
  }

  return stateMachine;
}

/**
 * Create a state machine initialized with a specific state.
 * Used for recovery scenarios.
 *
 * @internal
 */
function createStateMachineFromState(
  deps: StateMachineDeps,
  initialState: RunState,
  config: Partial<StateMachineConfig> = {}
): StateMachine {
  const { storage, onStateChange } = deps;
  const mergedConfig: StateMachineConfig = { ...DEFAULT_CONFIG, ...config };

  // Start with the provided initial state
  let currentState: RunState = { ...initialState };
  const listeners: Set<StateChangeListener> = new Set();
  const transitionLog: TransitionLogEntry[] = [];

  function logTransition(
    prevState: RunState,
    newState: RunState,
    action: RunAction
  ): void {
    const entry: TransitionLogEntry = {
      timestamp: Date.now(),
      fromStatus: prevState.status,
      toStatus: newState.status,
      fromPhase: prevState.phase,
      toPhase: newState.phase,
      action: action.type,
      runId: newState.runId,
    };

    transitionLog.push(entry);

    if (transitionLog.length > MAX_TRANSITION_LOG_SIZE) {
      transitionLog.shift();
    }

    if (mergedConfig.debug) {
      console.log(
        `[STATE] ${entry.fromStatus} -> ${entry.toStatus} (${entry.action}) at ${new Date(entry.timestamp).toISOString()}`
      );
    }
  }

  async function persistState(state: RunState): Promise<void> {
    try {
      await storage.set({ runState: state }, 'session');
    } catch (error) {
      console.error('[STATE] Failed to persist state:', error);
    }
  }

  function notifyListeners(state: RunState): void {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('[STATE] Listener error:', error);
      }
    });

    if (onStateChange) {
      try {
        onStateChange(state);
      } catch (error) {
        console.error('[STATE] onStateChange callback error:', error);
      }
    }
  }

  return {
    getState(): RunState {
      return { ...currentState };
    },

    dispatch(action: RunAction): RunState {
      const prevState = currentState;
      const newState = runReducer(currentState, action);

      if (newState === prevState) {
        if (mergedConfig.debug) {
          console.log(
            `[STATE] Action ${action.type} did not change state (current: ${prevState.status})`
          );
        }
        return currentState;
      }

      currentState = newState;
      logTransition(prevState, newState, action);
      persistState(newState);
      notifyListeners(newState);

      return currentState;
    },

    canTransition(to: RunStatus): boolean {
      return validTransition(currentState.status, to);
    },

    getCurrentPhase(): RunPhase | null {
      if (currentState.status !== 'running') {
        return null;
      }
      return currentState.phase;
    },

    subscribe(listener: StateChangeListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// =============================================================================
// Testing Helpers
// =============================================================================

/**
 * Create a state machine with a fake storage adapter for testing.
 * State changes are stored in memory only.
 *
 * @param initialState - Optional initial state
 * @returns StateMachine for testing
 */
export function createTestStateMachine(
  initialState: Partial<RunState> = {}
): StateMachine {
  // Simple in-memory storage for tests
  const memoryStorage: Record<string, unknown> = {};

  const fakeStorage = {
    get: async <T>(keys: (keyof T)[]): Promise<Partial<T>> => {
      const result: Partial<T> = {};
      for (const key of keys) {
        if (key in memoryStorage) {
          (result as Record<string, unknown>)[key as string] = memoryStorage[key as string];
        }
      }
      return result;
    },
    set: async <T>(items: T): Promise<void> => {
      Object.assign(memoryStorage, items);
    },
    remove: async (): Promise<void> => {},
    clear: async (): Promise<void> => {
      Object.keys(memoryStorage).forEach((key) => delete memoryStorage[key]);
    },
    addChangeListener: (): (() => void) => () => {},
  };

  const fullInitialState: RunState = {
    ...DEFAULT_RUN_STATE,
    ...initialState,
  };

  return createStateMachineFromState(
    { storage: fakeStorage as any },
    fullInitialState,
    { debug: false }
  );
}
