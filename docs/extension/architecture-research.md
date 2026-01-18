# Chrome Extension Architecture Research

**Sprint**: Sprint-EXT-R-001
**Task**: T001 - Chrome Extension Fundamentals Research
**Date**: 2026-01-16

---

## Executive Summary

Chrome Extension Manifest V3 is viable for replacing Playwright-based automation. Key findings:

1. **Service workers** replace background pages - event-driven, not persistent
2. **Content scripts** can interact with page DOM but have CORS restrictions
3. **Anthropic API calls** must go through service worker with `host_permissions`
4. **Storage API** provides local, sync, and session options
5. **Testing** is feasible with jest-chrome for unit tests, Puppeteer for E2E

---

## 1. Manifest V3 Architecture

### Overview

Manifest V3 (MV3) is the current Chrome Extension standard. Key changes from V2:

| Feature | Manifest V2 | Manifest V3 |
|---------|-------------|-------------|
| Background | Persistent page | Event-driven service worker |
| Remote code | Allowed | **Forbidden** |
| Network requests | webRequest (blocking) | declarativeNetRequest |
| Host permissions | In `permissions` | Separate `host_permissions` |

### Service Worker Lifecycle

Service workers are **not persistent**. They:
- Start when needed (event fires)
- Run for ~30 seconds of inactivity
- Terminate and restart as needed

**Implications for our project:**
- Cannot use `setTimeout`/`setInterval` reliably
- Must use `chrome.alarms` API for scheduled tasks
- State must be stored in `chrome.storage`, not in-memory variables

### Basic Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "AI Shopping Copilot",
  "version": "1.0.0",
  "description": "Automates grocery cart preparation for Auchan.pt",

  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },

  "content_scripts": [{
    "matches": ["https://*.auchan.pt/*"],
    "js": ["content-scripts/auchan.js"]
  }],

  "permissions": [
    "storage",
    "activeTab",
    "alarms"
  ],

  "host_permissions": [
    "https://*.auchan.pt/*",
    "https://api.anthropic.com/*"
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon48.png"
  },

  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  }
}
```

---

## 2. Content Scripts

### Purpose

Content scripts run in the context of web pages. They can:
- Read and modify the DOM
- Listen for DOM events
- Communicate with service worker via messaging

### Lifecycle

1. Injected when page matches `matches` pattern
2. Run in isolated world (separate JS context)
3. Share DOM with page but not JS variables

### Content Script Pattern Example

```javascript
// content-scripts/auchan-cart.js

// DOM interaction - same as our Playwright selectors
function extractCartItems() {
  const items = [];
  const tiles = document.querySelectorAll('.auc-cart-item');

  tiles.forEach(tile => {
    items.push({
      name: tile.querySelector('.product-name')?.textContent?.trim(),
      price: tile.querySelector('.product-price')?.textContent?.trim(),
      quantity: tile.querySelector('.quantity-input')?.value
    });
  });

  return items;
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scanCart') {
    const items = extractCartItems();
    sendResponse({ success: true, items });
  }
  return true; // Keep channel open for async response
});
```

### Key Differences from Playwright

| Playwright | Content Script |
|------------|----------------|
| `page.locator()` | `document.querySelector()` |
| `page.evaluate()` | Direct DOM access |
| `await element.click()` | `element.click()` |
| Cross-origin navigation | Same-origin only |
| Separate process | In-page isolated world |

---

## 3. Service Worker (Background Script)

### Purpose

The service worker handles:
- Extension logic and orchestration
- External API calls (Anthropic)
- Message routing between components
- Storage management

### Event Registration

**Critical**: Event listeners must be registered at top level, not dynamically:

```javascript
// service-worker.js

// CORRECT: Top-level registration
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Async response
});

// INCORRECT: Dynamic registration (will miss events)
// setTimeout(() => {
//   chrome.runtime.onMessage.addListener(...); // DON'T DO THIS
// }, 100);
```

### Communication Patterns

```
┌─────────────┐     chrome.runtime.sendMessage     ┌─────────────────┐
│   Content   │ ────────────────────────────────▶  │  Service Worker │
│   Script    │ ◀────────────────────────────────  │  (Background)   │
└─────────────┘        sendResponse                └─────────────────┘
                                                           │
                                                           │ fetch()
                                                           ▼
                                                   ┌─────────────────┐
                                                   │  Anthropic API  │
                                                   └─────────────────┘
```

---

## 4. Anthropic API Integration

### CORS Solution

Content scripts cannot call external APIs directly due to CORS. Solution:

1. Content script sends message to service worker
2. Service worker makes `fetch()` call to Anthropic
3. Service worker returns response to content script

### Manifest Permissions

```json
{
  "host_permissions": [
    "https://api.anthropic.com/*"
  ]
}
```

### Service Worker API Call

```javascript
// service-worker.js

async function callClaude(prompt, systemPrompt) {
  const apiKey = await getApiKey(); // From chrome.storage

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  return response.json();
}

async function getApiKey() {
  const result = await chrome.storage.local.get('anthropicApiKey');
  if (!result.anthropicApiKey) {
    throw new Error('API key not configured');
  }
  return result.anthropicApiKey;
}
```

### API Key Storage

```javascript
// Options page or popup - user enters API key
async function saveApiKey(key) {
  await chrome.storage.local.set({ anthropicApiKey: key });
}
```

**Security Note**: `chrome.storage.local` is not encrypted but is isolated to the extension. For production, consider:
- Prompting user each session
- Using `chrome.storage.session` (cleared on browser close)
- Never logging the key

---

## 5. Storage API Comparison

### Summary Table

| Feature | `storage.local` | `storage.sync` | `storage.session` |
|---------|-----------------|----------------|-------------------|
| **Size Limit** | 10 MB | ~100 KB | 10 MB |
| **Persistence** | Until uninstall | Synced across devices | Browser session only |
| **Encrypted** | No | No | In-memory |
| **Content Script Access** | Yes (default) | Yes | No (default) |
| **Best For** | Order history, preferences | User settings | API keys, temp state |

### Recommended Usage for Our Project

| Data | Storage Type | Reason |
|------|--------------|--------|
| Anthropic API key | `session` | Sensitive, cleared on close |
| User preferences | `sync` | Available across devices |
| Order history | `local` | Large data, device-specific |
| Session state | `session` | Temporary, restart-safe |

### Usage Example

```javascript
// Save data
await chrome.storage.local.set({
  orderHistory: [...],
  lastSync: Date.now()
});

// Load data
const { orderHistory, lastSync } = await chrome.storage.local.get([
  'orderHistory',
  'lastSync'
]);

// Listen for changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.orderHistory) {
    console.log('Order history updated');
  }
});
```

---

## 6. Testing Strategies

### Unit Testing with jest-chrome

```javascript
// __tests__/cart-extractor.test.js
import { extractCartItems } from '../content-scripts/cart-extractor';

// Mock chrome API
global.chrome = require('jest-chrome');

describe('extractCartItems', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="auc-cart-item">
        <span class="product-name">Leite Mimosa</span>
        <span class="product-price">1,29 EUR</span>
      </div>
    `;
  });

  it('extracts item name and price', () => {
    const items = extractCartItems();
    expect(items[0].name).toBe('Leite Mimosa');
    expect(items[0].price).toBe('1,29 EUR');
  });
});
```

### E2E Testing with Puppeteer

```javascript
// e2e/extension.test.js
const puppeteer = require('puppeteer');
const path = require('path');

describe('Extension E2E', () => {
  let browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        `--disable-extensions-except=${path.resolve('./dist')}`,
        `--load-extension=${path.resolve('./dist')}`
      ]
    });
  });

  it('injects content script on Auchan.pt', async () => {
    const page = await browser.newPage();
    await page.goto('https://www.auchan.pt');

    // Content script should have injected
    const result = await page.evaluate(() => {
      return window.__AISC_EXTENSION_LOADED__;
    });

    expect(result).toBe(true);
  });
});
```

### Test Configuration

```json
// package.json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:e2e": "playwright test --project=extension"
  },
  "devDependencies": {
    "jest-chrome": "^0.8.0",
    "vitest": "^1.0.0",
    "puppeteer": "^22.0.0"
  }
}
```

---

## 7. Manifest V2 vs V3 Comparison

| Aspect | V2 | V3 |
|--------|----|----|
| Background | Persistent page | Event-driven service worker |
| `chrome.webRequest` | Blocking allowed | Non-blocking only |
| Remote code | `eval()`, remote scripts | Forbidden |
| Content Security | Relaxed | Strict CSP |
| `host_permissions` | In `permissions` | Separate field |
| Promises | Callbacks | Native promises |

### Migration Considerations

Our Playwright code uses:
- `page.evaluate()` with inline functions - **OK** (not remote code)
- Selectors from JSON registry - **OK** (bundled data)
- Anthropic API calls - **OK** (via service worker `fetch`)

---

## 8. Security Constraints

### Content Security Policy

MV3 enforces strict CSP:
- No `eval()` or `new Function()`
- No inline scripts in HTML
- No remote code execution

### Data Isolation

- Content scripts run in isolated world
- Cannot access page's JavaScript variables
- Can access DOM only

### Permission Model

```json
{
  "permissions": [
    "storage",      // chrome.storage API
    "activeTab",    // Access current tab on user action
    "alarms"        // Scheduled tasks
  ],
  "host_permissions": [
    "https://*.auchan.pt/*",      // Content script injection
    "https://api.anthropic.com/*" // API calls
  ]
}
```

---

## 9. Architecture Recommendation

### Proposed Extension Structure

```
extension/
├── manifest.json
├── service-worker.js           # Coordinator logic, API calls
├── content-scripts/
│   ├── auchan-common.js        # Shared utilities
│   ├── auchan-cart.js          # Cart page automation
│   ├── auchan-orders.js        # Order history automation
│   ├── auchan-search.js        # Product search automation
│   └── auchan-slots.js         # Delivery slots automation
├── ui/
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── sidepanel/
│       ├── sidepanel.html      # Review Pack display
│       └── sidepanel.js
├── lib/
│   ├── schemas/                # Zod schemas (reused from current)
│   ├── heuristics/             # Scoring logic (reused)
│   └── selectors/              # Selector definitions (reused)
└── _locales/                   # Internationalization
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| Service Worker | Orchestration, LLM calls, state management |
| Content Scripts | DOM interaction, data extraction |
| Popup | Quick actions, status display |
| Side Panel | Review Pack, detailed UI |

---

## 10. Sources

- [Chrome Extensions Manifest V3 Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Migrate to Service Workers](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Cross-origin Network Requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Unit Testing Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/unit-testing/)
- [E2E Testing Chrome Extensions](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
- [Building Chrome Extension with Claude API](https://claude-ai.chat/guides/building-chrome-extension/)
- [Local vs Sync vs Session Storage](https://dev.to/notearthian/local-vs-sync-vs-session-which-chrome-extension-storage-should-you-use-5ec8)

---

*Research completed: 2026-01-16*
*Next: T002 - Auchan.pt Compatibility Analysis*
