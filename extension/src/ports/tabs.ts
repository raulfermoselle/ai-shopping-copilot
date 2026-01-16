/**
 * Tabs Port
 *
 * Abstracts chrome.tabs API for tab management and navigation.
 */

/**
 * Tab information
 */
export interface TabInfo {
  /** Unique tab ID */
  id: number;
  /** Current URL of the tab */
  url?: string;
  /** Tab title */
  title?: string;
  /** Whether the tab is active in its window */
  active: boolean;
  /** Whether the tab is loading */
  loading: boolean;
  /** Window ID containing this tab */
  windowId: number;
}

/**
 * Options for updating a tab
 */
export interface TabUpdateOptions {
  /** URL to navigate to */
  url?: string;
  /** Whether to make the tab active */
  active?: boolean;
  /** Whether to pin the tab */
  pinned?: boolean;
}

/**
 * Options for querying tabs
 */
export interface TabQueryOptions {
  /** Filter by active state */
  active?: boolean;
  /** Filter by current window */
  currentWindow?: boolean;
  /** Filter by URL pattern (supports wildcards) */
  url?: string | string[];
  /** Filter by window ID */
  windowId?: number;
}

/**
 * Tab update event info
 */
export interface TabUpdateInfo {
  /** Loading status change */
  status?: 'loading' | 'complete';
  /** URL change */
  url?: string;
  /** Title change */
  title?: string;
}

/**
 * Tab update listener callback
 */
export type TabUpdateListener = (
  tabId: number,
  info: TabUpdateInfo,
  tab: TabInfo
) => void;

/**
 * ITabsPort - Interface for tab management operations
 *
 * Implementations:
 * - ChromeTabsAdapter: Real Chrome tabs API
 * - FakeTabsAdapter: Mock tabs for tests
 */
export interface ITabsPort {
  /**
   * Get information about a specific tab
   * @param tabId - Tab ID to query
   * @returns Tab information or undefined if not found
   */
  get(tabId: number): Promise<TabInfo | undefined>;

  /**
   * Query tabs matching criteria
   * @param options - Query filter options
   * @returns Array of matching tabs
   */
  query(options: TabQueryOptions): Promise<TabInfo[]>;

  /**
   * Update a tab's properties
   * @param tabId - Tab ID to update
   * @param options - Properties to update
   * @returns Updated tab info
   */
  update(tabId: number, options: TabUpdateOptions): Promise<TabInfo>;

  /**
   * Create a new tab
   * @param options - Tab creation options
   * @returns Created tab info
   */
  create(options: TabUpdateOptions): Promise<TabInfo>;

  /**
   * Close a tab
   * @param tabId - Tab ID to close
   */
  close(tabId: number): Promise<void>;

  /**
   * Add listener for tab updates
   * @param listener - Update callback
   * @returns Unsubscribe function
   */
  addUpdateListener(listener: TabUpdateListener): () => void;

  /**
   * Execute a script in a tab's content script context
   * @param tabId - Target tab ID
   * @param script - Script to execute
   * @returns Script execution results
   */
  executeScript<T>(tabId: number, script: () => T): Promise<T[]>;

  /**
   * Wait for a tab to finish loading
   * @param tabId - Tab ID to wait for
   * @param timeoutMs - Maximum wait time (default: 30000)
   * @returns Tab info after loading
   * @throws Error if timeout exceeded
   */
  waitForLoad(tabId: number, timeoutMs?: number): Promise<TabInfo>;

  /**
   * Wait for a tab to navigate to a URL matching a pattern
   * @param tabId - Tab ID to monitor
   * @param urlPattern - URL pattern to match (supports wildcards)
   * @param timeoutMs - Maximum wait time (default: 30000)
   * @returns Tab info after matching URL reached
   * @throws Error if timeout exceeded
   */
  waitForUrl(
    tabId: number,
    urlPattern: string | RegExp,
    timeoutMs?: number
  ): Promise<TabInfo>;
}

/**
 * Auchan.pt URL patterns for page detection
 */
export const AUCHAN_URL_PATTERNS = {
  /** Home page */
  home: 'https://www.auchan.pt/*',
  /** Login page */
  login: 'https://www.auchan.pt/*/login*',
  /** Order history */
  orderHistory: 'https://www.auchan.pt/*/historico-encomendas*',
  /** Cart page */
  cart: 'https://www.auchan.pt/*/cart*',
  /** Search results */
  search: 'https://www.auchan.pt/*/search*',
  /** Product page */
  product: 'https://www.auchan.pt/*/p/*',
  /** Delivery slots */
  deliverySlots: 'https://www.auchan.pt/*/checkout/delivery*',
} as const;

export type AuchanPage = keyof typeof AUCHAN_URL_PATTERNS;
