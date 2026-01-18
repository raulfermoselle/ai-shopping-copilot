/**
 * Run State Types
 *
 * Defines the state machine for shopping run orchestration.
 * State transitions are managed by the core orchestrator.
 */

/**
 * Run status - top-level state
 */
export type RunStatus =
  | 'idle'      // No run active, waiting for user to start
  | 'running'   // Active run in progress
  | 'paused'    // Run paused due to error or user action
  | 'review'    // Cart prepared, awaiting user approval
  | 'complete'; // Run finished, results saved

/**
 * Run phase - sub-state within 'running' status
 */
export type RunPhase =
  | 'initializing'  // Setting up run, checking login
  | 'cart'          // Loading orders, building cart
  | 'substitution'  // Finding replacements for unavailable items
  | 'slots'         // Collecting delivery slot options
  | 'finalizing';   // Preparing review pack

/**
 * Cart phase sub-state
 */
export type CartPhaseStep =
  | 'loading-orders'      // Extracting order history
  | 'selecting-order'     // Choosing order to reorder
  | 'reordering'          // Clicking reorder, handling modal
  | 'scanning-cart'       // Extracting current cart contents
  | 'comparing';          // Generating cart diff

/**
 * Substitution phase sub-state
 */
export type SubstitutionPhaseStep =
  | 'identifying'         // Finding unavailable items
  | 'searching'           // Searching for substitutes
  | 'scoring'             // Ranking candidates
  | 'proposing';          // Generating substitution proposals

/**
 * Slots phase sub-state
 */
export type SlotsPhaseStep =
  | 'navigating'          // Going to delivery slots page
  | 'extracting'          // Reading available slots
  | 'scoring';            // Ranking slots by preference

/**
 * Login state
 */
export interface LoginState {
  isLoggedIn: boolean;
  userName: string | null;
  loginTimestamp: number | null;
  /** Last page where login was detected */
  detectedOnUrl: string | null;
}

/**
 * Error information in state
 */
export interface RunError {
  /** Error code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Phase where error occurred */
  phase: RunPhase;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Progress tracking
 */
export interface RunProgress {
  /** Orders loaded from history */
  ordersLoaded: number;
  /** Total orders available */
  ordersTotal: number;
  /** Items processed in current phase */
  itemsProcessed: number;
  /** Total items to process */
  itemsTotal: number;
  /** Unavailable items found */
  unavailableItems: number;
  /** Substitutes proposed */
  substitutesProposed: number;
  /** Delivery slots found */
  slotsFound: number;
}

/**
 * Complete run state
 */
export interface RunState {
  /** Current run ID (null if idle) */
  runId: string | null;

  /** Top-level status */
  status: RunStatus;

  /** Current phase (only meaningful when status is 'running') */
  phase: RunPhase;

  /** Detailed step within phase */
  step: CartPhaseStep | SubstitutionPhaseStep | SlotsPhaseStep | null;

  /** Progress tracking */
  progress: RunProgress;

  /** Current error (if paused due to error) */
  error: RunError | null;

  /** Consecutive error count (for circuit breaker) */
  errorCount: number;

  /** Timestamp when run started */
  startedAt: number | null;

  /** Timestamp when run was last updated */
  updatedAt: number;

  /** Tab ID where run is executing */
  tabId: number | null;

  /** Service worker restart recovery flag */
  recoveryNeeded: boolean;
}

/**
 * Default/initial run state
 */
export const DEFAULT_RUN_STATE: RunState = {
  runId: null,
  status: 'idle',
  phase: 'initializing',
  step: null,
  progress: {
    ordersLoaded: 0,
    ordersTotal: 0,
    itemsProcessed: 0,
    itemsTotal: 0,
    unavailableItems: 0,
    substitutesProposed: 0,
    slotsFound: 0,
  },
  error: null,
  errorCount: 0,
  startedAt: null,
  updatedAt: Date.now(),
  tabId: null,
  recoveryNeeded: false,
};

/**
 * State transition validation
 */
export const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  idle: ['running'],
  running: ['paused', 'review', 'complete'],
  paused: ['running', 'idle'],
  review: ['complete', 'idle'],
  complete: ['idle'],
};

/**
 * Phase progression order
 */
export const PHASE_ORDER: RunPhase[] = [
  'initializing',
  'cart',
  'substitution',
  'slots',
  'finalizing',
];
