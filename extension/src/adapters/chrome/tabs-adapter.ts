/**
 * Chrome Tabs Adapter
 *
 * Implements ITabsPort using Chrome Extension APIs (Manifest V3).
 * Provides tab management, navigation, script execution, and wait utilities.
 */

import type {
  ITabsPort,
  TabInfo,
  TabQueryOptions,
  TabUpdateOptions,
  TabUpdateInfo,
  TabUpdateListener,
} from '../../ports/tabs.js';

/** Default timeout for wait operations (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Maps a Chrome Tab object to our TabInfo interface.
 * Only includes optional properties when they have values (not undefined).
 */
function mapChromeTabToTabInfo(tab: chrome.tabs.Tab): TabInfo {
  const result: TabInfo = {
    id: tab.id ?? -1,
    active: tab.active,
    loading: tab.status === 'loading',
    windowId: tab.windowId,
  };

  // Only set optional properties if they have values
  if (tab.url !== undefined) {
    result.url = tab.url;
  }
  if (tab.title !== undefined) {
    result.title = tab.title;
  }

  return result;
}

/**
 * Maps Chrome's changeInfo to our TabUpdateInfo format.
 * Only includes optional properties when they have values (not undefined).
 */
function mapChangeInfoToTabUpdateInfo(
  changeInfo: chrome.tabs.TabChangeInfo
): TabUpdateInfo {
  const result: TabUpdateInfo = {};

  // Only set optional properties if they have values
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    result.status = changeInfo.status;
  }
  if (changeInfo.url !== undefined) {
    result.url = changeInfo.url;
  }
  if (changeInfo.title !== undefined) {
    result.title = changeInfo.title;
  }

  return result;
}

/**
 * Converts a wildcard URL pattern (e.g., "https://example.com/*")
 * to a RegExp for matching.
 */
function wildcardToRegExp(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Convert * to .*
  const regexPattern = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Checks if a URL matches a pattern (string wildcard or RegExp)
 */
function urlMatchesPattern(url: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(url);
  }
  // String pattern with wildcard support
  const regex = wildcardToRegExp(pattern);
  return regex.test(url);
}

/**
 * Creates a timeout error with a descriptive message
 */
function createTimeoutError(operation: string, timeoutMs: number): Error {
  return new Error(
    `${operation} timed out after ${timeoutMs}ms`
  );
}

/**
 * ChromeTabsAdapter - Chrome Extension implementation of ITabsPort
 *
 * Uses chrome.tabs and chrome.scripting APIs (Manifest V3).
 */
export class ChromeTabsAdapter implements ITabsPort {
  /**
   * Get information about a specific tab
   * @param tabId - Tab ID to query
   * @returns Tab information or undefined if not found
   */
  async get(tabId: number): Promise<TabInfo | undefined> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return mapChromeTabToTabInfo(tab);
    } catch {
      // Tab not found or invalid ID
      return undefined;
    }
  }

  /**
   * Query tabs matching criteria
   * @param options - Query filter options
   * @returns Array of matching tabs
   */
  async query(options: TabQueryOptions): Promise<TabInfo[]> {
    const queryInfo: chrome.tabs.QueryInfo = {};

    if (options.active !== undefined) {
      queryInfo.active = options.active;
    }
    if (options.currentWindow !== undefined) {
      queryInfo.currentWindow = options.currentWindow;
    }
    if (options.url !== undefined) {
      queryInfo.url = options.url;
    }
    if (options.windowId !== undefined) {
      queryInfo.windowId = options.windowId;
    }

    const tabs = await chrome.tabs.query(queryInfo);
    return tabs.map(mapChromeTabToTabInfo);
  }

  /**
   * Update a tab's properties
   * @param tabId - Tab ID to update
   * @param options - Properties to update
   * @returns Updated tab info
   */
  async update(tabId: number, options: TabUpdateOptions): Promise<TabInfo> {
    const updateProperties: chrome.tabs.UpdateProperties = {};

    if (options.url !== undefined) {
      updateProperties.url = options.url;
    }
    if (options.active !== undefined) {
      updateProperties.active = options.active;
    }
    if (options.pinned !== undefined) {
      updateProperties.pinned = options.pinned;
    }

    const tab = await chrome.tabs.update(tabId, updateProperties);
    return mapChromeTabToTabInfo(tab);
  }

  /**
   * Create a new tab
   * @param options - Tab creation options
   * @returns Created tab info
   */
  async create(options: TabUpdateOptions): Promise<TabInfo> {
    const createProperties: chrome.tabs.CreateProperties = {};

    if (options.url !== undefined) {
      createProperties.url = options.url;
    }
    if (options.active !== undefined) {
      createProperties.active = options.active;
    }
    if (options.pinned !== undefined) {
      createProperties.pinned = options.pinned;
    }

    const tab = await chrome.tabs.create(createProperties);
    return mapChromeTabToTabInfo(tab);
  }

  /**
   * Close a tab
   * @param tabId - Tab ID to close
   */
  async close(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  /**
   * Add listener for tab updates
   * @param listener - Update callback
   * @returns Unsubscribe function
   */
  addUpdateListener(listener: TabUpdateListener): () => void {
    const chromeListener = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      listener(
        tabId,
        mapChangeInfoToTabUpdateInfo(changeInfo),
        mapChromeTabToTabInfo(tab)
      );
    };

    chrome.tabs.onUpdated.addListener(chromeListener);

    // Return unsubscribe function
    return () => {
      chrome.tabs.onUpdated.removeListener(chromeListener);
    };
  }

  /**
   * Execute a script in a tab's content script context (Manifest V3)
   * @param tabId - Target tab ID
   * @param script - Script function to execute
   * @returns Script execution results
   */
  async executeScript<T>(tabId: number, script: () => T): Promise<T[]> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: script,
    });

    // Extract results from InjectionResult array
    return results.map((result) => result.result as T);
  }

  /**
   * Wait for a tab to finish loading
   * @param tabId - Tab ID to wait for
   * @param timeoutMs - Maximum wait time (default: 30000)
   * @returns Tab info after loading
   * @throws Error if timeout exceeded
   */
  async waitForLoad(
    tabId: number,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<TabInfo> {
    // First check if tab is already loaded
    const currentTab = await this.get(tabId);
    if (currentTab && !currentTab.loading) {
      return currentTab;
    }

    return new Promise<TabInfo>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(createTimeoutError(`waitForLoad(tabId=${tabId})`, timeoutMs));
      }, timeoutMs);

      // Listen for tab updates
      unsubscribe = this.addUpdateListener(
        (updatedTabId, info, tab) => {
          if (updatedTabId === tabId && info.status === 'complete') {
            cleanup();
            resolve(tab);
          }
        }
      );
    });
  }

  /**
   * Wait for a tab to navigate to a URL matching a pattern
   * @param tabId - Tab ID to monitor
   * @param urlPattern - URL pattern to match (supports wildcards or RegExp)
   * @param timeoutMs - Maximum wait time (default: 30000)
   * @returns Tab info after matching URL reached
   * @throws Error if timeout exceeded
   */
  async waitForUrl(
    tabId: number,
    urlPattern: string | RegExp,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<TabInfo> {
    // First check if tab already matches the pattern
    const currentTab = await this.get(tabId);
    if (currentTab && currentTab.url && urlMatchesPattern(currentTab.url, urlPattern)) {
      return currentTab;
    }

    return new Promise<TabInfo>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        cleanup();
        const patternStr = urlPattern instanceof RegExp
          ? urlPattern.toString()
          : urlPattern;
        reject(
          createTimeoutError(
            `waitForUrl(tabId=${tabId}, pattern=${patternStr})`,
            timeoutMs
          )
        );
      }, timeoutMs);

      // Listen for tab updates
      unsubscribe = this.addUpdateListener(
        (updatedTabId, info, tab) => {
          if (updatedTabId === tabId && info.url) {
            if (urlMatchesPattern(info.url, urlPattern)) {
              cleanup();
              resolve(tab);
            }
          }
        }
      );
    });
  }
}

/**
 * Default export for convenience
 */
export default ChromeTabsAdapter;
