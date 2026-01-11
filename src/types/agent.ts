/**
 * Core Agent Types
 *
 * Shared type definitions for all agents in the system.
 */

import type { Page } from 'playwright';
import type { Logger } from '../utils/logger.js';

/**
 * Context provided to agents during execution
 */
export interface AgentContext {
  /** Playwright page instance */
  page: Page;
  /** Structured logger */
  logger: Logger;
  /** Session identifier */
  sessionId: string;
  /** Working memory for this session */
  workingMemory: WorkingMemory;
}

/**
 * Working memory for a session
 */
export interface WorkingMemory {
  /** Items currently in cart */
  cartItems: CartItem[];
  /** Items marked as unavailable */
  unavailableItems: CartItem[];
  /** Substitution decisions */
  substitutions: SubstitutionDecision[];
  /** Available delivery slots */
  deliverySlots: DeliverySlot[];
}

/**
 * Cart item representation
 */
export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  available: boolean;
}

/**
 * Substitution decision
 */
export interface SubstitutionDecision {
  originalItem: CartItem;
  substitute: CartItem | null;
  reason: string;
  confidence: number;
}

/**
 * Delivery slot
 */
export interface DeliverySlot {
  id: string;
  date: string;
  timeRange: string;
  available: boolean;
  price: number;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  logs: string[];
}
