# Sprint Plan: Extension Button - Merge Last 3 Orders

**Sprint ID**: Sprint-EXT-I-002
**Module**: Extension (Chrome Extension for Auchan.pt automation)
**Type**: Implementation
**Feature**: 001-extension-merge-orders
**Branch**: feat/chrome-extension
**Status**: IN PROGRESS (9/10 tasks complete, awaiting manual E2E testing)
**Created**: 2026-01-17

---

## Sprint Goals

Implement the "Merge Last 3 Orders" feature for the Chrome Extension MVP with full UI and integration:

1. **Setup Extension** - Create manifest.json and esbuild config
2. **Merge Workflow** - Implement multi-order merge button and cart phase
3. **Progress Feedback** - Display real-time progress during merge operation
4. **Results Display** - Show item counts, cart total, and unavailable items
5. **Error Handling** - User-friendly error messages with retry capability

**Note**: Login detection removed from scope - extension assumes user is logged in on Auchan.pt.

---

## Scope

### In Scope
- Chrome extension manifest (MV3)
- Build configuration (esbuild)
- Popup UI with sections for merge, progress, results, errors
- Multi-order cart phase (replace + merge modes)
- State update subscriptions for progress
- Error handling with user-friendly messages
- Manual E2E testing on Auchan.pt
- Integration tests for merge flow

**Simplified**: Extension assumes user is on Auchan.pt and logged in. No login detection needed.

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
| T001 | Create manifest.json | SETUP | HIGH | DONE | 1 |
| T002 | Create esbuild config | SETUP | HIGH | DONE | - |
| T003 | Write merge flow integration test | US1 | HIGH | DONE | 1 |
| T004 | Modify cart phase for multi-order | US1 | HIGH | DONE | 2 |
| T005 | Add merge button to popup | US1 | HIGH | DONE | 2 |
| T006 | Add progress section to popup | US2 | HIGH | DONE | 1 |
| T007 | Subscribe to state updates in popup | US2 | HIGH | DONE | 1 |
| T008 | Add results section to popup | US3 | HIGH | DONE | 1 |
| T009 | Add error section to popup | US4 | MEDIUM | DONE | 1 |
| T010 | Manual E2E testing | POLISH | MEDIUM | PENDING | 2 |
| **TOTAL** | | | | **9/10 DONE** | **13** |

**Note**: T003-T004 (login detection) removed - renumbered tasks. T001, T002, T005 already complete.

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

## Phase 2: Core - Merge Workflow (T003-T008)

**Goal**: Implement complete merge workflow with UI

### T003: Write merge flow integration test
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

### T004: Modify cart phase for multi-order
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

### T005: Add merge button to popup
**Status**: DONE
**Files**: `extension/popup/popup.html`, `extension/popup/popup.js`
**Story**: US1
**Priority**: HIGH
**Points**: 2

Add merge button to popup that triggers the merge workflow.

**Acceptance Criteria**:
- [x] Button always enabled (assumes user is logged in)
- [x] Click triggers startMerge message
- [x] Shows loading state during operation
- [x] Disables button during operation
- [x] Shows error if not on Auchan.pt
- [x] Proper labeling

**Note**: Simplified - no login gating, just checks if on auchan.pt domain.

---

### T006: Add progress section to popup
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

### T007: Subscribe to state updates in popup
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

### T008: Add results section to popup
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

**Phase 2 Complete Criteria**:
- [x] Button triggers startMerge on click
- [ ] 3 orders merged oldest-to-newest (replace, merge, merge)
- [ ] Progress bar updates during operation
- [ ] Step text shows "Merging order 1/3...", etc.
- [ ] Results show item count and total
- [ ] "View Cart" link opens Auchan.pt cart page

---

## Phase 3: Polish - Error Handling & Testing (T009-T010)

**Goal**: Handle errors gracefully and verify end-to-end functionality

### T009: Add error section to popup
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

### T010: Manual E2E testing
**Status**: PENDING
**Files**: -
**Story**: POLISH
**Priority**: MEDIUM
**Points**: 2

Manual end-to-end testing on Auchan.pt and bug fixes.

**Acceptance Criteria**:
- [ ] Extension loads in Chrome without errors
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
1. Log in to Auchan.pt manually
2. Open extension popup
3. Click "Merge last 3 orders" button
4. Monitor progress bar and step text
5. Wait for completion
6. Verify results show item count and total
7. Click "View Cart" link
8. Verify cart contains merged items
9. Test cancel button mid-operation
10. Test error scenarios (no orders, network failure)
11. Verify retry button works

**Phase 3 Complete Criteria**:
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
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010
  ✓      ✓                    ✓      └──────────────────┘
```

### Parallelization Opportunities

| Phase | Parallel Tasks | Sequential Tasks |
|-------|----------------|------------------|
| Setup | T001, T002 (DONE) | - |
| Core | T006, T007, T008 (after T004) | T003 → T004 → T005 |
| Polish | - | T009 → T010 |

### Recommended Sequence
1. **Setup**: T001 and T002 (DONE)
2. **Core - Tests**: Complete T003
3. **Core - Implementation**: Complete T004, T005 (DONE), then parallel T006, T007, T008
4. **Polish**: Complete T009, then T010

---

## Dependencies

### External
- Sprint-EXT-A-001 architecture (COMPLETED)
- Sprint-EXT-R-001 research (COMPLETED)
- Sprint-EXT-I-001 port interfaces and adapters
- Existing selector registry in data/selectors/

### Internal Task Dependencies
```
Phase 1 (Setup) - DONE:
T001 ─┬─> Extension loads ✓
T002 ─┘

Phase 2 (Core):
T003 ─> T004 ─> T005 ─┐
                      ├─> Merge workflow works
        T006 ─> T007 ─┤
        T008 ────────┘

Phase 3 (Polish):
T009 ─> T010 ─> Feature complete
```

---

## Success Criteria

**Sprint Success Requires**:
- [ ] All 10 tasks completed (9/10 done)
- [x] Extension loads in Chrome without errors
- [x] Manifest and esbuild configured correctly
- [x] Merge button implemented
- [x] Merge button triggers 3-order merge workflow
- [x] Progress displays during operation
- [x] Results show accurate item count and total
- [x] Errors handled gracefully with user messages
- [ ] Manual E2E testing passed on Auchan.pt (T010)
- [ ] No console errors (requires manual testing)
- [x] Code builds without warnings
- [x] All tests pass (139/139 tests passing)

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
- **Total Points**: 13
- **Parallelizable Tasks**: 3
- **Est. Duration**: 3-4 working days
- **Last Updated**: 2026-01-17
- **Source**: Specs/001-extension-merge-orders/tasks.md
- **Simplification**: Removed login detection (US5) - assumes user is on Auchan.pt and logged in

*Created: 2026-01-17*
*Updated: 2026-01-17 (removed login detection scope)*
*Feature: 001-extension-merge-orders*
*Architecture: Sprint-EXT-A-001*
