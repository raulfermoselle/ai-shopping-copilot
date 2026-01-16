/**
 * Fake Tabs Adapter
 *
 * In-memory implementation of ITabsPort for unit testing.
 * Maintains fake tab state and allows injecting tab info for tests.
 */

import type {
  ITabsPort,
  TabInfo,
  TabQueryOptions,
  TabUpdateOptions,
  TabUpdateInfo,
  TabUpdateListener,
} from '../../ports/tabs.js';

/**
 * Internal tab state with additional metadata
 */
interface InternalTab extends TabInfo {
  /** Scripts executed in this tab (for assertions) */
  executedScripts: Array<{
    script: () => unknown;
    timestamp: number;
    result: unknown;
  }>;
}

/**
 * FakeTabsAdapter - Mock tabs for tests
 *
 * Features:
 * - Maintain fake tab state in memory
 * - Allow injecting tab info for tests
 * - executeScript calls function directly and returns result
 * - waitForLoad/waitForUrl resolve immediately or after configured delay
 */
export class FakeTabsAdapter implements ITabsPort {
  private tabs: Map<number, InternalTab> = new Map();
  private updateListeners: TabUpdateListener[] = [];
  private nextTabId = 1;
  private defaultWindowId = 1;

  /** Configurable delay for waitForLoad/waitForUrl (ms) */
  loadDelay = 0;

  /** Whether executeScript should simulate errors */
  private executeScriptError: Error | null = null;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Reset adapter state
   */
  reset(): void {
    this.tabs.clear();
    this.updateListeners = [];
    this.nextTabId = 1;
    this.loadDelay = 0;
    this.executeScriptError = null;
  }

  /**
   * Add a fake tab for testing
   */
  addTab(tab: Partial<TabInfo>): TabInfo {
    const id = tab.id ?? this.nextTabId++;
    const fullTab: InternalTab = {
      id,
      url: tab.url ?? 'about:blank',
      title: tab.title ?? '',
      active: tab.active ?? false,
      loading: tab.loading ?? false,
      windowId: tab.windowId ?? this.defaultWindowId,
      executedScripts: [],
    };

    this.tabs.set(id, fullTab);
    return this.toPublicTab(fullTab);
  }

  /**
   * Get all tabs (for assertions)
   */
  getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values()).map(this.toPublicTab);
  }

  /**
   * Set a tab's state directly (for test setup)
   */
  setTabState(tabId: number, updates: Partial<TabInfo>): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      Object.assign(tab, updates);
    }
  }

  /**
   * Simulate tab update event
   */
  simulateTabUpdate(tabId: number, changeInfo: TabUpdateInfo): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Apply changes
    if (changeInfo.status === 'complete') {
      tab.loading = false;
    } else if (changeInfo.status === 'loading') {
      tab.loading = true;
    }
    if (changeInfo.url) {
      tab.url = changeInfo.url;
    }
    if (changeInfo.title) {
      tab.title = changeInfo.title;
    }

    // Notify listeners
    for (const listener of this.updateListeners) {
      try {
        listener(tabId, changeInfo, this.toPublicTab(tab));
      } catch (error) {
        console.error('FakeTabsAdapter: Update listener threw error:', error);
      }
    }
  }

  /**
   * Get scripts executed in a tab (for assertions)
   */
  getExecutedScripts(tabId: number): Array<{ script: () => unknown; result: unknown }> {
    const tab = this.tabs.get(tabId);
    return tab?.executedScripts ?? [];
  }

  /**
   * Configure executeScript to throw an error
   */
  setExecuteScriptError(error: Error | null): void {
    this.executeScriptError = error;
  }

  /**
   * Set the delay for waitForLoad/waitForUrl
   */
  setLoadDelay(delayMs: number): void {
    this.loadDelay = delayMs;
  }

  // ============================================================================
  // ITabsPort Implementation
  // ============================================================================

  async get(tabId: number): Promise<TabInfo | undefined> {
    const tab = this.tabs.get(tabId);
    return tab ? this.toPublicTab(tab) : undefined;
  }

  async query(options: TabQueryOptions): Promise<TabInfo[]> {
    return Array.from(this.tabs.values())
      .filter((tab) => this.matchesQuery(tab, options))
      .map(this.toPublicTab);
  }

  async update(tabId: number, options: TabUpdateOptions): Promise<TabInfo> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`FakeTabsAdapter: Tab ${tabId} not found`);
    }

    const changeInfo: TabUpdateInfo = {};

    if (options.url !== undefined) {
      tab.loading = true;
      changeInfo.status = 'loading';
      changeInfo.url = options.url;
      tab.url = options.url;
    }
    if (options.active !== undefined) {
      // Deactivate other tabs in same window if activating
      if (options.active) {
        for (const otherTab of this.tabs.values()) {
          if (otherTab.windowId === tab.windowId && otherTab.id !== tabId) {
            otherTab.active = false;
          }
        }
      }
      tab.active = options.active;
    }

    // Notify listeners
    if (Object.keys(changeInfo).length > 0) {
      for (const listener of this.updateListeners) {
        try {
          listener(tabId, changeInfo, this.toPublicTab(tab));
        } catch (error) {
          console.error('FakeTabsAdapter: Update listener threw error:', error);
        }
      }
    }

    return this.toPublicTab(tab);
  }

  async create(options: TabUpdateOptions): Promise<TabInfo> {
    const id = this.nextTabId++;
    const tab: InternalTab = {
      id,
      url: options.url ?? 'about:blank',
      title: '',
      active: options.active ?? true,
      loading: options.url ? true : false,
      windowId: this.defaultWindowId,
      executedScripts: [],
    };

    // Deactivate other tabs if this one is active
    if (tab.active) {
      for (const otherTab of this.tabs.values()) {
        if (otherTab.windowId === tab.windowId) {
          otherTab.active = false;
        }
      }
    }

    this.tabs.set(id, tab);
    return this.toPublicTab(tab);
  }

  async close(tabId: number): Promise<void> {
    this.tabs.delete(tabId);
  }

  addUpdateListener(listener: TabUpdateListener): () => void {
    this.updateListeners.push(listener);

    return () => {
      const index = this.updateListeners.indexOf(listener);
      if (index !== -1) {
        this.updateListeners.splice(index, 1);
      }
    };
  }

  async executeScript<T>(tabId: number, script: () => T): Promise<T[]> {
    if (this.executeScriptError) {
      throw this.executeScriptError;
    }

    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`FakeTabsAdapter: Tab ${tabId} not found`);
    }

    // Execute the script directly and capture result
    let result: T;
    try {
      result = script();
    } catch (error) {
      throw new Error(
        `FakeTabsAdapter: Script execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Record execution
    tab.executedScripts.push({
      script,
      timestamp: Date.now(),
      result,
    });

    // Return as array (Chrome returns array of results per frame)
    return [result];
  }

  async waitForLoad(tabId: number, timeoutMs = 30000): Promise<TabInfo> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`FakeTabsAdapter: Tab ${tabId} not found`);
    }

    // If already loaded, return immediately (with optional delay)
    if (!tab.loading) {
      if (this.loadDelay > 0) {
        await this.delay(this.loadDelay);
      }
      return this.toPublicTab(tab);
    }

    // Wait for load with timeout
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkLoaded = () => {
        const currentTab = this.tabs.get(tabId);
        if (!currentTab) {
          reject(new Error(`FakeTabsAdapter: Tab ${tabId} was closed`));
          return;
        }

        if (!currentTab.loading) {
          resolve(this.toPublicTab(currentTab));
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          reject(new Error(`FakeTabsAdapter: Timeout waiting for tab ${tabId} to load`));
          return;
        }

        // Check again after short delay
        setTimeout(checkLoaded, 50);
      };

      checkLoaded();
    });
  }

  async waitForUrl(
    tabId: number,
    urlPattern: string | RegExp,
    timeoutMs = 30000
  ): Promise<TabInfo> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`FakeTabsAdapter: Tab ${tabId} not found`);
    }

    // Check if already matches
    if (this.urlMatches(tab.url, urlPattern)) {
      if (this.loadDelay > 0) {
        await this.delay(this.loadDelay);
      }
      return this.toPublicTab(tab);
    }

    // Wait for URL match with timeout
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkUrl = () => {
        const currentTab = this.tabs.get(tabId);
        if (!currentTab) {
          reject(new Error(`FakeTabsAdapter: Tab ${tabId} was closed`));
          return;
        }

        if (this.urlMatches(currentTab.url, urlPattern)) {
          resolve(this.toPublicTab(currentTab));
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          reject(
            new Error(
              `FakeTabsAdapter: Timeout waiting for tab ${tabId} URL to match ${urlPattern}`
            )
          );
          return;
        }

        // Check again after short delay
        setTimeout(checkUrl, 50);
      };

      checkUrl();
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private toPublicTab(tab: InternalTab): TabInfo {
    const result: TabInfo = {
      id: tab.id,
      active: tab.active,
      loading: tab.loading,
      windowId: tab.windowId,
    };
    if (tab.url !== undefined) {
      result.url = tab.url;
    }
    if (tab.title !== undefined) {
      result.title = tab.title;
    }
    return result;
  }

  private matchesQuery(tab: InternalTab, options: TabQueryOptions): boolean {
    if (options.active !== undefined && tab.active !== options.active) {
      return false;
    }
    if (options.windowId !== undefined && tab.windowId !== options.windowId) {
      return false;
    }
    if (options.url) {
      const patterns = Array.isArray(options.url) ? options.url : [options.url];
      const matches = patterns.some((pattern) => this.urlMatches(tab.url, pattern));
      if (!matches) return false;
    }
    return true;
  }

  private urlMatches(url: string | undefined, pattern: string | RegExp): boolean {
    if (!url) return false;

    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*') // * becomes .*
      .replace(/\?/g, '.'); // ? becomes .

    return new RegExp(`^${regexPattern}$`).test(url);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a FakeTabsAdapter with optional initial tabs
 */
export function createFakeTabs(initialTabs?: Array<Partial<TabInfo>>): FakeTabsAdapter {
  const adapter = new FakeTabsAdapter();

  if (initialTabs) {
    for (const tab of initialTabs) {
      adapter.addTab(tab);
    }
  }

  return adapter;
}
