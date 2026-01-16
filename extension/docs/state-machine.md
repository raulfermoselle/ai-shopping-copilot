# Run Orchestration State Machine

**Sprint**: Sprint-EXT-A-001
**Module**: Extension
**Date**: 2026-01-16

---

## 1. Overview

The run orchestration state machine manages the lifecycle of a shopping session. It defines:

- **States**: What the extension is currently doing
- **Transitions**: How to move between states
- **Guards**: Conditions that must be met for transitions
- **Recovery**: How to resume after service worker restart

---

## 2. State Diagram

```
                                  ┌──────────────────────────────────────────────┐
                                  │                    IDLE                       │
                                  │  • No run active                              │
                                  │  • Waiting for user to start                  │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                            [START RUN]  │  Guard: isLoggedIn
                                                         │
                                                         ▼
    ┌────────────────────────────────────────────────────────────────────────────────┐
    │                               RUNNING                                           │
    │                                                                                 │
    │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
    │   │INITIALIZING │───▶│    CART     │───▶│SUBSTITUTION │───▶│   SLOTS     │    │
    │   │             │    │             │    │             │    │             │    │
    │   │ • Check     │    │ • Load      │    │ • Find      │    │ • Navigate  │    │
    │   │   login     │    │   orders    │    │   unavail.  │    │   to slots  │    │
    │   │ • Init      │    │ • Reorder   │    │ • Search    │    │ • Extract   │    │
    │   │   state     │    │ • Scan cart │    │   subs      │    │ • Score     │    │
    │   └─────────────┘    │ • Compare   │    │ • Score     │    └──────┬──────┘    │
    │                      └─────────────┘    └─────────────┘           │           │
    │                                                                    │           │
    │                                                         ┌─────────▼─────────┐ │
    │                                                         │   FINALIZING      │ │
    │                                                         │                   │ │
    │                                                         │ • Prepare review  │ │
    │                                                         │   pack            │ │
    │                                                         └─────────┬─────────┘ │
    └────────────────────────────────────────────────────────────────────┼──────────┘
                                         │                               │
                                         │                               │
                      [ERROR]            │            [FINALIZE]         │
                      recoverable        │            Guard: packReady   │
                                         │                               │
                                         ▼                               ▼
    ┌────────────────────────────────────────────┐    ┌─────────────────────────────┐
    │                  PAUSED                     │    │           REVIEW            │
    │                                             │    │                             │
    │  • Run paused due to error                  │    │  • Cart prepared            │
    │  • User can retry or cancel                 │    │  • User reviews changes     │
    │  • State preserved for recovery             │    │  • User approves or cancels │
    └─────────────────────┬───────────────────────┘    └──────────────┬──────────────┘
                          │                                           │
              [RETRY]     │     [CANCEL]                  [APPROVE]   │   [CANCEL]
                          │                                           │
                          ▼                                           ▼
              ┌───────────────────────┐                   ┌───────────────────────┐
              │       RUNNING         │                   │       COMPLETE        │
              │   (resume from phase) │                   │                       │
              └───────────────────────┘                   │  • Results saved      │
                                                          │  • Run logged         │
                                                          │  • Ready for next run │
                                                          └───────────┬───────────┘
                                                                      │
                                                                      │ [RESET]
                                                                      │
                                                                      ▼
                                                          ┌───────────────────────┐
                                                          │         IDLE          │
                                                          └───────────────────────┘
```

---

## 3. State Definitions

### 3.1 IDLE

**Entry conditions**: Initial state, after COMPLETE or CANCEL

**Allowed transitions**:
| Transition | Target | Guard |
|------------|--------|-------|
| START_RUN | RUNNING (INITIALIZING) | User logged in OR login prompt accepted |

**Actions**:
- None (waiting for user input)

**Storage**: Minimal state persisted

---

### 3.2 RUNNING

**Entry conditions**: From IDLE via START_RUN, or from PAUSED via RETRY

**Sub-phases**:

#### INITIALIZING
- Check login state
- Initialize run ID and timestamp
- Set up keep-alive alarm
- Validate tab is on Auchan.pt

#### CART
- Load order history
- Select order to reorder (or use default)
- Click reorder button
- Handle reorder modal (replace vs merge)
- Scan resulting cart
- Generate cart diff

#### SUBSTITUTION
- Identify unavailable items
- For each unavailable item:
  - Search for substitutes
  - Score candidates using heuristics
  - Optionally enhance with LLM
  - Add to proposals list

#### SLOTS
- Navigate to delivery slots page
- Extract available slots
- Score slots against user preferences
- Select top recommendations

#### FINALIZING
- Compile review pack
- Save intermediate results
- Transition to REVIEW

**Allowed transitions**:
| Transition | Target | Guard |
|------------|--------|-------|
| ERROR_RECOVERABLE | PAUSED | Error occurred, can retry |
| ERROR_FATAL | PAUSED | Error occurred, cannot retry |
| PHASE_COMPLETE | RUNNING (next phase) | Current phase finished |
| FINALIZE | REVIEW | All phases complete |

---

### 3.3 PAUSED

**Entry conditions**: Error during RUNNING

**Allowed transitions**:
| Transition | Target | Guard |
|------------|--------|-------|
| RETRY | RUNNING (resume phase) | errorCount < 3 |
| CANCEL | IDLE | User cancels |

**Actions**:
- Preserve state for recovery
- Show error message to user
- Increment error counter

---

### 3.4 REVIEW

**Entry conditions**: From RUNNING via FINALIZE

**Allowed transitions**:
| Transition | Target | Guard |
|------------|--------|-------|
| APPROVE | COMPLETE | User approves cart |
| CANCEL | IDLE | User cancels run |

**Actions**:
- Display review pack in side panel
- Highlight changes from original order
- Show substitution proposals
- Show recommended delivery slots

**CRITICAL**: No checkout interaction allowed. Review state is terminal for automation.

---

### 3.5 COMPLETE

**Entry conditions**: From REVIEW via APPROVE

**Allowed transitions**:
| Transition | Target | Guard |
|------------|--------|-------|
| RESET | IDLE | Always |

**Actions**:
- Save run results to storage
- Log run metrics
- Clear keep-alive alarm
- Reset for next run

---

## 4. Guards

### isLoggedIn
```typescript
function isLoggedIn(state: RunState, loginState: LoginState): boolean {
  return loginState.isLoggedIn === true;
}
```

### canRetry
```typescript
function canRetry(state: RunState): boolean {
  return state.errorCount < 3 && state.error?.recoverable === true;
}
```

### packReady
```typescript
function packReady(state: RunState): boolean {
  return state.phase === 'finalizing' && state.step === null;
}
```

### validTransition
```typescript
function validTransition(from: RunStatus, to: RunStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
```

---

## 5. Service Worker Recovery

### Challenge

Service workers can terminate after ~30 seconds of inactivity. State in memory is lost.

### Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Service Worker Terminates                         │
│                                                                      │
│  1. State persisted to chrome.storage.session (every state change)  │
│  2. Keep-alive alarm set (1 minute interval during run)             │
└────────────────────────────────────────────────────────────────────┬┘
                                                                      │
                                                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Service Worker Restarts                           │
│                                                                      │
│  1. Load state from chrome.storage.session                          │
│  2. Check runState.recoveryNeeded flag                              │
│  3. If status === 'running', set recoveryNeeded = true              │
│  4. Resume from current phase                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Recovery State

```typescript
interface RecoveryCheckpoint {
  phase: RunPhase;
  step: string | null;
  lastSuccessfulItem: string | null;
  partialResults: unknown;
}
```

### Recovery by Phase

| Phase | Recovery Strategy |
|-------|-------------------|
| INITIALIZING | Restart phase |
| CART | If orders loaded, skip to reorder; else restart |
| SUBSTITUTION | Resume from last processed item |
| SLOTS | Restart slot extraction |
| FINALIZING | Resume pack generation |

---

## 6. Event Handlers

### User Actions

```typescript
const userActions = {
  START_RUN: 'user.startRun',
  PAUSE_RUN: 'user.pauseRun',
  RESUME_RUN: 'user.resumeRun',
  CANCEL_RUN: 'user.cancelRun',
  APPROVE_CART: 'user.approveCart',
  REJECT_CART: 'user.rejectCart',
};
```

### System Events

```typescript
const systemEvents = {
  PHASE_COMPLETE: 'system.phaseComplete',
  ERROR_OCCURRED: 'system.errorOccurred',
  SERVICE_WORKER_WAKE: 'system.serviceWorkerWake',
  LOGIN_DETECTED: 'system.loginDetected',
  LOGOUT_DETECTED: 'system.logoutDetected',
};
```

---

## 7. Implementation Notes

### XState vs Simple Reducer

The state machine can be implemented using:

1. **XState** (recommended for complex cases):
   - Visual diagram generation
   - Built-in guard support
   - Hierarchical states for phases

2. **Simple Reducer** (simpler, sufficient for MVP):
   ```typescript
   function runReducer(state: RunState, action: RunAction): RunState {
     switch (action.type) {
       case 'START_RUN':
         if (!validTransition(state.status, 'running')) return state;
         return { ...state, status: 'running', phase: 'initializing' };
       // ... other cases
     }
   }
   ```

### State Persistence

```typescript
async function persistState(state: RunState): Promise<void> {
  await storage.set({ runState: state }, 'session');
}

// Call after every state change
orchestrator.onStateChange((newState) => {
  persistState(newState);
});
```

---

## 8. Safety Enforcement

### No Checkout State

The state machine explicitly excludes any `checkout` or `purchase` state:

```typescript
// These states do NOT exist:
// - 'purchasing'
// - 'checkout'
// - 'confirming-order'
// - 'payment'
```

### Review Gate

All runs must pass through REVIEW before COMPLETE:

```typescript
// RUNNING can only transition to REVIEW (not directly to COMPLETE)
VALID_TRANSITIONS['running'] = ['paused', 'review'];

// COMPLETE only reachable from REVIEW
VALID_TRANSITIONS['review'] = ['complete', 'idle'];
```

### Audit Logging

Every state transition is logged:

```typescript
function logTransition(from: RunStatus, to: RunStatus, trigger: string): void {
  console.log(`[STATE] ${from} → ${to} (${trigger}) at ${Date.now()}`);
  // Also persist to storage for debugging
}
```

---

*State machine designed: 2026-01-16*
*Sprint: Sprint-EXT-A-001, Task: T003*
