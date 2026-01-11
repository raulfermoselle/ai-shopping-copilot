/**
 * Coordinator Agent
 *
 * Orchestrates the shopping session lifecycle:
 * - Manages session state (init → login → cart building → review)
 * - Delegates to worker agents (CartBuilder in Phase 1)
 * - Generates Review Pack for user approval
 *
 * SAFETY: Never auto-purchases - stops at review_ready state.
 */

export * from './types.js';
export * from './coordinator.js';
