/**
 * Coordinator Agent
 *
 * Orchestrates the shopping session lifecycle:
 * - Manages session state (init → login → cart building → review)
 * - Delegates to worker agents (CartBuilder in Phase 1)
 * - Generates Review Pack for user approval
 * - Collects post-run feedback (Phase 3)
 *
 * SAFETY: Never auto-purchases - stops at review_ready state.
 */

export * from './types.js';
export * from './coordinator.js';

// Phase 3: Feedback System
export * from './feedback/index.js';
