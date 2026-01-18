/**
 * LLM Module
 *
 * Anthropic Claude SDK integration for the AI Shopping Copilot.
 * Provides agentic patterns (tool-use, structured outputs) for
 * enhanced agent decision-making.
 *
 * Key exports:
 * - createLLMClient: Factory function for creating LLM clients
 * - LLMClientError: Typed error class for LLM operations
 * - Schemas: Zod schemas for structured outputs
 * - Tools: Tool definitions for Claude
 * - Prompts: System prompts for agents
 */

// =============================================================================
// Client
// =============================================================================

export { createLLMClient, isLLMAvailable, LLMClientError } from './client.js';

// =============================================================================
// Types
// =============================================================================

export type {
  // Configuration
  ClaudeModel,
  LLMClientConfig,
  LLMConfig,
  LLMRetryConfig,
  // Messages
  Message,
  MessageRole,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  // Tools
  ToolDefinition,
  ToolInputSchema,
  JSONSchemaProperty,
  ToolExecutionResult,
  ToolHandler,
  ToolHandlerRegistry,
  // Responses
  ToolUseResult,
  StructuredResult,
  TokenUsage,
  StopReason,
  // Errors
  LLMError,
  LLMErrorCode,
  // Client
  LLMClient,
} from './types.js';

// =============================================================================
// Schemas
// =============================================================================

export {
  // Common schemas
  ConfidenceExplanationSchema,
  // StockPruner schemas
  LLMPruneDecisionSchema,
  LLMPruneResponseSchema,
  // Substitution schemas
  ProductSimilaritySchema,
  LLMSubstitutionSuggestionSchema,
  LLMSubstitutionRankingSchema,
  // Category schemas
  CategoryClassificationSchema,
  BatchCategoryClassificationSchema,
  // Restock schemas
  LLMRestockEstimateSchema,
  // Utilities
  zodToJsonSchema,
} from './schemas.js';

export type {
  ConfidenceExplanation,
  LLMPruneDecision,
  LLMPruneResponse,
  ProductSimilarity,
  LLMSubstitutionSuggestion,
  LLMSubstitutionRanking,
  CategoryClassification,
  BatchCategoryClassification,
  LLMRestockEstimate,
} from './schemas.js';

// =============================================================================
// Tools
// =============================================================================

export {
  // Individual tools
  analyzeCartItemTool,
  classifyProductCategoryTool,
  makePruneDecisionTool,
  compareProductsTool,
  rankSubstitutesTool,
  documentReasoningTool,
  flagForUserReviewTool,
  makeSubstitutionDecisionTool,
  generateSearchQueriesToolDef,
  // Tool collections
  stockPrunerTools,
  substitutionTools,
  allTools,
  // Utilities
  getToolByName,
} from './tools.js';

// =============================================================================
// Token Manager
// =============================================================================

export {
  RateLimiter,
  UsageTracker,
  TokenManager,
  DEFAULT_RETRY_CONFIG,
  calculateBackoffDelay,
  withRetry,
} from './token-manager.js';

export type { RetryConfig } from './token-manager.js';

// =============================================================================
// Prompts
// =============================================================================

export {
  BASE_SYSTEM_PROMPT,
  COORDINATOR_PROMPT,
  CART_BUILDER_PROMPT,
  SLOT_SCOUT_PROMPT,
  getSystemPrompt,
  buildContextualPrompt,
} from './prompts/system.js';

export {
  STOCK_PRUNER_SYSTEM_PROMPT,
  buildItemAnalysisPrompt,
  buildBatchAnalysisPrompt,
  buildCategoryClassificationPrompt,
  buildExplanationPrompt,
} from './prompts/stock-pruner.js';

export type { BatchAnalysisItem } from './prompts/stock-pruner.js';
