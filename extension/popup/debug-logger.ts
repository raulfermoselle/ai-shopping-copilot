/**
 * Debug Logger for AI Shopping Copilot
 *
 * Persists logs to:
 * 1. chrome.storage.local (always)
 * 2. Local debug server at localhost:9222 (when running)
 *
 * To enable file-based logging, run: node extension/scripts/debug-server.mjs
 * Logs will be written to: extension/logs/debug.log
 */

const DEBUG_LOG_KEY = 'aisc_debug_logs';
const MAX_LOGS = 100;
const DEBUG_SERVER_URL = 'http://localhost:9222/log';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data: string | null;
}

/**
 * Send log entry to local debug server (fire-and-forget)
 */
function sendToDebugServer(entry: LogEntry): void {
  fetch(DEBUG_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {
    // Debug server not running - ignore silently
  });
}

/**
 * Log a debug message with timestamp
 */
async function debugLog(level: LogLevel, source: string, message: string, data: unknown = null): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    data: data ? JSON.stringify(data, null, 2) : null,
  };

  // Send to debug server (non-blocking)
  sendToDebugServer(entry);

  try {
    const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const logs: LogEntry[] = result[DEBUG_LOG_KEY] || [];

    logs.push(entry);

    // Keep only last MAX_LOGS entries
    while (logs.length > MAX_LOGS) {
      logs.shift();
    }

    await chrome.storage.local.set({ [DEBUG_LOG_KEY]: logs });

    // Also log to console for immediate visibility
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[AISC-${source}] ${message}`, data || '');
  } catch (err) {
    console.error('[AISC-DebugLogger] Failed to persist log:', err);
  }
}

/**
 * Logger interface
 */
export interface Logger {
  info: (source: string, message: string, data?: unknown) => void;
  warn: (source: string, message: string, data?: unknown) => void;
  error: (source: string, message: string, data?: unknown) => void;
  getLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<string>;
}

/**
 * Logger implementation
 */
export const logger: Logger = {
  info: (source: string, message: string, data?: unknown) => {
    void debugLog('info', source, message, data);
  },
  warn: (source: string, message: string, data?: unknown) => {
    void debugLog('warn', source, message, data);
  },
  error: (source: string, message: string, data?: unknown) => {
    void debugLog('error', source, message, data);
  },

  /**
   * Get all stored logs
   */
  async getLogs(): Promise<LogEntry[]> {
    try {
      const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
      return result[DEBUG_LOG_KEY] || [];
    } catch (err) {
      console.error('[AISC-DebugLogger] Failed to get logs:', err);
      return [];
    }
  },

  /**
   * Clear all logs
   */
  async clearLogs(): Promise<void> {
    try {
      await chrome.storage.local.remove(DEBUG_LOG_KEY);
    } catch (err) {
      console.error('[AISC-DebugLogger] Failed to clear logs:', err);
    }
  },

  /**
   * Export logs as JSON string
   */
  async exportLogs(): Promise<string> {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }
};

// Declare window.aiscLogger type for global access
declare global {
  interface Window {
    aiscLogger?: Logger;
  }
}

/**
 * Initialize logger and make it globally available
 */
export function initLogger(): void {
  window.aiscLogger = logger;
}

// Auto-initialize for backwards compatibility with non-module usage
initLogger();
