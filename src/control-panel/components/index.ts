/**
 * Control Panel Components
 *
 * Phase 3 components for enhanced Control Panel UI.
 * These components provide the data layer for:
 * - Confidence visualization
 * - Decision reasoning explanations
 * - Preference display and tracking
 * - Progress monitoring
 *
 * Architecture: Data/Logic Layer
 * - Components export builders, utilities, and formatters
 * - Actual UI rendering is done by renderer implementations (CLI, Web)
 * - Types are defined in ../types.ts
 */

// =============================================================================
// Confidence Display
// =============================================================================

export {
  // Builder
  ConfidenceBuilder,
  confidenceBuilder,

  // Factory functions
  createConfidenceDisplay,
  confidenceFromSubstitutionScore,
  confidenceFromPruningAnalysis,
  confidenceFromCartAnalysis,

  // Formatting utilities
  formatConfidencePercent,
  formatConfidenceWithLabel,
  formatConfidenceCLI,
  getConfidenceClasses,
  getConfidenceAnsiColor,

  // Aggregation
  calculateConfidenceStats,
  aggregateConfidences,

  // Constants
  CONFIDENCE_FACTORS,
  FACTOR_DESCRIPTIONS,

  // Level utilities
  getConfidenceLevel,
  getConfidenceColor,

  // Types
  type ConfidenceStats,
} from './confidence-display.js';

// =============================================================================
// Reasoning Display
// =============================================================================

export {
  // Builder
  ReasoningBuilder,
  reasoningBuilder,

  // Factory functions for common scenarios
  createAddedFromOrderReasoning,
  createAddedFromFavoritesReasoning,
  createPruningReasoning,
  createSubstitutionReasoning,
  createQuantityChangeReasoning,
  createKeptReasoning,

  // Formatting utilities
  formatReasoningCLI,
  formatReasoningSummary,
  getDecisionLabel,
  getDecisionIcon,

  // Aggregation
  summarizeDecisions,
  groupDecisionsByItem,
  getDecisionsNeedingReview,

  // Constants
  DECISION_LABELS,
  DECISION_ICONS,

  // Types
  type DecisionSummary,
} from './reasoning-display.js';

// =============================================================================
// Preference Display
// =============================================================================

export {
  // Builders
  PreferenceRuleBuilder,
  preferenceRuleBuilder,
  PreferenceApplicationBuilder,
  preferenceApplicationBuilder,
  PreferenceDisplayBuilder,
  preferenceDisplayBuilder,

  // Factory functions
  createBrandPreference,
  createCategoryExclusion,
  createPriceLimit,
  createQuantityDefault,
  createDietaryRestriction,

  // Formatting utilities
  formatPreferenceRuleCLI,
  formatApplicationCLI,
  formatPreferenceDisplayCLI,
  getPreferenceTypeLabel,
  getPreferenceTypeIcon,

  // Filtering and querying
  filterByType,
  filterBySource,
  getHighConfidenceRules,
  getRecentlyAppliedRules,
  getApplicationsForItem,
  getApplicationsForRule,

  // Constants
  PREFERENCE_TYPE_LABELS,
  PREFERENCE_TYPE_ICONS,

  // Sample data for development
  createSamplePreferenceRules,
  createSampleApplications,
} from './preference-display.js';

// =============================================================================
// Progress Tracker
// =============================================================================

export {
  // Main class
  ProgressTracker,
  createProgressTracker,

  // Formatting utilities
  formatDuration,
  formatRemainingTime,
  formatProgress,
  createProgressBar,
  formatWorkerProgressCLI,
  formatProgressStateCLI,
  getWorkerStatusDisplay,

  // State utilities
  isTerminalPhase,
  isErrorPhase,
  areAllWorkersComplete,
  hasFailedWorker,
  getRunningWorker,
  getFailedWorkers,
  calculateTotalDuration,

  // Phase utilities
  getNextPhase,
  getPhaseIndex,
  calculatePhaseProgress,

  // Events
  createProgressEvent,

  // Simulation
  simulateSessionProgress,

  // Constants
  WORKER_STATUS_DISPLAY,
  PHASE_SEQUENCE,
  PHASE_DISPLAY_INFO,
  createInitialProgressState,
  calculateOverallProgress,

  // Types
  type ProgressEventType,
  type ProgressEvent,
} from './progress-tracker.js';

// =============================================================================
// Re-export Types from parent module
// =============================================================================

export type {
  // Confidence types
  ConfidenceDisplay,
  ConfidenceFactor,
  ConfidenceLevel,

  // Reasoning types
  DecisionReasoning,
  DecisionType,
  SubstitutionDecisionReasoning,
  SubstitutionComparison,
  PruningReasoning,

  // Preference types
  PreferenceRule,
  PreferenceRuleType,
  PreferenceApplication,
  PreferenceDisplay,

  // Progress types
  ProgressState,
  WorkerProgress,
  WorkerStatus,
  SessionPhase,
  PhaseDisplayInfo,

  // Enhanced types
  EnhancedDisplayItem,
  EnhancedFormattedReviewPack,

  // API response types
  GetProgressResponse,
  GetPreferencesResponse,
  GetExplanationsResponse,
} from '../types.js';
