/**
 * SlotScout Agent Implementation
 *
 * Scouts delivery slots by:
 * - Navigating to slot selection
 * - Collecting available time windows
 * - Ranking by user preferences
 * - Presenting best options in review pack
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';

export interface SlotScoutConfig {
  maxSlotsToShow: number;
  preferredDays: string[];
  preferredTimeRanges: string[];
}

export class SlotScout {
  constructor(private readonly config: SlotScoutConfig) {}

  run(_context: AgentContext): Promise<AgentResult> {
    // Placeholder - implementation in future sprint
    void this.config;
    return Promise.reject(new Error('Not implemented'));
  }
}
