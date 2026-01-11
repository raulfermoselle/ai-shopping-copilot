/**
 * SlotScout Tool Types
 *
 * Input/output types for SlotScout tools.
 */

import type { DeliverySlot } from '../types.js';

// =============================================================================
// NavigateToSlotsTool
// =============================================================================

/**
 * Input for NavigateToSlotsTool
 */
export interface NavigateToSlotsInput {
  /** Whether to wait for slot content to load */
  waitForLoad?: boolean;
  /** Navigation timeout in ms */
  timeout?: number;
  /** Expected cart total (for validation) */
  cartTotal?: number;
}

/**
 * Output from NavigateToSlotsTool
 */
export interface NavigateToSlotsOutput {
  /** Whether navigation succeeded */
  success: boolean;
  /** Final URL reached */
  url: string;
  /** Screenshot path */
  screenshot?: string;
  /** Minimum order value (if detected) */
  minimumOrder?: number;
  /** Whether delivery slot selection is available */
  slotsAvailable: boolean;
}

// =============================================================================
// ExtractSlotsTool
// =============================================================================

/**
 * Input for ExtractSlotsTool
 */
export interface ExtractSlotsInput {
  /** Number of days ahead to extract */
  daysAhead?: number;
  /** Maximum slots to extract */
  maxSlots?: number;
  /** Whether to capture screenshots during extraction */
  captureScreenshots?: boolean;
}

/**
 * Output from ExtractSlotsTool
 */
export interface ExtractSlotsOutput {
  /** Extracted delivery slots */
  slots: DeliverySlot[];
  /** Number of days checked */
  daysChecked: number;
  /** Minimum order value (if found) */
  minimumOrder?: number;
  /** Source URL where slots were extracted */
  sourceUrl: string;
  /** Screenshot paths */
  screenshots?: string[];
}
