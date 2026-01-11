/**
 * CartBuilder Agent Implementation
 *
 * Builds the shopping cart by:
 * - Loading previous orders from Auchan.pt
 * - Loading favorite items
 * - Merging items into a draft cart
 * - Reporting cart differences
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';

export interface CartBuilderConfig {
  maxOrdersToLoad: number;
  includeFavorites: boolean;
}

export class CartBuilder {
  constructor(private readonly config: CartBuilderConfig) {}

  run(_context: AgentContext): Promise<AgentResult> {
    // Placeholder - implementation in future sprint
    void this.config;
    return Promise.reject(new Error('Not implemented'));
  }
}
