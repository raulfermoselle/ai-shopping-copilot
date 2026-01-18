/**
 * Page Interactor Types
 *
 * Defines the abstraction layer that enables shared business logic
 * to work across Playwright (main codebase) and Chrome Extension.
 *
 * DESIGN PRINCIPLE: Keep this interface minimal but sufficient.
 * Each method should map to a common browser operation, not a business action.
 */

// =============================================================================
// Selector Types
// =============================================================================

/**
 * A chain of selectors to try in order (primary + fallbacks)
 */
export interface SelectorChain {
  /** Unique identifier for this selector chain */
  id: string;
  /** Primary selector to try first */
  primary: string;
  /** Fallback selectors to try if primary fails */
  fallbacks: string[];
  /** Description for logging */
  description?: string;
}

/**
 * Result of finding an element
 */
export interface FindResult {
  /** Opaque reference to the found element (platform-specific) */
  elementRef: unknown;
  /** Which selector from the chain was used (0 = primary) */
  selectorIndex: number;
  /** The actual selector that matched */
  matchedSelector: string;
}

// =============================================================================
// Cart State Types
// =============================================================================

/**
 * Snapshot of cart state for verification
 */
export interface CartState {
  /** Number of items in cart (null if couldn't detect) */
  itemCount: number | null;
  /** Cart total in cents (null if couldn't detect) */
  totalCents: number | null;
  /** Timestamp when state was captured */
  capturedAt: number;
}

// =============================================================================
// Popup Types
// =============================================================================

/**
 * Pattern for detecting and dismissing popups
 */
export interface PopupPattern {
  /** Unique name for this pattern */
  name: string;
  /** CSS selector(s) to find the dismiss element */
  selector: string;
  /** Text to match in the element (optional) */
  textMatch?: string;
  /** Whether to use exact text match (default: false = substring) */
  exactMatch?: boolean;
  /** Priority (higher = check first) */
  priority: number;
  /** Skip this pattern if reorder modal is visible */
  skipIfReorderModal?: boolean;
  /** Description for logging */
  description?: string;
}

/**
 * Patterns for dangerous buttons that should NEVER be clicked
 */
export interface DangerousButtonPattern {
  /** Pattern to match in text content */
  textPattern?: string;
  /** Pattern to match in class name */
  classPattern?: string;
  /** Pattern to match in data-target attribute */
  dataTargetPattern?: string;
}

// =============================================================================
// Modal Types
// =============================================================================

/**
 * Type of reorder modal detected
 */
export type ReorderModalType =
  | 'merge' // Cart has items - shows "Juntar" (merge) and "Eliminar" (replace) buttons
  | 'replace' // Cart empty - shows "Encomendar de novo" (reorder) confirmation
  | 'removal' // Cart removal confirmation - shows "Cancelar" and "Confirmar"
  | 'none'; // No modal visible

/**
 * Result of detecting reorder modal
 */
export interface ReorderModalResult {
  /** Type of modal detected */
  type: ReorderModalType;
  /** Whether a modal was found */
  found: boolean;
}

// =============================================================================
// Navigation Types
// =============================================================================

/**
 * Options for waiting for navigation
 */
export interface NavigationOptions {
  /** Timeout in ms */
  timeout?: number;
  /** Wait for this URL pattern */
  urlPattern?: RegExp;
}

// =============================================================================
// Logging Types
// =============================================================================

/**
 * Logger interface for the interactor
 */
export interface ILogger {
  info(component: string, message: string, data?: Record<string, unknown>): void;
  warn(component: string, message: string, data?: Record<string, unknown>): void;
  error(component: string, message: string, data?: Record<string, unknown>): void;
  debug(component: string, message: string, data?: Record<string, unknown>): void;
}

// =============================================================================
// Main Interface
// =============================================================================

/**
 * Page Interactor Interface
 *
 * This is the abstraction that both Playwright and Chrome Extension implement.
 * The CartMergeFlow uses this interface to perform browser interactions without
 * knowing which platform is executing.
 */
export interface IPageInteractor {
  // =========================================================================
  // Element Finding
  // =========================================================================

  /**
   * Find an element using a selector chain (tries fallbacks if primary fails)
   *
   * @param chain - Selector chain to try
   * @param options - Find options
   * @returns FindResult if found, null if not found
   */
  findElement(
    chain: SelectorChain,
    options?: { timeout?: number; visible?: boolean }
  ): Promise<FindResult | null>;

  /**
   * Find all elements matching a selector
   *
   * @param selector - CSS selector
   * @param options - Find options
   * @returns Array of opaque element references
   */
  findAllElements(
    selector: string,
    options?: { timeout?: number }
  ): Promise<unknown[]>;

  // =========================================================================
  // Element Interaction
  // =========================================================================

  /**
   * Click an element
   *
   * @param elementRef - Element reference from findElement
   * @param options - Click options
   */
  click(elementRef: unknown, options?: { timeout?: number }): Promise<void>;

  /**
   * Check if an element is visible
   *
   * @param elementRef - Element reference from findElement
   * @returns Whether the element is visible
   */
  isVisible(elementRef: unknown): Promise<boolean>;

  /**
   * Get text content of an element
   *
   * @param elementRef - Element reference from findElement
   * @returns Text content or null
   */
  getTextContent(elementRef: unknown): Promise<string | null>;

  /**
   * Get an attribute of an element
   *
   * @param elementRef - Element reference from findElement
   * @param name - Attribute name
   * @returns Attribute value or null
   */
  getAttribute(elementRef: unknown, name: string): Promise<string | null>;

  // =========================================================================
  // Cart State
  // =========================================================================

  /**
   * Get the current cart state (item count and total)
   */
  getCartState(): Promise<CartState>;

  // =========================================================================
  // Popup Handling
  // =========================================================================

  /**
   * Dismiss any visible popups matching the given patterns
   *
   * @param patterns - Popup patterns to check
   * @returns Number of popups dismissed
   */
  dismissPopups(patterns: PopupPattern[]): Promise<number>;

  /**
   * Check if the reorder modal is visible
   */
  isReorderModalVisible(): Promise<ReorderModalResult>;

  /**
   * Attach an observer that auto-dismisses popups as they appear
   *
   * @param patterns - Popup patterns to watch for
   */
  attachPopupObserver(patterns: PopupPattern[]): Promise<void>;

  /**
   * Detach the popup observer
   */
  detachPopupObserver(): Promise<void>;

  // =========================================================================
  // Navigation
  // =========================================================================

  /**
   * Get the current page URL
   */
  getCurrentUrl(): Promise<string>;

  /**
   * Navigate to a URL
   *
   * @param url - URL to navigate to
   * @param options - Navigation options
   */
  navigateTo(url: string, options?: NavigationOptions): Promise<void>;

  /**
   * Wait for a specified amount of time
   *
   * @param ms - Milliseconds to wait
   */
  waitForTimeout(ms: number): Promise<void>;

  /**
   * Wait for navigation to complete (URL change or load)
   *
   * @param options - Navigation options
   */
  waitForNavigation(options?: NavigationOptions): Promise<void>;

  // =========================================================================
  // Screenshots (for debugging)
  // =========================================================================

  /**
   * Take a screenshot
   *
   * @param name - Name for the screenshot
   * @returns Screenshot path or data URL
   */
  screenshot(name: string): Promise<string>;

  // =========================================================================
  // Logging
  // =========================================================================

  /**
   * Get the logger instance
   */
  getLogger(): ILogger;
}
