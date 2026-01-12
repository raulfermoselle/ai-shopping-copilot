/**
 * Progress Tracker Component
 *
 * Data layer for tracking and displaying session progress.
 * Provides real-time visibility into the session execution,
 * including phase tracking, worker status, and time estimates.
 *
 * Features:
 * - Real-time status updates
 * - Current phase indicator
 * - Worker status (running/complete/failed)
 * - Time estimates
 *
 * This is a data/logic layer - actual rendering will be done by UI components.
 */

import type {
  ProgressState,
  WorkerProgress,
  WorkerStatus,
  SessionPhase,
  PhaseDisplayInfo,
} from '../types.js';
import {
  PHASE_DISPLAY_INFO,
  createInitialProgressState,
  calculateOverallProgress,
} from '../types.js';

// =============================================================================
// Progress Tracker Class
// =============================================================================

/**
 * Class for managing and updating session progress state.
 */
export class ProgressTracker {
  private state: ProgressState;
  private readonly onUpdate: ((state: ProgressState) => void) | null;

  constructor(onUpdate?: (state: ProgressState) => void) {
    this.state = createInitialProgressState();
    this.onUpdate = onUpdate ?? null;
  }

  /**
   * Get the current progress state.
   */
  getState(): ProgressState {
    return { ...this.state };
  }

  /**
   * Update the session phase.
   */
  setPhase(phase: SessionPhase, action?: string): void {
    const phaseInfo = PHASE_DISPLAY_INFO[phase];
    this.state.phase = phase;
    this.state.phaseDescription = phaseInfo.description;
    if (action) {
      this.state.currentAction = action;
    }
    this.state.lastUpdate = new Date();
    this.notifyUpdate();
  }

  /**
   * Set the current action description.
   */
  setCurrentAction(action: string): void {
    this.state.currentAction = action;
    this.state.lastUpdate = new Date();
    this.notifyUpdate();
  }

  /**
   * Update a worker's status.
   */
  updateWorker(
    workerName: string,
    updates: Partial<Omit<WorkerProgress, 'name' | 'displayName'>>
  ): void {
    const workerIndex = this.state.workers.findIndex((w) => w.name === workerName);
    if (workerIndex === -1) return;

    const worker = this.state.workers[workerIndex];
    if (!worker) return;

    // Only apply defined properties from updates
    const updatedWorker: WorkerProgress = {
      name: worker.name,
      displayName: worker.displayName,
      status: updates.status !== undefined ? updates.status : worker.status,
      progress: updates.progress !== undefined ? updates.progress : worker.progress,
    };
    // Copy optional properties
    if (updates.totalItems !== undefined) {
      updatedWorker.totalItems = updates.totalItems;
    } else if (worker.totalItems !== undefined) {
      updatedWorker.totalItems = worker.totalItems;
    }
    if (updates.itemsProcessed !== undefined) {
      updatedWorker.itemsProcessed = updates.itemsProcessed;
    } else if (worker.itemsProcessed !== undefined) {
      updatedWorker.itemsProcessed = worker.itemsProcessed;
    }
    if (updates.startedAt !== undefined) {
      updatedWorker.startedAt = updates.startedAt;
    } else if (worker.startedAt !== undefined) {
      updatedWorker.startedAt = worker.startedAt;
    }
    if (updates.completedAt !== undefined) {
      updatedWorker.completedAt = updates.completedAt;
    } else if (worker.completedAt !== undefined) {
      updatedWorker.completedAt = worker.completedAt;
    }
    if (updates.durationMs !== undefined) {
      updatedWorker.durationMs = updates.durationMs;
    } else if (worker.durationMs !== undefined) {
      updatedWorker.durationMs = worker.durationMs;
    }
    if (updates.currentAction !== undefined) {
      updatedWorker.currentAction = updates.currentAction;
    } else if (worker.currentAction !== undefined) {
      updatedWorker.currentAction = worker.currentAction;
    }
    if (updates.errorMessage !== undefined) {
      updatedWorker.errorMessage = updates.errorMessage;
    } else if (worker.errorMessage !== undefined) {
      updatedWorker.errorMessage = worker.errorMessage;
    }
    this.state.workers[workerIndex] = updatedWorker;

    // Recalculate overall progress
    this.state.progress = calculateOverallProgress(this.state.workers);
    this.state.lastUpdate = new Date();
    this.notifyUpdate();
  }

  /**
   * Start a worker.
   */
  startWorker(workerName: string, action?: string): void {
    this.updateWorker(workerName, {
      status: 'running',
      startedAt: new Date(),
      currentAction: action,
      progress: 0,
    });
  }

  /**
   * Update worker progress.
   */
  setWorkerProgress(
    workerName: string,
    progress: number,
    action?: string,
    itemsProcessed?: number,
    totalItems?: number
  ): void {
    this.updateWorker(workerName, {
      progress: Math.max(0, Math.min(100, progress)),
      currentAction: action,
      itemsProcessed,
      totalItems,
    });
  }

  /**
   * Complete a worker.
   */
  completeWorker(workerName: string, durationMs?: number): void {
    const worker = this.state.workers.find((w) => w.name === workerName);
    const duration =
      durationMs ?? (worker?.startedAt ? Date.now() - worker.startedAt.getTime() : 0);

    this.updateWorker(workerName, {
      status: 'complete',
      progress: 100,
      completedAt: new Date(),
      durationMs: duration,
      currentAction: undefined,
    });
  }

  /**
   * Fail a worker.
   */
  failWorker(workerName: string, errorMessage: string): void {
    this.updateWorker(workerName, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage,
      currentAction: undefined,
    });
  }

  /**
   * Skip a worker.
   */
  skipWorker(workerName: string): void {
    this.updateWorker(workerName, {
      status: 'skipped',
      progress: 100,
    });
  }

  /**
   * Set time estimates.
   */
  setEstimates(estimatedEndTime?: Date, estimatedRemainingSeconds?: number): void {
    this.state.estimatedEndTime = estimatedEndTime;
    this.state.estimatedRemainingSeconds = estimatedRemainingSeconds;
    this.state.lastUpdate = new Date();
    this.notifyUpdate();
  }

  /**
   * Calculate and set estimates based on progress.
   */
  updateEstimates(): void {
    const elapsed = Date.now() - this.state.startTime.getTime();
    const progress = this.state.progress;

    if (progress > 5) {
      // Need some progress to estimate
      const estimatedTotal = (elapsed / progress) * 100;
      const remaining = Math.max(0, estimatedTotal - elapsed);

      this.state.estimatedRemainingSeconds = Math.round(remaining / 1000);
      this.state.estimatedEndTime = new Date(Date.now() + remaining);
      this.state.lastUpdate = new Date();
      this.notifyUpdate();
    }
  }

  /**
   * Reset the tracker to initial state.
   */
  reset(): void {
    this.state = createInitialProgressState();
    this.notifyUpdate();
  }

  /**
   * Notify listener of state update.
   */
  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.getState());
    }
  }
}

/**
 * Create a new progress tracker.
 */
export function createProgressTracker(
  onUpdate?: (state: ProgressState) => void
): ProgressTracker {
  return new ProgressTracker(onUpdate);
}

// =============================================================================
// Progress Formatting Utilities
// =============================================================================

/**
 * Worker status display information.
 */
export const WORKER_STATUS_DISPLAY: Record<
  WorkerStatus,
  { label: string; icon: string; color: string }
> = {
  pending: { label: 'Pending', icon: 'clock', color: 'gray' },
  running: { label: 'Running', icon: 'sync', color: 'blue' },
  complete: { label: 'Complete', icon: 'check', color: 'green' },
  failed: { label: 'Failed', icon: 'x', color: 'red' },
  skipped: { label: 'Skipped', icon: 'minus', color: 'gray' },
};

/**
 * Get status display info.
 */
export function getWorkerStatusDisplay(
  status: WorkerStatus
): { label: string; icon: string; color: string } {
  return WORKER_STATUS_DISPLAY[status];
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format remaining time to human-readable string.
 */
export function formatRemainingTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return 'Calculating...';
  if (seconds < 60) return `About ${seconds} seconds remaining`;
  const minutes = Math.ceil(seconds / 60);
  return `About ${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
}

/**
 * Format progress percentage.
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress)}%`;
}

/**
 * Create a progress bar string for CLI display.
 */
export function createProgressBar(progress: number, width: number = 20): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
}

/**
 * Format worker progress for CLI display.
 */
export function formatWorkerProgressCLI(worker: WorkerProgress): string {
  const statusInfo = getWorkerStatusDisplay(worker.status);
  const progress = worker.status === 'running' ? ` ${formatProgress(worker.progress)}` : '';
  const duration =
    worker.status === 'complete' && worker.durationMs
      ? ` (${formatDuration(worker.durationMs)})`
      : '';
  const error = worker.status === 'failed' && worker.errorMessage ? ` - ${worker.errorMessage}` : '';
  const action = worker.currentAction ? ` - ${worker.currentAction}` : '';
  const items =
    worker.itemsProcessed !== undefined && worker.totalItems !== undefined
      ? ` [${worker.itemsProcessed}/${worker.totalItems}]`
      : '';

  return `  ${worker.displayName}: ${statusInfo.label}${progress}${items}${duration}${error}${action}`;
}

/**
 * Format full progress state for CLI display.
 */
export function formatProgressStateCLI(state: ProgressState): string {
  const lines: string[] = [];

  // Header
  const phaseInfo = PHASE_DISPLAY_INFO[state.phase];
  lines.push(`=== ${phaseInfo.displayName} ===`);
  lines.push(`${state.currentAction}`);
  lines.push('');

  // Progress bar
  lines.push(`Overall: ${createProgressBar(state.progress)} ${formatProgress(state.progress)}`);
  if (state.estimatedRemainingSeconds !== undefined) {
    lines.push(formatRemainingTime(state.estimatedRemainingSeconds));
  }
  lines.push('');

  // Workers
  lines.push('Workers:');
  state.workers.forEach((worker) => {
    lines.push(formatWorkerProgressCLI(worker));
  });

  // Timing
  lines.push('');
  const elapsed = Date.now() - state.startTime.getTime();
  lines.push(`Elapsed: ${formatDuration(elapsed)}`);

  return lines.join('\n');
}

// =============================================================================
// Progress State Utilities
// =============================================================================

/**
 * Check if session is in a terminal state.
 */
export function isTerminalPhase(phase: SessionPhase): boolean {
  return ['review_ready', 'completed', 'cancelled', 'error'].includes(phase);
}

/**
 * Check if session is in an error state.
 */
export function isErrorPhase(phase: SessionPhase): boolean {
  return ['cancelled', 'error'].includes(phase);
}

/**
 * Check if all workers are complete.
 */
export function areAllWorkersComplete(workers: WorkerProgress[]): boolean {
  return workers.every(
    (w) => w.status === 'complete' || w.status === 'skipped' || w.status === 'failed'
  );
}

/**
 * Check if any worker has failed.
 */
export function hasFailedWorker(workers: WorkerProgress[]): boolean {
  return workers.some((w) => w.status === 'failed');
}

/**
 * Get the currently running worker.
 */
export function getRunningWorker(workers: WorkerProgress[]): WorkerProgress | undefined {
  return workers.find((w) => w.status === 'running');
}

/**
 * Get failed workers.
 */
export function getFailedWorkers(workers: WorkerProgress[]): WorkerProgress[] {
  return workers.filter((w) => w.status === 'failed');
}

/**
 * Calculate total duration from worker durations.
 */
export function calculateTotalDuration(workers: WorkerProgress[]): number {
  return workers.reduce((total, w) => total + (w.durationMs ?? 0), 0);
}

// =============================================================================
// Phase Transition Logic
// =============================================================================

/**
 * Standard phase sequence.
 */
export const PHASE_SEQUENCE: SessionPhase[] = [
  'initializing',
  'authenticating',
  'loading_orders',
  'building_cart',
  'checking_availability',
  'finding_substitutes',
  'pruning_stock',
  'scouting_slots',
  'generating_review',
  'review_ready',
];

/**
 * Get the next phase in the sequence.
 */
export function getNextPhase(currentPhase: SessionPhase): SessionPhase | null {
  const index = PHASE_SEQUENCE.indexOf(currentPhase);
  if (index === -1 || index === PHASE_SEQUENCE.length - 1) return null;
  const nextPhase = PHASE_SEQUENCE[index + 1];
  return nextPhase ?? null;
}

/**
 * Get the phase index for progress calculation.
 */
export function getPhaseIndex(phase: SessionPhase): number {
  return PHASE_SEQUENCE.indexOf(phase);
}

/**
 * Calculate phase-based progress.
 */
export function calculatePhaseProgress(phase: SessionPhase): number {
  const index = getPhaseIndex(phase);
  if (index === -1) return 0;
  return Math.round((index / (PHASE_SEQUENCE.length - 1)) * 100);
}

// =============================================================================
// Progress Event Types
// =============================================================================

/**
 * Progress event types for event-driven updates.
 */
export type ProgressEventType =
  | 'phase_changed'
  | 'worker_started'
  | 'worker_progress'
  | 'worker_completed'
  | 'worker_failed'
  | 'worker_skipped'
  | 'action_changed'
  | 'estimates_updated';

/**
 * Progress event payload.
 */
export interface ProgressEvent {
  type: ProgressEventType;
  timestamp: Date;
  data: {
    phase?: SessionPhase;
    workerName?: string;
    progress?: number;
    action?: string;
    error?: string;
  };
}

/**
 * Create a progress event.
 */
export function createProgressEvent(
  type: ProgressEventType,
  data: ProgressEvent['data']
): ProgressEvent {
  return {
    type,
    timestamp: new Date(),
    data,
  };
}

// =============================================================================
// Progress Simulation (for development/testing)
// =============================================================================

/**
 * Simulate a typical session progress flow.
 * Useful for development and testing the UI.
 */
export async function simulateSessionProgress(
  tracker: ProgressTracker,
  speedMultiplier: number = 1
): Promise<void> {
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms / speedMultiplier));

  // Initialize
  tracker.setPhase('initializing', 'Starting session...');
  await delay(500);

  // Authenticate
  tracker.setPhase('authenticating', 'Logging in to Auchan...');
  await delay(2000);

  // Load orders
  tracker.setPhase('loading_orders', 'Fetching order history...');
  tracker.startWorker('cart_builder', 'Loading recent orders');

  for (let i = 1; i <= 3; i++) {
    await delay(1000);
    tracker.setWorkerProgress('cart_builder', (i / 3) * 30, `Loading order ${i} of 3`, i, 3);
  }

  // Build cart
  tracker.setPhase('building_cart', 'Merging orders into cart...');
  tracker.setWorkerProgress('cart_builder', 50, 'Merging items');
  await delay(1500);

  tracker.setWorkerProgress('cart_builder', 80, 'Applying preferences');
  await delay(1000);

  tracker.completeWorker('cart_builder');

  // Check availability (skip for simulation)
  tracker.setPhase('checking_availability', 'Checking item availability...');
  tracker.skipWorker('substitution');
  await delay(500);

  // Skip pruning
  tracker.setPhase('pruning_stock', 'Analyzing household stock...');
  tracker.skipWorker('stock_pruner');
  await delay(500);

  // Skip slots
  tracker.setPhase('scouting_slots', 'Finding delivery slots...');
  tracker.skipWorker('slot_scout');
  await delay(500);

  // Generate review
  tracker.setPhase('generating_review', 'Preparing review pack...');
  await delay(1000);

  // Ready
  tracker.setPhase('review_ready', 'Review pack ready!');
}

// =============================================================================
// Re-exports
// =============================================================================

export {
  createInitialProgressState,
  calculateOverallProgress,
  PHASE_DISPLAY_INFO,
};

export type {
  ProgressState,
  WorkerProgress,
  WorkerStatus,
  SessionPhase,
  PhaseDisplayInfo,
};
