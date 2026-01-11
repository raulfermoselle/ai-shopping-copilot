/**
 * Coordinator API Module
 *
 * REST API handlers for Control Panel integration with the Coordinator agent.
 */

// Types
export * from './types.js';

// Handlers
export {
  handleStartSession,
  handleGetSession,
  handleGetReviewPack,
  handleApproveSession,
  handleCancelSession,
  configureApiLogger,
  configureContextFactory,
  type AgentContextFactory,
} from './coordinator-api.js';

// Session management utilities
export {
  getActiveSessions,
  clearSession,
  clearAllSessions,
  getSessionCount,
} from './coordinator-api.js';

// Testing utilities (re-exported for test access)
export { injectMockSession, getSessionRecord } from './coordinator-api.js';
