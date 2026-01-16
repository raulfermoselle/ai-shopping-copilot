/**
 * Orchestrator Module
 *
 * State machine and run orchestration for the Chrome Extension.
 * Manages the lifecycle of shopping session runs.
 *
 * SAFETY CONSTRAINT (ADR-007):
 * - NO 'checkout', 'purchase', 'payment', or 'order' states
 * - 'review' state is terminal for automation
 * - User must manually proceed with checkout in the browser
 *
 * @module
 *
 * @example
 * ```typescript
 * import {
 *   createStateMachine,
 *   createOrchestrator,
 * } from './core/orchestrator';
 *
 * // Create state machine with Chrome storage adapter
 * const stateMachine = createStateMachine({
 *   storage: chromeStorageAdapter,
 *   onStateChange: (state) => updateUI(state),
 * });
 *
 * // Create orchestrator with all dependencies
 * const orchestrator = createOrchestrator({
 *   storage: chromeStorageAdapter,
 *   messaging: chromeMessagingAdapter,
 *   tabs: chromeTabsAdapter,
 *   llm: anthropicAdapter,
 *   stateMachine,
 * });
 *
 * // Start a shopping run on the active tab
 * await orchestrator.startRun(activeTabId);
 *
 * // The orchestrator will:
 * // 1. Check login status (initializing)
 * // 2. Load orders and reorder (cart)
 * // 3. Find substitutes (substitution)
 * // 4. Extract delivery slots (slots)
 * // 5. Generate review pack (finalizing)
 * // 6. Transition to 'review' state
 *
 * // User can then approve or cancel
 * if (stateMachine.getState().status === 'review') {
 *   const reviewPack = await orchestrator.getReviewPack();
 *   // Show review UI to user
 * }
 * ```
 */

// =============================================================================
// State Machine Factory
// =============================================================================

export {
  createStateMachine,
  createStateMachineWithRecovery,
  createTestStateMachine,
} from './state-machine.js';

// =============================================================================
// Reducer & Transitions
// =============================================================================

export {
  runReducer,
  isActionValid,
  getTargetStatus,
  getNextPhase,
  getInitialStepForPhase,
  generateRunId,
  createInitialProgress,
} from './transitions.js';

export type { PhaseStep } from './transitions.js';

// =============================================================================
// Guards
// =============================================================================

export {
  isLoggedIn,
  canRetry,
  packReady,
  validTransition,
} from './transitions.js';

// =============================================================================
// Types
// =============================================================================

export type {
  // Actions
  RunAction,
  StartRunAction,
  PauseRunAction,
  ResumeRunAction,
  CancelRunAction,
  ApproveCartAction,
  ErrorOccurredAction,
  PhaseCompleteAction,
  StepUpdateAction,
  ProgressUpdateAction,
  RecoveryCompleteAction,

  // Guard types
  IsLoggedInGuard,
  CanRetryGuard,
  PackReadyGuard,
  ValidTransitionGuard,

  // State machine types
  StateMachine,
  StateMachineDeps,
  StateMachineConfig,
  StateChangeListener,

  // Audit types
  TransitionLogEntry,
  ActionType,

  // Re-exported state types
  RunState,
  RunStatus,
  RunPhase,
  RunProgress,
  RunError,
  LoginState,
  CartPhaseStep,
  SubstitutionPhaseStep,
  SlotsPhaseStep,
} from './types.js';

export { DEFAULT_STATE_MACHINE_CONFIG } from './types.js';

// =============================================================================
// Run Orchestrator
// =============================================================================

export {
  RunOrchestrator,
  createOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './orchestrator.js';

export type {
  OrchestratorDeps,
  OrchestratorConfig,
  RunContext,
  ReviewPack,
} from './orchestrator.js';
