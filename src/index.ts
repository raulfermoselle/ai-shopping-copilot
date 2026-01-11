/**
 * AI Shopping Copilot
 *
 * Main entry point for the cart preparation agent system.
 *
 * @module ai-shopping-copilot
 */

// Core types and utilities
export * from './types/index.js';
export * from './utils/index.js';

// Re-export agents as namespaces to avoid naming conflicts
export * as Coordinator from './agents/coordinator/index.js';
export * as CartBuilder from './agents/cart-builder/index.js';
export * as Substitution from './agents/substitution/index.js';
export * as StockPruner from './agents/stock-pruner/index.js';
export * as SlotScout from './agents/slot-scout/index.js';

// Re-export Control Panel and API as namespaces
export * as ControlPanel from './control-panel/index.js';
export * as API from './api/index.js';
