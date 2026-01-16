# Sprint Plan: Chrome Extension MVP Implementation

**Sprint ID**: Sprint-EXT-I-001
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Implementation
**Branch**: feat/chrome-extension
**Status**: PLANNING
**Created**: 2026-01-16

---

## Sprint Goals

Implement the Chrome Extension MVP based on the hexagonal architecture from Sprint-EXT-A-001:

1. **Implement Chrome Adapters** - Create concrete implementations of all 6 port interfaces
2. **Build Content Script Extractors** - Implement DOM extraction for Auchan.pt pages
3. **Create Run Orchestrator** - Implement state machine with service worker recovery
4. **Implement Cart Phase** - Port CartBuilder functionality (extract orders, reorder, scan cart)
5. **Implement Slots Phase** - Port SlotScout functionality (extract/score delivery slots)

---

## Scope

### In Scope
- All 6 adapter implementations (Chrome + Fake for testing)
- Content script extractors for: login, orders, cart, search, slots
- State machine with transitions: idle → running → paused/review → complete
- Cart diff and merge logic
- Slot scoring logic
- Service worker entry point with recovery
- Content script entry point
- Unit tests for all core logic

### Out of Scope (Phase 2)
- StockPruner integration
- Full substitution search with LLM
- Learning subsystems
- Side panel UI
- Chrome Web Store submission

---

## Constraints (CRITICAL)

1. **Core has ZERO Chrome imports** - All Chrome access via adapters (ADR-001)
2. **State persists every change** - Use chrome.storage.session (ADR-002)
3. **Content scripts are stateless** - All state in service worker (ADR-009)
4. **CRITICAL: No checkout state** - State machine must NOT include purchase/checkout states (ADR-007)
5. **Graceful LLM degradation** - Extension works without API key (ADR-006)
6. **Use existing selectors** - Leverage data/selectors/pages/ registry

---

## Tasks

### T001: Chrome Storage Adapter
**Status**: PENDING
**Files**: `extension/src/adapters/chrome/storage-adapter.ts`

Implement `IStoragePort` using `chrome.storage` API.

**Implementation**:
```typescript
export class ChromeStorageAdapter implements IStoragePort {
  async get<T>(keys, area = 'session'): Promise<Partial<T>>
  async set<T>(items, area = 'session'): Promise<void>
  async remove(keys, area = 'session'): Promise<void>
  async clear(area = 'session'): Promise<void>
  addChangeListener(listener): () => void
}
```

**Acceptance Criteria**:
- [ ] Implements all IStoragePort methods
- [ ] Supports session, local, and sync storage areas
- [ ] Change listeners properly unsubscribe
- [ ] Error handling for quota exceeded

---

### T002: Chrome Messaging Adapter
**Status**: PENDING
**Files**: `extension/src/adapters/chrome/messaging-adapter.ts`

Implement `IMessagingPort` using `chrome.runtime` messaging.

**Implementation**:
```typescript
export class ChromeMessagingAdapter implements IMessagingPort {
  async sendMessage<T>(message): Promise<T>
  async sendToTab<T>(tabId, message): Promise<T>
  addMessageListener(handler): () => void
  connect(name): IPort
  addConnectListener(handler): () => void
}
```

**Acceptance Criteria**:
- [ ] Implements all IMessagingPort methods
- [ ] Async response handling with sendResponse
- [ ] Port connection lifecycle management
- [ ] Error handling for disconnected ports

---

### T003: Chrome Tabs Adapter
**Status**: PENDING
**Files**: `extension/src/adapters/chrome/tabs-adapter.ts`

Implement `ITabsPort` using `chrome.tabs` API.

**Implementation**:
```typescript
export class ChromeTabsAdapter implements ITabsPort {
  async get(tabId): Promise<TabInfo | undefined>
  async query(options): Promise<TabInfo[]>
  async update(tabId, options): Promise<TabInfo>
  async create(options): Promise<TabInfo>
  async close(tabId): Promise<void>
  addUpdateListener(listener): () => void
  async executeScript<T>(tabId, script): Promise<T[]>
  async waitForLoad(tabId, timeoutMs?): Promise<TabInfo>
  async waitForUrl(tabId, pattern, timeoutMs?): Promise<TabInfo>
}
```

**Acceptance Criteria**:
- [ ] Implements all ITabsPort methods
- [ ] Tab state mapping from Chrome API to TabInfo
- [ ] waitForLoad/waitForUrl with timeout support
- [ ] executeScript with proper injection context

---

### T004: Chrome Alarms Adapter
**Status**: PENDING
**Files**: `extension/src/adapters/chrome/alarms-adapter.ts`

Implement `IAlarmsPort` using `chrome.alarms` API.

**Implementation**:
```typescript
export class ChromeAlarmsAdapter implements IAlarmsPort {
  async create(name, options): Promise<void>
  async get(name): Promise<AlarmInfo | undefined>
  async getAll(): Promise<AlarmInfo[]>
  async clear(name): Promise<boolean>
  async clearAll(): Promise<void>
  addListener(listener): () => void
}
```

**Acceptance Criteria**:
- [ ] Implements all IAlarmsPort methods
- [ ] Maps Chrome alarm info to AlarmInfo type
- [ ] Handles minimum 1-minute alarm period constraint
- [ ] Listener cleanup on unsubscribe

---

### T005: Anthropic LLM Adapter
**Status**: PENDING
**Files**: `extension/src/adapters/llm/anthropic-adapter.ts`

Implement `ILLMPort` using `fetch()` to Anthropic API.

**Implementation**:
```typescript
export class AnthropicAdapter implements ILLMPort {
  async isAvailable(): Promise<boolean>
  async complete(messages, options?): Promise<LLMCompletionResponse>
  async setApiKey(apiKey): Promise<void>
  async clearApiKey(): Promise<void>
  getLastError(): LLMError | undefined
}
```

**Acceptance Criteria**:
- [ ] Implements all ILLMPort methods
- [ ] API key storage in session storage
- [ ] Proper error classification (rate limit, network, etc.)
- [ ] Graceful degradation when key missing

---

### T006: Fake Adapters for Testing
**Status**: PENDING
**Files**:
- `extension/src/adapters/fake/fake-storage.ts`
- `extension/src/adapters/fake/fake-messaging.ts`
- `extension/src/adapters/fake/fake-tabs.ts`
- `extension/src/adapters/fake/fake-alarms.ts`
- `extension/src/adapters/fake/fake-llm.ts`
- `extension/src/adapters/fake/index.ts`

Implement in-memory test doubles for all adapters.

**Acceptance Criteria**:
- [ ] All fake adapters implement respective ports
- [ ] FakeStorage: in-memory with change notifications
- [ ] FakeMessaging: direct handler invocation
- [ ] FakeTabs: simulated tab state
- [ ] FakeAlarms: manual trigger support
- [ ] FakeLLM: configurable responses

---

### T007: State Machine Implementation
**Status**: PENDING
**Files**:
- `extension/src/core/orchestrator/state-machine.ts`
- `extension/src/core/orchestrator/transitions.ts`

Implement the run state machine from state-machine.md.

**States**: idle, running, paused, review, complete
**Phases** (within running): initializing, cart, substitution, slots, finalizing

**Implementation**:
```typescript
export function createStateMachine(deps: OrchestratorDeps) {
  return {
    getState(): RunState
    dispatch(action: RunAction): RunState
    canTransition(to: RunStatus): boolean
    getCurrentPhase(): RunPhase | null
  }
}
```

**Acceptance Criteria**:
- [ ] All valid transitions per state-machine.md
- [ ] Guard functions (isLoggedIn, canRetry, packReady)
- [ ] Phase progression within 'running'
- [ ] State persistence on every change
- [ ] CRITICAL: No 'checkout' or 'purchase' states exist

---

### T008: Content Script - Login Detection
**Status**: PENDING
**Files**: `extension/src/content-scripts/extractors/login-detector.ts`

Detect login state from Auchan.pt header.

**Selectors** (from data/selectors/pages/login/v1.json):
- User name element in header
- Login button visibility

**Implementation**:
```typescript
export function detectLoginState(): LoginState {
  // Extract from DOM, return { isLoggedIn, userName, ... }
}
```

**Acceptance Criteria**:
- [ ] Correctly detects logged-in vs logged-out
- [ ] Extracts user name when logged in
- [ ] Works on any Auchan.pt page
- [ ] Returns consistent LoginState type

---

### T009: Content Script - Order History Extractor
**Status**: PENDING
**Files**: `extension/src/content-scripts/extractors/order-history.ts`

Extract order list from order history page.

**Selectors** (from data/selectors/pages/order-history/v1.json):
- Order cards container
- Order ID, date, total, status per card

**Implementation**:
```typescript
export function extractOrderHistory(limit?: number): OrderSummary[] {
  // Use page.evaluate pattern with string template
}
```

**Acceptance Criteria**:
- [ ] Extracts all visible orders
- [ ] Parses dates to timestamps
- [ ] Parses totals to numbers
- [ ] Handles empty order history
- [ ] Uses bulk DOM extraction (no individual queries)

---

### T010: Content Script - Cart Extractor
**Status**: PENDING
**Files**: `extension/src/content-scripts/extractors/cart-scanner.ts`

Extract cart items from cart page.

**Selectors** (from data/selectors/pages/cart/v1.json):
- Product cards in cart
- Name, price, quantity, availability per item
- Cart totals

**Implementation**:
```typescript
export function extractCartItems(options?: { includeOutOfStock?: boolean }): CartItem[] {
  // Bulk extraction using page.evaluate pattern
}
```

**Acceptance Criteria**:
- [ ] Extracts all cart items with full CartItem data
- [ ] Detects out-of-stock items
- [ ] Parses prices correctly (€ format)
- [ ] Handles empty cart
- [ ] Returns CartSummary with totals

---

### T011: Content Script - Delivery Slots Extractor
**Status**: PENDING
**Files**: `extension/src/content-scripts/extractors/slot-extractor.ts`

Extract delivery slots from checkout page.

**Selectors** (from data/selectors/pages/delivery-slots/v1.json):
- Day tabs with data-date
- Time slots with data-time, data-price, data-is-free
- Availability indicators

**Implementation**:
```typescript
export function extractDeliverySlots(): DeliverySlot[] {
  // Bulk extraction with slot parsing
}
```

**Acceptance Criteria**:
- [ ] Extracts all visible slots across days
- [ ] Parses fee amounts
- [ ] Detects free delivery slots
- [ ] Handles unavailable slots
- [ ] Returns structured DeliverySlot array

---

### T012: Cart Diff Logic
**Status**: PENDING
**Files**: `extension/src/core/cart/diff.ts`

Implement cart comparison algorithm.

**Implementation**:
```typescript
export function calculateCartDiff(
  originalOrder: OrderItem[],
  currentCart: CartItem[]
): CartDiff {
  // Compare by productId, detect added/removed/changed
}
```

**Acceptance Criteria**:
- [ ] Identifies added items
- [ ] Identifies removed items
- [ ] Identifies quantity changes
- [ ] Identifies price changes
- [ ] Identifies newly unavailable items
- [ ] Calculates price difference summary

---

### T013: Slot Scoring Logic
**Status**: PENDING
**Files**: `extension/src/core/slots/scoring.ts`

Port slot scoring from SlotScout.

**Implementation**:
```typescript
export function scoreSlots(
  slots: DeliverySlot[],
  preferences: SlotPreferences
): ScoredSlot[] {
  // Score each slot against preferences
}

export function recommendSlots(
  scoredSlots: ScoredSlot[]
): SlotRecommendation {
  // Select top 3, best free, cheapest, soonest
}
```

**Acceptance Criteria**:
- [ ] Scores by day preference (0-100)
- [ ] Scores by time preference (0-100)
- [ ] Scores by fee (inverse, 0-100)
- [ ] Combines scores with configurable weights
- [ ] Returns top recommendations

---

### T014: Run Orchestrator
**Status**: PENDING
**Files**:
- `extension/src/core/orchestrator/orchestrator.ts`
- `extension/src/core/orchestrator/phases.ts`
- `extension/src/core/orchestrator/index.ts`

Create orchestrator that coordinates state machine and phase execution.

**Implementation**:
```typescript
export function createOrchestrator(deps: OrchestratorDependencies) {
  return {
    async startRun(orderId?: string): Promise<void>
    async pauseRun(): Promise<void>
    async resumeRun(): Promise<void>
    async cancelRun(): Promise<void>
    async approveCart(): Promise<void>
    handleMessage(message, sender, sendResponse): boolean
    async recover(): Promise<void>  // Service worker restart
  }
}
```

**Acceptance Criteria**:
- [ ] Coordinates state machine transitions
- [ ] Executes phases in sequence
- [ ] Handles errors with recovery/pause
- [ ] Service worker recovery from storage
- [ ] Message routing to appropriate handlers

---

### T015: Service Worker Entry Point
**Status**: PENDING
**Files**: `extension/src/entry/service-worker.ts`

Main service worker that initializes extension.

**Implementation**:
```typescript
// Initialize with production adapters
const deps = createProductionDependencies();
const orchestrator = createOrchestrator(deps);

// Register Chrome event listeners
chrome.runtime.onInstalled.addListener(...)
chrome.runtime.onMessage.addListener(...)
chrome.alarms.onAlarm.addListener(...)

// Recovery on wake
orchestrator.recover();
```

**Acceptance Criteria**:
- [ ] Initializes adapters and orchestrator
- [ ] Registers all Chrome event listeners
- [ ] Handles service worker restart
- [ ] Sets up keep-alive alarm during runs
- [ ] Logs state transitions for debugging

---

### T016: Content Script Entry Point
**Status**: PENDING
**Files**: `extension/src/entry/content-script.ts`

Content script that handles extraction requests.

**Implementation**:
```typescript
// Register message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'cart.scan': return handleCartScan(message, sendResponse);
    case 'order.extractHistory': return handleOrderExtract(...);
    // ... other handlers
  }
});

// Notify service worker that content script is ready
chrome.runtime.sendMessage({ action: 'page.ready', ... });
```

**Acceptance Criteria**:
- [ ] Routes messages to appropriate extractors
- [ ] Returns properly typed responses
- [ ] Error handling for DOM extraction failures
- [ ] Page ready notification on injection
- [ ] Stateless (no persistent state in content script)

---

### T017: Adapter Factory
**Status**: PENDING
**Files**: `extension/src/adapters/factory.ts`

Factory functions for creating adapter sets.

**Implementation**:
```typescript
export function createProductionDependencies(): OrchestratorDependencies {
  return {
    storage: new ChromeStorageAdapter(),
    messaging: new ChromeMessagingAdapter(),
    tabs: new ChromeTabsAdapter(),
    alarms: new ChromeAlarmsAdapter(),
    llm: new AnthropicAdapter(),
  };
}

export function createTestDependencies(): OrchestratorDependencies {
  return {
    storage: new FakeStorageAdapter(),
    messaging: new FakeMessagingAdapter(),
    // ...
  };
}
```

**Acceptance Criteria**:
- [ ] Production factory returns all Chrome adapters
- [ ] Test factory returns all fake adapters
- [ ] Both return same interface type
- [ ] Easy to swap for testing

---

### T018: Unit Tests - Core Logic
**Status**: PENDING
**Files**:
- `extension/__tests__/core/state-machine.test.ts`
- `extension/__tests__/core/cart-diff.test.ts`
- `extension/__tests__/core/slot-scoring.test.ts`
- `extension/__tests__/core/orchestrator.test.ts`

Unit tests for all core logic using fake adapters.

**Test Coverage**:
- State machine: all transitions, guards, invalid transitions
- Cart diff: added, removed, changed, empty cases
- Slot scoring: preference matching, edge cases
- Orchestrator: phase progression, error handling, recovery

**Acceptance Criteria**:
- [ ] >80% code coverage on core/
- [ ] All state machine transitions tested
- [ ] Cart diff edge cases covered
- [ ] Slot scoring math verified
- [ ] Orchestrator recovery tested

---

## Dependencies

### External
- Sprint-EXT-A-001 architecture (COMPLETED)
- Sprint-EXT-R-001 research (COMPLETED)
- Existing selector registry in data/selectors/

### Internal Task Dependencies
```
T001-T006 (Adapters) → can run in parallel
T007 (State Machine) → depends on T001 (storage)
T008-T011 (Extractors) → can run in parallel
T012-T013 (Logic) → no dependencies
T014 (Orchestrator) → depends on T007, T001-T005
T015 (Service Worker) → depends on T014, T017
T016 (Content Script) → depends on T008-T011
T017 (Factory) → depends on T001-T006
T018 (Tests) → depends on all above
```

---

## Technical Approach

### Adapter Implementation Pattern
```typescript
// All adapters follow this pattern:
// 1. Implement interface exactly
// 2. Map Chrome API responses to port types
// 3. Handle errors with consistent error types
// 4. Provide listener cleanup via returned unsubscribe function

export class ChromeXxxAdapter implements IXxxPort {
  // Implementation
}
```

### Content Script Extraction Pattern
```typescript
// Use bulk DOM extraction to avoid round-trips
export function extractXxx(): T[] {
  const results = [];
  const elements = document.querySelectorAll(SELECTOR);
  for (const el of elements) {
    results.push({
      field1: el.querySelector('.field1')?.textContent?.trim() || '',
      // ...
    });
  }
  return results;
}
```

### State Persistence Pattern
```typescript
// Every state change persists immediately
async function dispatch(action: RunAction): Promise<RunState> {
  const newState = reducer(currentState, action);
  await storage.set({ runState: newState }, 'session');
  currentState = newState;
  return newState;
}
```

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Selectors break on Auchan.pt update | HIGH | MEDIUM | Use selector registry with fallbacks; test with snapshots |
| Service worker termination mid-run | MEDIUM | HIGH | Persist state every change; implement recovery |
| Content script injection timing | MEDIUM | MEDIUM | Use page.ready notification; retry pattern |
| LLM API unavailable | LOW | LOW | Graceful degradation to heuristics-only |

---

## Success Criteria

- [ ] All 18 tasks completed
- [ ] Extension loads in Chrome without errors
- [ ] Can detect login state on Auchan.pt
- [ ] Can extract order history
- [ ] Can trigger reorder and scan resulting cart
- [ ] Can extract and score delivery slots
- [ ] State machine handles pause/resume/cancel
- [ ] Service worker recovers from restart
- [ ] >80% test coverage on core logic
- [ ] CRITICAL: No checkout/purchase code paths exist

---

## Reference Documents

- Architecture: `extension/docs/architecture.md`
- State Machine: `extension/docs/state-machine.md`
- Migration Plan: `extension/docs/migration-plan.md`
- Error Handling: `extension/docs/error-handling.md`
- Port Interfaces: `extension/src/ports/*.ts`
- Type Definitions: `extension/src/types/*.ts`
- Existing Selectors: `data/selectors/pages/`

---

*Created: 2026-01-16*
*Architecture: Sprint-EXT-A-001*
*Research: Sprint-EXT-R-001*
