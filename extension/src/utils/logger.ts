/**
 * Centralized Debug Logger for AI Shopping Copilot Extension
 *
 * This logger sends all log entries to:
 * 1. Local debug server at localhost:9222 (for Claude Code to read)
 * 2. chrome.storage.local as backup (for debug.html page)
 * 3. Browser console (for immediate visibility)
 *
 * Works in all extension contexts: service worker, content scripts, popup.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.info('ComponentName', 'Something happened', { optional: 'data' });
 *
 * To enable file-based logging (for Claude Code):
 *   cd extension && npm run logs
 *   Logs written to: extension/logs/debug.log
 */

const DEBUG_SERVER_URL = 'http://localhost:9222/log';
const DEBUG_LOG_KEY = 'aisc_debug_logs';
const MAX_STORED_LOGS = 100;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data: string | null;
}

/**
 * Send log entry to local debug server (fire-and-forget).
 * Silent failure if server not running.
 */
function sendToDebugServer(entry: LogEntry): void {
  try {
    fetch(DEBUG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {
      // Debug server not running - ignore silently
    });
  } catch {
    // fetch may not be available or may throw - ignore
  }
}

/**
 * Store log entry in chrome.storage.local as backup.
 * Used by debug.html page for viewing logs in browser.
 */
async function storeInChromeStorage(entry: LogEntry): Promise<void> {
  try {
    // Check if chrome.storage is available (not available in all contexts)
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }

    const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const logs: LogEntry[] = result[DEBUG_LOG_KEY] || [];

    logs.push(entry);

    // Keep only last MAX_STORED_LOGS entries
    while (logs.length > MAX_STORED_LOGS) {
      logs.shift();
    }

    await chrome.storage.local.set({ [DEBUG_LOG_KEY]: logs });
  } catch {
    // Storage may not be available - ignore
  }
}

/**
 * Core logging function.
 */
function log(level: LogLevel, source: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data: data !== undefined ? JSON.stringify(data, null, 2) : null,
  };

  // 1. Send to debug server (non-blocking)
  sendToDebugServer(entry);

  // 2. Store in chrome.storage.local (non-blocking)
  void storeInChromeStorage(entry);

  // 3. Log to console for immediate visibility
  const prefix = `[AISC-${source}]`;
  const consoleArgs: unknown[] = [prefix, message];
  if (data !== undefined) {
    consoleArgs.push(data);
  }

  switch (level) {
    case 'error':
      console.error(...consoleArgs);
      break;
    case 'warn':
      console.warn(...consoleArgs);
      break;
    case 'debug':
      // Use console.debug for debug level
      console.debug(...consoleArgs);
      break;
    default:
      console.log(...consoleArgs);
  }
}

/**
 * Logger interface - use this throughout the extension.
 */
export const logger = {
  /**
   * Log debug message (verbose, for tracing)
   * @param source - Component name (e.g., 'ServiceWorker', 'Popup', 'ContentScript')
   * @param message - Log message
   * @param data - Optional data to include
   */
  debug(source: string, message: string, data?: unknown): void {
    log('debug', source, message, data);
  },

  /**
   * Log info message
   * @param source - Component name (e.g., 'ServiceWorker', 'Popup', 'ContentScript')
   * @param message - Log message
   * @param data - Optional data to include
   */
  info(source: string, message: string, data?: unknown): void {
    log('info', source, message, data);
  },

  /**
   * Log warning message
   */
  warn(source: string, message: string, data?: unknown): void {
    log('warn', source, message, data);
  },

  /**
   * Log error message
   */
  error(source: string, message: string, data?: unknown): void {
    log('error', source, message, data);
  },

  /**
   * Get all stored logs from chrome.storage.local
   */
  async getLogs(): Promise<LogEntry[]> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return [];
      }
      const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
      return result[DEBUG_LOG_KEY] || [];
    } catch {
      return [];
    }
  },

  /**
   * Clear all stored logs
   */
  async clearLogs(): Promise<void> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return;
      }
      await chrome.storage.local.remove(DEBUG_LOG_KEY);
    } catch {
      // Ignore errors
    }
  },
};

// Type export for consumers
export type { LogEntry, LogLevel };
