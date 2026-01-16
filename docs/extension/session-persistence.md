# Session Persistence Strategy

**Sprint**: Sprint-EXT-R-001
**Task**: T004 - Session Persistence Strategy
**Date**: 2026-01-16

---

## Overview

Chrome Extension session management differs from Playwright. This document defines how to persist state across:
- Service worker restarts
- Browser restarts
- Extension updates

---

## 1. Storage Selection

### Data Classification

| Data Type | Storage | Reason |
|-----------|---------|--------|
| API Key (Anthropic) | `session` | Cleared on browser close, in-memory |
| Login state | `session` | Temporary, needs refresh |
| User preferences | `sync` | Persists across devices |
| Order history cache | `local` | Large data, device-specific |
| Current run state | `session` | Lost on restart is acceptable |
| Selector registry | Bundled | Static, shipped with extension |

### Storage Limits

| Storage | Limit | Our Usage |
|---------|-------|-----------|
| `session` | 10 MB | ~10 KB (state + API key) |
| `local` | 10 MB | ~1 MB (order cache) |
| `sync` | 100 KB | ~5 KB (preferences) |

---

## 2. Session State Schema

```typescript
// types/storage.ts

interface SessionState {
  // Authentication
  isLoggedIn: boolean;
  userName: string | null;
  loginTimestamp: number | null;

  // Current run
  runId: string | null;
  runStatus: 'idle' | 'running' | 'paused' | 'review' | 'complete';
  currentPhase: 'login' | 'cart' | 'substitution' | 'slots' | 'review';

  // Progress
  ordersLoaded: number;
  itemsProcessed: number;
  slotsFound: number;

  // Errors
  lastError: string | null;
  errorCount: number;
}

interface UserPreferences {
  // Substitution
  maxPriceDiffPercent: number;  // e.g., 20 = 20% max price increase
  preferSameBrand: boolean;
  autoSubstitute: boolean;

  // Slots
  preferredDays: string[];      // e.g., ['saturday', 'sunday']
  preferredTimeStart: string;   // e.g., '10:00'
  preferredTimeEnd: string;     // e.g., '14:00'
  maxDeliveryFee: number;

  // UI
  showNotifications: boolean;
  autoStartOnLogin: boolean;
}

interface OrderCache {
  orders: OrderSummary[];
  lastFetched: number;
  expiresAt: number;
}
```

---

## 3. Service Worker Lifecycle

### Challenge

Service workers terminate after ~30 seconds of inactivity. State in JavaScript variables is lost.

### Solution: Persist Everything

```javascript
// service-worker.js

// Load state on startup
let sessionState = null;

async function initializeState() {
  const result = await chrome.storage.session.get('sessionState');
  sessionState = result.sessionState || getDefaultState();
}

// Save state on every change
async function updateState(updates) {
  sessionState = { ...sessionState, ...updates };
  await chrome.storage.session.set({ sessionState });
}

// Initialize immediately
initializeState();

// Also re-initialize on wake
chrome.runtime.onStartup.addListener(initializeState);
```

### Recovery After Termination

```javascript
// When service worker restarts mid-operation

async function resumeRun() {
  await initializeState();

  if (sessionState.runStatus === 'running') {
    // Resume from last phase
    switch (sessionState.currentPhase) {
      case 'cart':
        await resumeCartPhase();
        break;
      case 'substitution':
        await resumeSubstitutionPhase();
        break;
      case 'slots':
        await resumeSlotsPhase();
        break;
    }
  }
}
```

---

## 4. Login State Management

### Detection (Content Script)

```javascript
// content-scripts/auchan-common.js

function detectLoginState() {
  const userElement = document.querySelector('.auc-header__user-name');
  const isLoggedIn = !!(userElement?.textContent?.trim());

  chrome.runtime.sendMessage({
    action: 'loginStateChanged',
    isLoggedIn,
    userName: isLoggedIn ? userElement.textContent.trim() : null
  });
}

// Check on load and observe changes
detectLoginState();
new MutationObserver(detectLoginState)
  .observe(document.body, { childList: true, subtree: true });
```

### Storage (Service Worker)

```javascript
// service-worker.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'loginStateChanged') {
    updateState({
      isLoggedIn: message.isLoggedIn,
      userName: message.userName,
      loginTimestamp: message.isLoggedIn ? Date.now() : null
    });

    // Notify UI
    chrome.runtime.sendMessage({
      action: 'stateUpdate',
      state: sessionState
    });
  }
});
```

---

## 5. Run State Persistence

### Starting a Run

```javascript
async function startRun() {
  const runId = `run-${Date.now()}`;

  await updateState({
    runId,
    runStatus: 'running',
    currentPhase: 'cart',
    ordersLoaded: 0,
    itemsProcessed: 0,
    slotsFound: 0,
    lastError: null,
    errorCount: 0
  });

  // Proceed with cart loading
  await executeCartPhase();
}
```

### Phase Transitions

```javascript
async function completePhase(phase) {
  const nextPhase = {
    'cart': 'substitution',
    'substitution': 'slots',
    'slots': 'review'
  }[phase];

  await updateState({
    currentPhase: nextPhase,
    runStatus: nextPhase === 'review' ? 'review' : 'running'
  });
}
```

### Error Handling

```javascript
async function handleError(error, recoverable = true) {
  await updateState({
    lastError: error.message,
    errorCount: sessionState.errorCount + 1,
    runStatus: recoverable ? 'running' : 'paused'
  });

  if (sessionState.errorCount >= 3) {
    await updateState({ runStatus: 'paused' });
    // Notify user
  }
}
```

---

## 6. Order Cache Strategy

### Caching Orders

```javascript
async function cacheOrders(orders) {
  const cache = {
    orders,
    lastFetched: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };

  await chrome.storage.local.set({ orderCache: cache });
}

async function getOrdersFromCache() {
  const { orderCache } = await chrome.storage.local.get('orderCache');

  if (!orderCache || Date.now() > orderCache.expiresAt) {
    return null; // Cache expired
  }

  return orderCache.orders;
}
```

### Cache Invalidation

Invalidate when:
- User places order on Auchan.pt (detected via URL change)
- User explicitly refreshes
- Cache expires (24 hours)

---

## 7. API Key Storage

### Secure Storage

```javascript
// Store API key in session storage (cleared on browser close)
async function setApiKey(key) {
  await chrome.storage.session.set({ anthropicApiKey: key });
}

async function getApiKey() {
  const { anthropicApiKey } = await chrome.storage.session.get('anthropicApiKey');
  return anthropicApiKey || null;
}

// User must re-enter API key each browser session
```

### Alternative: Prompt Each Run

For maximum security, prompt user for API key at start of each run:
- Never stored
- User pastes from password manager
- Cleared from memory after run

---

## 8. Recovery Scenarios

### Scenario 1: Service Worker Restart Mid-Run

| State Before | Recovery Action |
|--------------|-----------------|
| `running`, phase `cart` | Re-scan cart, continue |
| `running`, phase `substitution` | Resume from last processed item |
| `running`, phase `slots` | Re-extract slots |
| `review` | Show review UI |

### Scenario 2: Browser Restart

| Storage | State |
|---------|-------|
| `session` | Lost - user must login again |
| `local` | Preserved - order cache available |
| `sync` | Preserved - preferences restored |

**User experience**: Prompt to login, then can resume with cached orders.

### Scenario 3: Extension Update

| Storage | State |
|---------|-------|
| `session` | Lost |
| `local` | Preserved |
| `sync` | Preserved |

**User experience**: Same as browser restart.

---

## 9. Implementation Checklist

- [ ] Define `SessionState` TypeScript interface
- [ ] Create `storage.ts` utility module
- [ ] Implement `initializeState()` in service worker
- [ ] Add `updateState()` with debouncing
- [ ] Create login detection in content script
- [ ] Implement order caching with expiration
- [ ] Add API key prompt in popup/options
- [ ] Create recovery logic for each phase

---

*Research completed: 2026-01-16*
*Next: T005 - Prototype Skeleton Implementation*
