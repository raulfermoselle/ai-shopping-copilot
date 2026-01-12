/**
 * CartBuilder Agent
 *
 * Loads and merges prior orders, favorites, and builds the initial cart.
 * Phase 3: Includes preference learning for smarter cart recommendations.
 */

export * from './cart-builder.js';
export * from './types.js';

// Phase 3: Preference Learning Module
export * as learning from './learning/index.js';
