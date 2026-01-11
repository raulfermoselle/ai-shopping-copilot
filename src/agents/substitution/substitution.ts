/**
 * Substitution Agent Implementation
 *
 * Handles product substitutions by:
 * - Checking item availability
 * - Finding suitable replacements
 * - Ranking substitutes by similarity
 * - Presenting options in review pack
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';

export interface SubstitutionConfig {
  maxSubstitutesPerItem: number;
  similarityThreshold: number;
}

export class Substitution {
  constructor(private readonly config: SubstitutionConfig) {}

  run(_context: AgentContext): Promise<AgentResult> {
    // Placeholder - implementation in future sprint
    void this.config;
    return Promise.reject(new Error('Not implemented'));
  }
}
