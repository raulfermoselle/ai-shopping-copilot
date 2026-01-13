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
 * Phase 3: Enhanced UI with confidence, reasoning, preferences, and progress
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

// Phase 3: UI Components
export * from './components/index.js';

// CLI Renderer
export {
  CLIRenderer,
  createCLIRenderer,
  renderProgressBar,
  renderReviewPack,
  renderProgress,
} from './cli-renderer.js';

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
