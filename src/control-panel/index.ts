/**
 * Control Panel Module
 *
 * User interface layer for the AI Shopping Copilot.
 * Provides session management, progress monitoring, and Review Pack presentation.
 *
 * Architecture: CLI-First with Renderer Abstraction
 * - SessionManager: Orchestrates session lifecycle via Coordinator API
 * - ControlPanelAPI: REST API for external integrations
 * - Renderer: Interface for UI implementations (CLI, Web)
 * - ReviewPackFormatter: Transforms ReviewPack into display-ready format
 *
 * Phase 1: CLI interface for terminal-based interaction
 * Phase 3: Web interface for browser-based interaction
 */

// Core types
export * from './types.js';

// Session management
export {
  SessionManager,
  createSessionManager,
  type SessionManagerConfig,
  type SessionManagerEvents,
} from './session-manager.js';

// API layer
export {
  ControlPanelAPI,
  createControlPanelAPI,
  createControlPanelAPIInstance,
} from './api.js';

// Re-export Coordinator types used by Control Panel
export type {
  ReviewPack as CoordinatorReviewPack,
  SessionStatus as CoordinatorSessionStatus,
  ReviewCartItem,
  ReviewCartDiff,
  ReviewWarning,
  UserAction,
  ReviewConfidence,
} from '../agents/coordinator/types.js';
