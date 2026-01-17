# Sprint Plan: Extension Button - Merge Last 3 Orders

**Sprint ID**: Sprint-EXT-I-002
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Implementation
**Feature**: 001-extension-merge-orders
**Branch**: feat/chrome-extension
**Status**: PENDING
**Created**: 2026-01-17

---

## Sprint Goals

Implement the "Merge Last 3 Orders" feature for the Chrome Extension MVP with full UI and integration:

1. **Setup Extension** - Create manifest.json and esbuild config
2. **Login Detection** - Add login status indicator to popup
3. **Merge Workflow** - Implement multi-order merge button and cart phase
4. **Progress Feedback** - Display real-time progress during merge operation
5. **Results Display** - Show item counts, cart total, and unavailable items
6. **Error Handling** - User-friendly error messages with retry capability

---

## Scope

### In Scope
- Chrome extension manifest (MV3)
- Build configuration (esbuild)
- Popup UI with sections for login, merge, progress, results, errors
- Login status detection via content script
- Multi-order cart phase (replace + merge modes)
- State update subscriptions for progress
- Error handling with user-friendly messages
- Manual E2E testing on Auchan.pt
- Integration tests for merge flow

### Out of Scope (Future Sprints)
- StockPruner integration
- Substitution search with LLM
- Learning subsystems
- Side panel UI
- Chrome Web Store submission

---

## Constraints & Critical Rules

1. **No Checkout Code** - CRITICAL: Never implement purchase/checkout states
2. **Hexagonal Architecture** - Use adapters for all Chrome API access
3. **State Persistence** - Every state change persists to chrome.storage.session
4. **Graceful Degradation** - Works without LLM API key
5. **Selector Registry** - Use existing data/selectors/ registry
6. **Test-First** - Write tests before implementation

---

## Task Breakdown

| ID | Task | Story | Priority | Status | Points |
|----|------|-------|----------|--------|--------|
| T001 | Create manifest.json | SETUP | HIGH | PENDING | 1 |
| T002 | Create esbuild config | SETUP | HIGH | PENDING | - |
| T003 | Write login status test | US5 | HIGH | PENDING | 1 |
| T004 | Add login status to popup | US5 | HIGH | PENDING | 1 |
| T005 | Write merge flow integration test | US1 | HIGH | PENDING | 1 |
| T006 | Modify cart phase for multi-order | US1 | HIGH | PENDING | 2 |
| T007 | Add merge button to popup | US1 | HIGH | PENDING | 2 |
| T008 | Add progress section to popup | US2 | HIGH | PENDING | 1 |
| T009 | Subscribe to state updates in popup | US2 | HIGH | PENDING | 1 |
| T010 | Add results section to popup | US3 | HIGH | PENDING | 1 |
| T011 | Add error section to popup | US4 | MEDIUM | PENDING | 1 |
| T012 | Manual E2E testing | POLISH | MEDIUM | PENDING | 2 |
| **TOTAL** | | | | | **15** |

---

## Phase 1: Setup (T001-T002)

**Goal**: Get extension loading in Chrome with proper build pipeline

### T001: Create manifest.json
**Status**: PENDING
**Files**: `extension/manifest.json`
**Points**: 1

Implement Chrome extension manifest (MV3) with service worker and content script configuration.

**Acceptance Criteria**:
- [ ] manifest_version: 3
- [ ] Includes service worker background script
- [ ] Content script configured for auchan.pt
- [ ] popup.html action configured
- [ ] Proper permissions (storage, alarms)
- [ ] host_permissions for auchan.pt

**Implementation Notes**:
```json
{
  "manifest_version": 3,
  "name": "AI Shopping Copilot",
  "version": "0.1.0",
  "description": "Automate Auchan.pt cart building from order history",
  "permissions": ["storage", "activeTab", "alarms"],
  "host_permissions": ["https://*.auchan.pt/*"],
  "background": {
    "service_worker": "dist/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://*.auchan.pt/*"],
    "js": ["dist/content-script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

---

### T002: Create esbuild config
**Status**: PENDING
**Files**: `extension/esbuild.config.js`
**Points**: (counted with T001)

Configure esbuild to bundle service worker (ESM) and content script (IIFE).

**Acceptance Criteria**:
- [ ] Service worker builds to dist/service-worker.js (ESM format)
- [ ] Content script builds to dist/content-script.js (IIFE format)
- [ ] Minification enabled in production
- [ ] Source maps for development
- [ ] Chrome 100+ target
- [ ] npm run build:extension runs successfully

**Implementation Notes**:
```javascript
const esbuild = require('esbuild');

const common = {
  bundle: true,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  target: ['chrome100'],
};

// Build service worker
esbuild.build({
  ...common,
  entryPoints: ['src/entry/service-worker.ts'],
  outfile: 'dist/service-worker.js',
  format: 'esm',
});

// Build content script
esbuild.build({
  ...common,
  entryPoints: ['src/entry/content-script.ts'],
  outfile: 'dist/content-script.js',
  format: 'iife',
});
```

**Phase 1 Complete Criteria**:
- [ ] `npm run build:extension` succeeds
- [ ] Extension loads in Chrome without errors
- [ ] Service worker registers correctly
- [ ] Content script injects on auchan.pt pages

---

## Phase 2: Foundation - Login Detection (T003-T004)

**Goal**: Display login status in popup (required for merge button state)

### T003: Write login status test
**Status**: PENDING
**Files**: `extension/__tests__/popup/login-status.test.ts`
**Story**: US5
**Priority**: HIGH
**Points**: 1

Write unit test for login status display before implementation.

**Acceptance Criteria**:
- [ ] Tests login detection via content script message
- [ ] Tests "Checking login..." loading state
- [ ] Tests "Logged in as [name]" display when logged in
- [ ] Tests "Not logged in" display when logged out
- [ ] Tests "Open Auchan.pt" when not on auchan domain
- [ ] Uses FakeAdapters for messaging

---

### T004: Add login status to popup
**Status**: PENDING
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US5
**Priority**: HIGH
**Points**: 1

Add login status indicator to popup and wire to login.check message.

**Acceptance Criteria**:
- [ ] Popup displays status indicator with color dot
- [ ] Shows "Checking login..." on popup open
- [ ] Shows green "Logged in as [name]" when logged in
- [ ] Shows red "Not logged in" when logged out
- [ ] Shows "Open Auchan.pt" when not on auchan.pt domain
- [ ] Styling matches design system

**Implementation Notes**:

HTML structure:
```html
<div id="login-status" class="status-indicator">
  <span class="dot"></span>
  <span class="text">Checking login...</span>
</div>
```

CSS:
```css
.status-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.status-indicator .dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; }
.status-indicator.logged-in .dot { background: #22c55e; }
.status-indicator.logged-out .dot { background: #ef4444; }
```

JavaScript:
```javascript
async function checkLoginStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('auchan.pt')) {
    setLoginStatus('not-on-site', 'Open Auchan.pt to use');
    return;
  }

  const response = await chrome.runtime.sendMessage({ action: 'login.check' });
  if (response?.data?.isLoggedIn) {
    setLoginStatus('logged-in', `Logged in as ${response.data.userName || 'User'}`);
  } else {
    setLoginStatus('logged-out', 'Not logged in');
  }
}
```

**Phase 2 Complete Criteria**:
- [ ] Popup displays "Checking login..." on open
- [ ] Popup shows green "Logged in as [name]" when logged in
- [ ] Popup shows red "Not logged in" when logged out
- [ ] Popup shows "Open Auchan.pt" when not on auchan.pt domain

---

## Phase 3: Core - Merge Workflow (T005-T010)

**Goal**: Implement complete merge workflow with UI

### T005: Write merge flow integration test
**Status**: PENDING
**Files**: `extension/__tests__/integration/merge-orders.test.ts`
**Story**: US1
**Priority**: HIGH
**Points**: 1

Write integration test for multi-order merge flow using FakeAdapters.

**Acceptance Criteria**:
- [ ] Tests end-to-end merge of 3 orders
- [ ] Verifies state transitions (idle → running → complete)
- [ ] Tests cart phase execution
- [ ] Tests progress updates during merge
- [ ] Tests results generation (item counts, total)
- [ ] Tests error scenarios (no orders, network error)
- [ ] Uses FakeTabs, FakeMessaging, FakeStorage

---

### T006: Modify cart phase for multi-order
**Status**: PENDING
**Files**: `extension/src/core/orchestrator/phases/cart-phase.ts`
**Story**: US1
**Priority**: HIGH
**Points**: 2

Modify cart phase to loop through 3 orders with replace/merge modes.

**Acceptance Criteria**:
- [ ] Navigates to order history page
- [ ] Extracts last 3 orders from history
- [ ] Sorts orders oldest-first
- [ ] Uses 'replace' mode for first order
- [ ] Uses 'merge' mode for second/third orders
- [ ] Updates progress for each step
- [ ] Scans final cart after all merges
- [ ] Calculates cart diff vs original
- [ ] Handles empty order history (error)

**Implementation Notes**:
```typescript
async executeCartPhase(context: PhaseContext): Promise<void> {
  // Navigate to order history
  await this.navigateToOrderHistory();
  this.updateProgress('Loading orders...', 1, 5);

  // Extract last 3 orders
  const orders = await this.extractOrderHistory(3);
  if (orders.length === 0) {
    throw new PhaseError('NO_ORDERS', 'No orders found in history');
  }

  // Sort oldest first
  const sortedOrders = orders.sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Merge each order
  for (let i = 0; i < sortedOrders.length; i++) {
    const order = sortedOrders[i];
    const mode = i === 0 ? 'replace' : 'merge';

    this.updateProgress(
      `Merging order ${i + 1}/${sortedOrders.length}...`,
      2 + i,
      2 + sortedOrders.length
    );

    await this.reorderOrder(order.orderId, order.detailUrl, mode);
  }

  // Scan final cart
  this.updateProgress('Scanning cart...', 2 + sortedOrders.length, 2 + sortedOrders.length);
  const cartSnapshot = await this.scanCart();

  // Store results
  context.cartSnapshot = cartSnapshot;
  context.cartDiff = calculateCartDiff([], cartSnapshot.items);
}
```

---

### T007: Add merge button to popup
**Status**: PENDING
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US1
**Priority**: HIGH
**Points**: 2

Add merge button to popup with login-gated disabled state.

**Acceptance Criteria**:
- [ ] Button disabled when not logged in
- [ ] Button enabled when logged in
- [ ] Click triggers run.start message
- [ ] Shows loading spinner during operation
- [ ] Disables button during operation
- [ ] Proper labeling and accessibility

**Implementation Notes**:

HTML:
```html
<button id="merge-btn" class="primary-btn" disabled>
  Merge Last 3 Orders
</button>
<p class="hint">Populates cart with your recent purchases</p>
```

JavaScript:
```javascript
document.getElementById('merge-btn').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'run.start' });
  if (response?.ok) {
    showSection('progress');
  } else {
    showError(response?.error || 'UNKNOWN');
  }
});

// Enable/disable button based on login status
function updateMergeButtonState(isLoggedIn) {
  const btn = document.getElementById('merge-btn');
  btn.disabled = !isLoggedIn;
}
```

---

### T008: Add progress section to popup
**Status**: PENDING
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US2
**Priority**: HIGH
**Points**: 1

Add progress section to popup (progress bar, step text, cancel button).

**Acceptance Criteria**:
- [ ] Progress bar visible during operation
- [ ] Progress bar fills 0-100% as operation progresses
- [ ] Step text shows current step (e.g., "Merging order 1/3...")
- [ ] Cancel button visible and functional
- [ ] Progress section hidden when not running
- [ ] Styling matches design system

**Implementation Notes**:

HTML:
```html
<div id="progress-section" class="hidden">
  <div class="progress-bar">
    <div class="progress-fill" id="progress-fill"></div>
  </div>
  <p id="progress-text">Starting...</p>
  <button id="cancel-btn" class="secondary-btn">Cancel</button>
</div>
```

CSS:
```css
.progress-bar { width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s; }
#progress-text { margin: 8px 0; font-size: 12px; color: #666; }
```

---

### T009: Subscribe to state updates in popup
**Status**: PENDING
**Files**: `extension/popup/popup.js`
**Story**: US2
**Priority**: HIGH
**Points**: 1

Subscribe to state.update messages and refresh progress display.

**Acceptance Criteria**:
- [ ] Listens for state.update messages from service worker
- [ ] Updates progress bar based on progress percentage
- [ ] Updates step text with current operation
- [ ] Shows "Still working..." after 30 seconds
- [ ] Closes progress section when operation complete
- [ ] Handles errors during operation

**Implementation Notes**:

JavaScript:
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'state.update') {
    const { status, phase, progress, progressText } = message.data;

    if (status === 'running') {
      document.getElementById('progress-fill').style.width = `${progress * 100}%`;
      document.getElementById('progress-text').textContent = progressText || 'Processing...';
    } else if (status === 'complete') {
      showSection('results');
      displayResults(message.data.results);
    } else if (status === 'error') {
      showError(message.data.errorCode);
    }
  }
});
```

---

### T010: Add results section to popup
**Status**: PENDING
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US3
**Priority**: HIGH
**Points**: 1

Add results section to popup (item count, total price, unavailable list, View Cart link).

**Acceptance Criteria**:
- [ ] Displays item count added to cart
- [ ] Displays total cart price in EUR
- [ ] Shows count of unavailable items (if any)
- [ ] Lists unavailable items with names
- [ ] "View Cart" link opens auchan.pt cart page
- [ ] "Start New Merge" button restarts workflow
- [ ] Results section hidden until operation complete

**Implementation Notes**:

HTML:
```html
<div id="results-section" class="hidden">
  <h3>Merge Complete</h3>
  <div class="stats">
    <div class="stat">
      <span class="value" id="added-count">0</span>
      <span class="label">Items Added</span>
    </div>
    <div class="stat">
      <span class="value" id="total-price">€0.00</span>
      <span class="label">Cart Total</span>
    </div>
  </div>
  <div id="unavailable-warning" class="hidden">
    <p class="warning">⚠ <span id="unavailable-count">0</span> items unavailable</p>
    <ul id="unavailable-list"></ul>
  </div>
  <a href="https://www.auchan.pt/pt/carrinho-compras" target="_blank" class="primary-btn">
    View Cart
  </a>
  <button id="new-merge-btn" class="secondary-btn">Start New Merge</button>
</div>
```

**Phase 3 Complete Criteria**:
- [ ] Button disabled when not logged in
- [ ] Button triggers run.start on click
- [ ] 3 orders merged oldest-to-newest (replace, merge, merge)
- [ ] Progress bar updates during operation
- [ ] Step text shows "Merging order 1/3...", etc.
- [ ] Results show item count and total
- [ ] "View Cart" link opens Auchan.pt cart page

---

## Phase 4: Polish - Error Handling & Testing (T011-T012)

**Goal**: Handle errors gracefully and verify end-to-end functionality

### T011: Add error section to popup
**Status**: PENDING
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US4
**Priority**: MEDIUM
**Points**: 1

Add error section to popup with user-friendly messages and retry button.

**Acceptance Criteria**:
- [ ] Error section displays error message clearly
- [ ] Maps error codes to user-friendly text
- [ ] Shows "Session expired - please log in again" for auth errors
- [ ] Shows "Network error - retrying..." for network errors
- [ ] Shows "Unable to read page - please report issue" for selector failures
- [ ] Retry button restarts merge flow
- [ ] Dismiss button hides error section
- [ ] Error section hidden initially

**Implementation Notes**:

HTML:
```html
<div id="error-section" class="hidden">
  <div class="error-icon">⚠</div>
  <p class="error-text" id="error-message">An error occurred</p>
  <div class="error-actions">
    <button id="retry-btn" class="primary-btn">Retry</button>
    <button id="dismiss-btn" class="secondary-btn">Dismiss</button>
  </div>
</div>
```

Error mapping:
```javascript
const ERROR_MESSAGES = {
  'NO_ORDERS': 'No orders found in your history',
  'SESSION_EXPIRED': 'Session expired - please log in again',
  'NETWORK_ERROR': 'Network error - please check your connection',
  'SELECTOR_FAILED': 'Unable to read page - please report this issue',
  'CANCELLED': 'Merge cancelled',
  'TIMEOUT': 'Operation timed out - please try again',
  'default': 'An unexpected error occurred'
};

function showError(errorCode) {
  const message = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.default;
  document.getElementById('error-message').textContent = message;
  showSection('error');
}
```

---

### T012: Manual E2E testing
**Status**: PENDING
**Files**: -
**Story**: POLISH
**Priority**: MEDIUM
**Points**: 2

Manual end-to-end testing on Auchan.pt and bug fixes.

**Acceptance Criteria**:
- [ ] Extension loads in Chrome without errors
- [ ] Login status displays correctly on popup open
- [ ] Merge button disabled when not logged in
- [ ] Merge button enabled when logged in
- [ ] Click merge button starts operation
- [ ] Progress bar shows during merge
- [ ] Step text updates correctly
- [ ] Results display after 3 orders merged
- [ ] Item count and total price are accurate
- [ ] Unavailable items shown if any
- [ ] View Cart link opens cart page correctly
- [ ] Cancel button stops operation within 2 seconds
- [ ] Error handling shows appropriate messages
- [ ] Retry button restarts merge flow
- [ ] No console errors during operation
- [ ] All acceptance scenarios from spec pass

**Test Scenario**:
1. Log in to Auchan.pt
2. Open extension popup
3. Verify login status shows "Logged in as [name]"
4. Click "Merge Last 3 Orders" button
5. Monitor progress bar and step text
6. Wait for completion
7. Verify results show item count and total
8. Click "View Cart" link
9. Verify cart contains merged items
10. Test cancel button mid-operation
11. Test error scenarios (expired session, network failure)
12. Verify retry button works

**Phase 4 Complete Criteria**:
- [ ] Session expired shows "Session expired - please log in again"
- [ ] Network error shows "Network error - retrying..."
- [ ] Selector failure shows "Unable to read page - please report issue"
- [ ] Cancel button stops operation within 2 seconds
- [ ] Retry button restarts merge flow
- [ ] No console errors during operation
- [ ] All acceptance scenarios from spec pass

---

## Execution Strategy

### Critical Path
```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012
                                              └──────────────────────────┘
```

### Parallelization Opportunities

| Phase | Parallel Tasks | Sequential Tasks |
|-------|----------------|------------------|
| Setup | T001, T002 | - |
| Foundation | - | T003 → T004 |
| Core | T008, T009, T010 (after T006) | T005 → T006 → T007 |
| Polish | - | T011 → T012 |

### Recommended Sequence
1. **Setup**: Start T001 and T002 in parallel
2. **Foundation**: Complete T003 then T004
3. **Core - Tests**: Complete T005
4. **Core - Implementation**: Complete T006, then parallel start T007, T008, T009, T010
5. **Polish**: Complete T011, then T012

---

## Dependencies

### External
- Sprint-EXT-A-001 architecture (COMPLETED)
- Sprint-EXT-R-001 research (COMPLETED)
- Sprint-EXT-I-001 port interfaces and adapters
- Existing selector registry in data/selectors/

### Internal Task Dependencies
```
Phase 1 (Setup):
T001 ─┬─> Extension loads
T002 ─┘

Phase 2 (Foundation):
T003 ─> T004 ─> Login detection works

Phase 3 (Core):
T005 ─> T006 ─> T007 ─┐
                      ├─> Merge workflow works
        T008 ─> T009 ─┤
        T010 ────────┘

Phase 4 (Polish):
T011 ─> T012 ─> Feature complete
```

---

## Success Criteria

**Sprint Success Requires**:
- [ ] All 12 tasks completed
- [ ] Extension loads in Chrome without errors
- [ ] Manifest and esbuild configured correctly
- [ ] Popup displays login status correctly
- [ ] Merge button triggers 3-order merge workflow
- [ ] Progress displays during operation
- [ ] Results show accurate item count and total
- [ ] Errors handled gracefully with user messages
- [ ] Manual E2E testing passed on Auchan.pt
- [ ] No console errors
- [ ] Code builds without warnings
- [ ] All tests pass

---

## Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Selectors break on Auchan.pt | MEDIUM | MEDIUM | Test with live site during E2E; have fallback selectors ready |
| Service worker crash during merge | MEDIUM | MEDIUM | Persist state every step; implement recovery |
| Content script injection timing | MEDIUM | LOW | Use page.ready notification; retry pattern in popup |
| Progress updates arrive out of order | LOW | LOW | Timestamp progress updates; use sequence numbers |
| Cart merge fails silently | MEDIUM | LOW | Add validation after each merge; log all steps |

---

## Reference Documents

**Feature Specification**:
- [Feature Spec](../../Specs/001-extension-merge-orders/spec.md)
- [Implementation Plan](../../Specs/001-extension-merge-orders/plan.md)
- [Tasks Reference](../../Specs/001-extension-merge-orders/tasks.md)

**Architecture**:
- [Extension Architecture](../../../extension/docs/architecture.md)
- [State Machine](../../../extension/docs/state-machine.md)
- [Port Interfaces](../../../extension/src/ports/)

**Existing Systems**:
- [Selector Registry](../../../data/selectors/)
- [CartBuilder Agent](../../../src/agents/cart-builder/)
- [SlotScout Agent](../../../src/agents/slot-scout/)

---

## Notes

- **Framework**: Sprint Management v3.0.0
- **Feature Branch**: `feat/chrome-extension`
- **Total Points**: 15
- **Parallelizable Tasks**: 5
- **Est. Duration**: 5-6 working days with team
- **Last Updated**: 2026-01-17
- **Source**: Specs/001-extension-merge-orders/tasks.md

*Created: 2026-01-17*
*Feature: 001-extension-merge-orders*
*Architecture: Sprint-EXT-A-001*
