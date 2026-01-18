# Playwright → Extension Migration Mapping

**Sprint**: Sprint-EXT-R-001
**Task**: T003 - Migration Mapping
**Date**: 2026-01-16

---

## Executive Summary

**15 Playwright tools** identified for migration. Classification:

| Category | Count | Migration Effort |
|----------|-------|------------------|
| Direct Translation | 9 | Low - DOM queries |
| Redesign Required | 4 | Medium - Navigation patterns |
| Not Applicable | 2 | N/A - Handled differently |

---

## 1. Tool Inventory

### Global Tools

| Tool | File | Purpose |
|------|------|---------|
| LoginTool | `src/tools/login.ts` | Authenticate to Auchan.pt |
| SessionManager | `src/tools/session.ts` | Save/restore session state |
| BrowserTool | `src/tools/browser.ts` | Launch/manage browser |

### CartBuilder Tools

| Tool | File | Purpose |
|------|------|---------|
| NavigateToOrderHistoryTool | `navigate-to-order-history.ts` | Navigate to order history page |
| LoadOrderHistoryTool | `load-order-history.ts` | Extract order list |
| LoadOrderDetailTool | `load-order-detail.ts` | Extract order items |
| ReorderTool | `reorder.ts` | Click "Encomendar de novo" |
| ScanCartTool | `scan-cart.ts` | Extract cart contents |
| ExtractOrderItemsTool | (types only) | Extract items from page |

### Substitution Tools

| Tool | File | Purpose |
|------|------|---------|
| CheckAvailabilityTool | `check-availability.ts` | Check product availability |
| SearchProductsTool | `search-products.ts` | Search for products |
| ExtractProductInfoTool | `extract-product-info.ts` | Extract product details |
| NavigateToSearchTool | (types only) | Navigate to search results |

### SlotScout Tools

| Tool | File | Purpose |
|------|------|---------|
| NavigateToSlotsTool | `navigate-to-slots.ts` | Navigate to delivery slots |
| ExtractSlotsTool | `extract-slots.ts` | Extract available slots |

---

## 2. Migration Matrix

### Legend

- **Direct**: Playwright code → `document.querySelector()` with minimal changes
- **Redesign**: Requires new approach for Chrome Extension
- **N/A**: Not applicable in extension context

### Detailed Mapping

| # | Tool | Migration | Extension Equivalent | Effort |
|---|------|-----------|---------------------|--------|
| 1 | LoginTool | N/A | User manual login | N/A |
| 2 | SessionManager | Redesign | `chrome.storage.session` | Medium |
| 3 | BrowserTool | N/A | Chrome manages browser | N/A |
| 4 | NavigateToOrderHistoryTool | Redesign | `chrome.tabs.update()` + detect | Medium |
| 5 | LoadOrderHistoryTool | Direct | Content script DOM extraction | Low |
| 6 | LoadOrderDetailTool | Direct | Content script DOM extraction | Low |
| 7 | ReorderTool | Direct | Content script click handler | Low |
| 8 | ScanCartTool | Direct | Content script DOM extraction | Low |
| 9 | ExtractOrderItemsTool | Direct | Content script DOM extraction | Low |
| 10 | CheckAvailabilityTool | Direct | Content script button state | Low |
| 11 | SearchProductsTool | Direct | Content script DOM extraction | Low |
| 12 | ExtractProductInfoTool | Direct | Content script DOM extraction | Low |
| 13 | NavigateToSearchTool | Redesign | `chrome.tabs.update()` | Medium |
| 14 | NavigateToSlotsTool | Redesign | `chrome.tabs.update()` + detect | Medium |
| 15 | ExtractSlotsTool | Direct | Content script DOM extraction | Low |

---

## 3. Direct Translation Tools (9 tools)

These tools translate directly to content script DOM operations.

### Pattern: Playwright → Content Script

**Before (Playwright):**
```javascript
// load-order-history.ts
async execute(input, context) {
  const { page } = context;

  // Extract order cards
  const items = await page.evaluate(`
    (function() {
      const results = [];
      const cards = document.querySelectorAll('.auc-orders__card');
      cards.forEach(card => {
        results.push({
          orderId: card.querySelector('.auc-orders__number')?.textContent,
          date: card.querySelector('.auc-orders__date')?.textContent,
          total: card.querySelector('.auc-orders__total')?.textContent
        });
      });
      return results;
    })()
  `);

  return { orders: items };
}
```

**After (Content Script):**
```javascript
// content-scripts/auchan-orders.js

function extractOrderHistory() {
  const results = [];
  const cards = document.querySelectorAll('.auc-orders__card');

  cards.forEach(card => {
    results.push({
      orderId: card.querySelector('.auc-orders__number')?.textContent?.trim(),
      date: card.querySelector('.auc-orders__date')?.textContent?.trim(),
      total: card.querySelector('.auc-orders__total')?.textContent?.trim()
    });
  });

  return results;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractOrderHistory') {
    const orders = extractOrderHistory();
    sendResponse({ success: true, orders });
  }
  return true;
});
```

### Reusable Components

The following can be reused with minimal changes:
- Zod schemas (validation logic)
- Selector definitions (from registry)
- Data transformation functions
- Price parsing utilities

---

## 4. Redesign Required Tools (4 tools)

### 4.1 SessionManager → chrome.storage

**Change**: File-based storage → Chrome storage API

**Before:**
```javascript
// Playwright SessionManager
async saveSession(sessionPath) {
  const cookies = await context.cookies();
  await fs.writeFile(sessionPath, JSON.stringify(cookies));
}
```

**After:**
```javascript
// service-worker.js
async function saveSession(sessionData) {
  await chrome.storage.session.set({
    auchanSession: {
      loggedIn: true,
      user: sessionData.user,
      timestamp: Date.now()
    }
  });
}
```

### 4.2 Navigation Tools → chrome.tabs + Content Script Detection

**Change**: Playwright `page.goto()` → Chrome tabs API + detection

**Pattern:**
```javascript
// service-worker.js

async function navigateToOrderHistory(tabId) {
  // Update tab URL
  await chrome.tabs.update(tabId, {
    url: 'https://www.auchan.pt/pt/historico-encomendas'
  });

  // Wait for content script to signal page loaded
  return new Promise((resolve) => {
    chrome.runtime.onMessage.addListener(function handler(message) {
      if (message.action === 'pageReady' && message.page === 'order-history') {
        chrome.runtime.onMessage.removeListener(handler);
        resolve({ success: true, url: message.url });
      }
    });
  });
}
```

**Content Script signals ready:**
```javascript
// content-scripts/auchan-orders.js

// Signal when page is ready
if (window.location.pathname.includes('historico-encomendas')) {
  chrome.runtime.sendMessage({
    action: 'pageReady',
    page: 'order-history',
    url: window.location.href
  });
}
```

### 4.3 LoginTool → User Manual Login

**Change**: Automated login → User-initiated login with detection

**Extension Flow:**
1. Extension checks if user is logged in
2. If not, shows "Please login" prompt in popup
3. User clicks Auchan login link
4. User completes login manually
5. Extension detects logged-in state
6. Proceeds with automation

**Detection:**
```javascript
// content-scripts/auchan-common.js

function checkLoginStatus() {
  const userElement = document.querySelector('.auc-header__user-name');
  const isLoggedIn = userElement && userElement.textContent.trim().length > 0;

  chrome.runtime.sendMessage({
    action: 'loginStatusUpdate',
    isLoggedIn,
    userName: isLoggedIn ? userElement.textContent.trim() : null
  });
}

// Check on page load
checkLoginStatus();

// Also observe for changes (SPA navigation)
const observer = new MutationObserver(checkLoginStatus);
observer.observe(document.body, { childList: true, subtree: true });
```

---

## 5. Not Applicable Tools (2 tools)

### 5.1 BrowserTool

**Reason**: Chrome is already running. Extension operates within existing browser.

**Replacement**: None needed. Extension uses active tab.

### 5.2 LoginTool (Automated Credential Entry)

**Reason**: Security concern - don't handle credentials in extension.

**Replacement**: User manual login with status detection.

---

## 6. Communication Architecture

### Message Types

```typescript
// types/messages.ts

type MessageAction =
  // Orders
  | 'extractOrderHistory'
  | 'extractOrderDetail'
  | 'clickReorder'

  // Cart
  | 'scanCart'
  | 'getCartTotal'

  // Search
  | 'searchProducts'
  | 'extractProductInfo'
  | 'checkAvailability'

  // Slots
  | 'extractDeliverySlots'

  // Status
  | 'pageReady'
  | 'loginStatusUpdate'
  | 'actionComplete';

interface ExtensionMessage {
  action: MessageAction;
  payload?: unknown;
}

interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### Message Flow

```
┌──────────────────┐      message      ┌──────────────────┐
│   Service        │ ◀──────────────── │   Content        │
│   Worker         │                   │   Script         │
│   (Coordinator)  │ ────────────────▶ │   (DOM Access)   │
└──────────────────┘    sendResponse   └──────────────────┘
        │
        │ chrome.tabs.sendMessage()
        │
        ▼
┌──────────────────┐
│   Specific Tab   │
│   Content Script │
└──────────────────┘
```

---

## 7. Reusable Code

### Can Reuse Directly

| Component | Location | Notes |
|-----------|----------|-------|
| Zod schemas | `src/agents/*/types.ts` | Import and use |
| Selector definitions | `data/selectors/` | Import JSON |
| Price parsing | `src/utils/` | Pure functions |
| Diff algorithms | `src/agents/cart-builder/` | Pure functions |
| Scoring heuristics | `src/agents/*/` | Pure functions |
| LLM prompts | `src/llm/prompts/` | String templates |

### Needs Adaptation

| Component | Change Needed |
|-----------|---------------|
| Tool base class | Remove Playwright dependency |
| Error types | Add extension-specific errors |
| Logger | Use `console.*` or custom logger |
| Config | Use `chrome.storage` |

---

## 8. Migration Priority

### Phase 1: Core Flow (MVP)

| Priority | Tool | Reason |
|----------|------|--------|
| 1 | ScanCartTool | See current cart state |
| 2 | LoadOrderHistoryTool | Load past orders |
| 3 | ReorderTool | Add items to cart |
| 4 | Session detection | Know login state |

### Phase 2: Substitution

| Priority | Tool | Reason |
|----------|------|--------|
| 5 | SearchProductsTool | Find replacements |
| 6 | CheckAvailabilityTool | Verify stock |
| 7 | ExtractProductInfoTool | Get product details |

### Phase 3: Slots & Polish

| Priority | Tool | Reason |
|----------|------|--------|
| 8 | ExtractSlotsTool | Get delivery options |
| 9 | NavigateToSlotsTool | Slot page access |

---

## 9. Risk Assessment

### Low Risk

| Item | Reason |
|------|--------|
| DOM extraction tools | 1:1 mapping to `querySelector` |
| Zod schemas | Pure TypeScript, no browser APIs |
| Selector registry | JSON data, fully reusable |

### Medium Risk

| Item | Reason | Mitigation |
|------|--------|------------|
| Navigation detection | Timing issues possible | Use `MutationObserver` |
| Session management | Different storage model | Design carefully in T004 |
| Click handlers | Page state changes | Verify after click |

### High Risk

| Item | Reason | Mitigation |
|------|--------|------------|
| Service worker termination | Can lose state | Persist to `chrome.storage` |
| Cross-page coordination | Multiple content scripts | Central service worker |

---

## 10. Summary

### Migration Feasibility: HIGH

- 60% of tools (9/15) are direct DOM translations
- 27% of tools (4/15) need redesign but have clear patterns
- 13% of tools (2/15) are not needed in extension context

### Estimated Effort

| Phase | Tools | Effort |
|-------|-------|--------|
| Core (MVP) | 4 | 1-2 days |
| Substitution | 3 | 1-2 days |
| Slots | 2 | 1 day |
| **Total** | **9** | **3-5 days** |

### Key Decisions

1. **Login**: User manual login with detection (security)
2. **Navigation**: `chrome.tabs.update()` + content script detection
3. **State**: `chrome.storage.session` for sensitive, `local` for persistent
4. **Communication**: Message passing with typed interfaces

---

*Research completed: 2026-01-16*
*Next: T004 - Session Persistence Strategy*
