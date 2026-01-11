/**
 * Coordinator Agent Implementation
 *
 * Orchestrates the shopping cart preparation session by:
 * - Managing session state
 * - Delegating to worker agents (CartBuilder, Substitution, StockPruner, SlotScout)
 * - Handling errors and retries
 * - Creating the final review pack
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';

export interface CoordinatorConfig {
  maxRetries: number;
  sessionTimeout: number;
}

export class Coordinator {
  constructor(private readonly config: CoordinatorConfig) {}

  run(_context: AgentContext): Promise<AgentResult> {
    // Placeholder - implementation in future sprint
    void this.config;
    return Promise.reject(new Error('Not implemented'));
  }
}
