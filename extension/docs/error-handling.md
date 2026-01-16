# Error Handling & Recovery Patterns

**Sprint**: Sprint-EXT-A-001
**Module**: Extension
**Date**: 2026-01-16

---

## 1. Error Classification Hierarchy

### 1.1 Error Categories

```typescript
/**
 * Top-level error categories
 */
export type ErrorCategory =
  | 'network'      // Network/API failures
  | 'dom'          // DOM extraction failures
  | 'state'        // State machine violations
  | 'chrome'       // Chrome API failures
  | 'lifecycle'    // Service worker lifecycle
  | 'auth'         // Authentication failures
  | 'llm'          // LLM API failures
  | 'user';        // User-initiated (cancel, etc.)
```

### 1.2 Error Types by Category

```typescript
/**
 * Detailed error types
 */
export type ErrorType =
  // Network errors
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_SERVER_ERROR'

  // DOM errors
  | 'DOM_ELEMENT_NOT_FOUND'
  | 'DOM_SELECTOR_FAILED'
  | 'DOM_PAGE_CHANGED'
  | 'DOM_EXTRACTION_FAILED'

  // State errors
  | 'STATE_INVALID_TRANSITION'
  | 'STATE_CORRUPTION'
  | 'STATE_SYNC_FAILED'

  // Chrome API errors
  | 'CHROME_STORAGE_QUOTA'
  | 'CHROME_PERMISSION_DENIED'
  | 'CHROME_TAB_NOT_FOUND'
  | 'CHROME_MESSAGING_FAILED'

  // Lifecycle errors
  | 'LIFECYCLE_WORKER_TERMINATED'
  | 'LIFECYCLE_RECOVERY_FAILED'
  | 'LIFECYCLE_ALARM_FAILED'

  // Auth errors
  | 'AUTH_NOT_LOGGED_IN'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_LOGIN_REQUIRED'

  // LLM errors
  | 'LLM_API_KEY_MISSING'
  | 'LLM_API_KEY_INVALID'
  | 'LLM_RATE_LIMITED'
  | 'LLM_CONTEXT_TOO_LONG'
  | 'LLM_SERVER_ERROR'

  // User errors
  | 'USER_CANCELLED'
  | 'USER_TIMEOUT';
```

### 1.3 Error Structure

```typescript
interface ExtensionError {
  /** Error type for categorization */
  type: ErrorType;
  /** Error category */
  category: ErrorCategory;
  /** Human-readable message */
  message: string;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Retry strategy if recoverable */
  retryStrategy?: RetryStrategy;
  /** User-facing message */
  userMessage: string;
  /** Technical details for debugging */
  details?: {
    originalError?: Error;
    context?: Record<string, unknown>;
    timestamp: number;
    phase?: string;
    step?: string;
  };
}
```

---

## 2. Recovery Strategies

### 2.1 Retry Strategy Types

```typescript
type RetryStrategy =
  | 'immediate'        // Retry immediately
  | 'exponential'      // Exponential backoff
  | 'user-initiated'   // Wait for user to retry
  | 'skip'             // Skip and continue
  | 'abort';           // Abort the operation
```

### 2.2 Recovery Matrix

| Error Type | Strategy | Max Retries | Backoff | User Action |
|------------|----------|-------------|---------|-------------|
| `NETWORK_OFFLINE` | `user-initiated` | - | - | "Check your connection" |
| `NETWORK_TIMEOUT` | `exponential` | 3 | 1s, 2s, 4s | Auto-retry |
| `NETWORK_SERVER_ERROR` | `exponential` | 2 | 2s, 4s | Show error if fails |
| `DOM_ELEMENT_NOT_FOUND` | `immediate` | 3 | 500ms | Show error if fails |
| `DOM_PAGE_CHANGED` | `user-initiated` | - | - | "Page changed, refresh" |
| `STATE_INVALID_TRANSITION` | `abort` | 0 | - | "Restart run" |
| `CHROME_STORAGE_QUOTA` | `abort` | 0 | - | "Clear storage" |
| `LIFECYCLE_WORKER_TERMINATED` | `immediate` | 1 | - | Auto-recover |
| `AUTH_NOT_LOGGED_IN` | `user-initiated` | - | - | "Please log in" |
| `AUTH_SESSION_EXPIRED` | `user-initiated` | - | - | "Session expired" |
| `LLM_RATE_LIMITED` | `exponential` | 3 | 30s, 60s, 120s | Auto-retry |
| `LLM_API_KEY_MISSING` | `user-initiated` | - | - | "Set API key" |

### 2.3 Graceful Degradation

When LLM is unavailable, fall back to heuristics:

```typescript
async function enhanceWithLLM(items: CartItem[]): Promise<EnhancedDecisions> {
  try {
    const llmResult = await llmPort.complete(...);
    return mergeWithHeuristics(llmResult, heuristicDecisions);
  } catch (error) {
    if (isLLMError(error)) {
      // Log but don't fail
      logWarning('LLM unavailable, using heuristics only', error);
      return heuristicDecisions;
    }
    throw error;
  }
}
```

---

## 3. Service Worker Lifecycle Recovery

### 3.1 Termination Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│              Service Worker Active (running operation)               │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ On every state change:                                       │    │
│  │   1. Update runState.updatedAt = Date.now()                  │    │
│  │   2. Persist to chrome.storage.session                       │    │
│  │   3. Reset keep-alive alarm (1 minute)                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ On operation complete:                                       │    │
│  │   1. Save checkpoint with lastSuccessfulItem                 │    │
│  │   2. Clear keep-alive alarm if run complete                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (Chrome terminates after ~30s idle)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                Service Worker Terminated                             │
│                                                                      │
│  • In-memory state lost                                              │
│  • chrome.storage.session preserved                                  │
│  • Alarms still scheduled                                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (Alarm fires or message received)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Service Worker Restart (Recovery)                      │
│                                                                      │
│  1. Load runState from chrome.storage.session                       │
│  2. Check if recovery needed:                                       │
│     - runState.status === 'running'                                 │
│     - runState.updatedAt < (now - 30 seconds)                       │
│  3. If recovery needed:                                              │
│     - Set runState.recoveryNeeded = true                            │
│     - Log recovery event                                             │
│     - Resume from current phase/step                                │
│  4. Continue operation                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Checkpoint Structure

```typescript
interface RecoveryCheckpoint {
  /** Phase where checkpoint was taken */
  phase: RunPhase;
  /** Step within phase */
  step: string | null;
  /** Last successfully processed item ID */
  lastSuccessfulItem: string | null;
  /** Partial results accumulated so far */
  partialResults: {
    ordersLoaded?: OrderSummary[];
    cartItems?: CartItem[];
    unavailableItems?: CartItem[];
    substitutes?: SubstitutionProposal[];
    slots?: DeliverySlot[];
  };
  /** Timestamp of checkpoint */
  timestamp: number;
}
```

### 3.3 Phase-Specific Recovery

```typescript
async function recoverFromPhase(
  checkpoint: RecoveryCheckpoint
): Promise<void> {
  switch (checkpoint.phase) {
    case 'initializing':
      // Restart from beginning
      await startRun();
      break;

    case 'cart':
      if (checkpoint.partialResults.ordersLoaded) {
        // Skip order loading, continue from reorder
        await continueCartPhase(checkpoint);
      } else {
        // Restart cart phase
        await executeCartPhase();
      }
      break;

    case 'substitution':
      // Resume from last processed item
      const remaining = getUnprocessedItems(
        checkpoint.partialResults.unavailableItems,
        checkpoint.lastSuccessfulItem
      );
      await processSubstitutions(remaining);
      break;

    case 'slots':
      // Re-extract slots (idempotent)
      await executeSlotsPhase();
      break;

    case 'finalizing':
      // Resume pack generation
      await finalizePack(checkpoint.partialResults);
      break;
  }
}
```

---

## 4. User Notification Patterns

### 4.1 Notification Types

```typescript
type NotificationType =
  | 'info'      // Informational (blue)
  | 'success'   // Success (green)
  | 'warning'   // Warning (yellow)
  | 'error';    // Error (red)

interface UserNotification {
  type: NotificationType;
  title: string;
  message: string;
  /** Action user can take */
  action?: {
    label: string;
    handler: () => void;
  };
  /** Auto-dismiss after ms (0 = manual dismiss) */
  duration: number;
}
```

### 4.2 Error Message Mapping

```typescript
const USER_ERROR_MESSAGES: Record<ErrorType, string> = {
  // Network
  NETWORK_OFFLINE: 'You appear to be offline. Please check your connection.',
  NETWORK_TIMEOUT: 'The request took too long. Trying again...',
  NETWORK_SERVER_ERROR: 'Auchan.pt is having issues. Please try again later.',

  // DOM
  DOM_ELEMENT_NOT_FOUND: 'Could not find expected content on the page.',
  DOM_SELECTOR_FAILED: 'Page structure may have changed. Contact support.',
  DOM_PAGE_CHANGED: 'The page changed unexpectedly. Please refresh.',
  DOM_EXTRACTION_FAILED: 'Could not read page content. Please try again.',

  // State
  STATE_INVALID_TRANSITION: 'Something went wrong. Please restart the run.',
  STATE_CORRUPTION: 'State error detected. Please restart the run.',
  STATE_SYNC_FAILED: 'Could not save progress. Storage may be full.',

  // Chrome
  CHROME_STORAGE_QUOTA: 'Storage is full. Please clear some data.',
  CHROME_PERMISSION_DENIED: 'Extension permission denied.',
  CHROME_TAB_NOT_FOUND: 'Tab was closed. Please open Auchan.pt.',
  CHROME_MESSAGING_FAILED: 'Internal communication error.',

  // Lifecycle
  LIFECYCLE_WORKER_TERMINATED: 'Recovering from background pause...',
  LIFECYCLE_RECOVERY_FAILED: 'Recovery failed. Please restart.',
  LIFECYCLE_ALARM_FAILED: 'Could not schedule task.',

  // Auth
  AUTH_NOT_LOGGED_IN: 'Please log in to Auchan.pt first.',
  AUTH_SESSION_EXPIRED: 'Your session expired. Please log in again.',
  AUTH_LOGIN_REQUIRED: 'Login is required to continue.',

  // LLM
  LLM_API_KEY_MISSING: 'Please set your API key in settings.',
  LLM_API_KEY_INVALID: 'API key is invalid. Please check settings.',
  LLM_RATE_LIMITED: 'AI service is busy. Continuing without AI assistance.',
  LLM_CONTEXT_TOO_LONG: 'Too much data for AI. Using standard mode.',
  LLM_SERVER_ERROR: 'AI service error. Using standard mode.',

  // User
  USER_CANCELLED: 'Operation cancelled.',
  USER_TIMEOUT: 'Waiting too long for response.',
};
```

### 4.3 Notification Examples

```typescript
// Auto-retry notification
showNotification({
  type: 'warning',
  title: 'Connection Issue',
  message: 'Request timed out. Retrying... (attempt 2/3)',
  duration: 3000,
});

// User action required
showNotification({
  type: 'error',
  title: 'Login Required',
  message: 'Please log in to Auchan.pt to continue.',
  action: {
    label: 'Go to Login',
    handler: () => navigateToLogin(),
  },
  duration: 0, // Manual dismiss
});

// Graceful degradation
showNotification({
  type: 'info',
  title: 'AI Unavailable',
  message: 'Continuing with standard recommendations.',
  duration: 5000,
});
```

---

## 5. Logging Strategy

### 5.1 Log Levels

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: number;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}
```

### 5.2 What to Log

| Category | What to Log | Level |
|----------|-------------|-------|
| State | All transitions | `info` |
| State | Invalid transitions | `warn` |
| Phase | Phase start/complete | `info` |
| Phase | Phase errors | `error` |
| DOM | Selector failures | `warn` |
| DOM | Extraction results (summary) | `debug` |
| Network | Request start | `debug` |
| Network | Request failures | `error` |
| LLM | Request (without content) | `debug` |
| LLM | Errors | `warn` |
| Recovery | Recovery events | `info` |

### 5.3 What NOT to Log

- API keys (NEVER)
- Full user credentials
- Full response bodies (use summaries)
- PII beyond what's needed for debugging

### 5.4 Log Storage

```typescript
// Store recent logs in session storage for debugging
const MAX_LOG_ENTRIES = 500;

async function persistLog(entry: LogEntry): Promise<void> {
  const { logs = [] } = await storage.get('debugLogs', 'session');
  logs.push(entry);

  // Keep only recent entries
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
  }

  await storage.set({ debugLogs: logs }, 'session');
}
```

---

## 6. Circuit Breaker Pattern

### 6.1 Implementation

```typescript
interface CircuitBreaker {
  /** Current state */
  state: 'closed' | 'open' | 'half-open';
  /** Failure count in current window */
  failureCount: number;
  /** Last failure timestamp */
  lastFailure: number | null;
  /** When circuit opened */
  openedAt: number | null;
}

const CIRCUIT_CONFIG = {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
};

function shouldAllowRequest(circuit: CircuitBreaker): boolean {
  if (circuit.state === 'closed') return true;

  if (circuit.state === 'open') {
    const elapsed = Date.now() - (circuit.openedAt || 0);
    if (elapsed > CIRCUIT_CONFIG.resetTimeout) {
      circuit.state = 'half-open';
      return true;
    }
    return false;
  }

  // half-open: allow one request
  return true;
}

function recordSuccess(circuit: CircuitBreaker): void {
  circuit.failureCount = 0;
  circuit.state = 'closed';
}

function recordFailure(circuit: CircuitBreaker): void {
  circuit.failureCount++;
  circuit.lastFailure = Date.now();

  if (circuit.failureCount >= CIRCUIT_CONFIG.failureThreshold) {
    circuit.state = 'open';
    circuit.openedAt = Date.now();
  }
}
```

### 6.2 Usage

```typescript
// Apply to flaky operations
async function fetchWithCircuitBreaker<T>(
  circuit: CircuitBreaker,
  operation: () => Promise<T>
): Promise<T> {
  if (!shouldAllowRequest(circuit)) {
    throw new ExtensionError({
      type: 'NETWORK_SERVER_ERROR',
      message: 'Service temporarily unavailable',
      recoverable: true,
      retryStrategy: 'user-initiated',
    });
  }

  try {
    const result = await operation();
    recordSuccess(circuit);
    return result;
  } catch (error) {
    recordFailure(circuit);
    throw error;
  }
}
```

---

## 7. Error Boundary (UI)

### 7.1 Popup Error Boundary

```typescript
// In popup, catch unhandled errors and display gracefully
window.onerror = (message, source, lineno, colno, error) => {
  showErrorScreen({
    title: 'Something went wrong',
    message: 'The extension encountered an error. Please try again.',
    action: {
      label: 'Restart',
      handler: () => chrome.runtime.reload(),
    },
  });

  // Log for debugging
  logError('Unhandled error in popup', { message, source, lineno, error });

  return true; // Prevent default handling
};
```

### 7.2 Content Script Error Boundary

```typescript
// Content scripts should never throw to the page
function safeExecute<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    console.error('[AISC-CS] Error:', error);
    chrome.runtime.sendMessage({
      action: 'system.error',
      payload: {
        source: 'content-script',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}
```

---

*Error handling designed: 2026-01-16*
*Sprint: Sprint-EXT-A-001, Task: T006*
