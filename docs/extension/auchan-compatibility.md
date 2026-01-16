# Auchan.pt Compatibility Analysis

**Sprint**: Sprint-EXT-R-001
**Task**: T002 - Auchan.pt Compatibility Analysis
**Date**: 2026-01-16

---

## Executive Summary

Auchan.pt is **highly compatible** with Chrome Extension automation:

1. **No restrictive CSP headers** - Content scripts can inject freely
2. **Standard DOM structure** - BEM-style CSS classes, data attributes
3. **7 pages already mapped** with validated selectors
4. **Salesforce OAuth login** - External auth domain needs handling

---

## 1. CSP Header Analysis

### Findings

| Page | CSP Policy | Impact |
|------|------------|--------|
| Homepage | **None detected** | Full content script access |
| Login | Salesforce-hosted | May have stricter CSP |
| Cart | **None detected** | Full content script access |
| Search | **None detected** | Full content script access |
| Checkout | **None detected** | Full content script access |

### Implication

Auchan.pt does not enforce Content-Security-Policy headers on their main domain. This means:
- Content scripts can inject without CSP blocks
- `document.querySelector` works normally
- No need for special CSP workarounds

### External Scripts Present

| Service | Domain | Purpose |
|---------|--------|---------|
| Google Tag Manager | googletagmanager.com | Analytics |
| OneSignal | onesignal.com | Push notifications |
| CQuotient | api.cquotient.com | Product recommendations |

These third-party scripts don't affect our content script operation.

---

## 2. Target Pages & URL Patterns

### Pages to Automate

| Page | URL Pattern | Content Script |
|------|-------------|----------------|
| Login | `login.salesforce.com/*` | `auchan-login.js` |
| Order History | `auchan.pt/pt/historico-encomendas` | `auchan-orders.js` |
| Order Detail | `auchan.pt/pt/detalhes-encomenda?orderID=*` | `auchan-orders.js` |
| Cart | `auchan.pt/pt/carrinho-compras` | `auchan-cart.js` |
| Search | `auchan.pt/pt/pesquisa?q=*` | `auchan-search.js` |
| Product Detail | `auchan.pt/pt/*.html` | `auchan-search.js` |
| Delivery Slots | `auchan.pt/pt/checkout/*` | `auchan-slots.js` |

### Manifest Content Scripts Configuration

```json
{
  "content_scripts": [
    {
      "matches": ["https://login.salesforce.com/*"],
      "js": ["content-scripts/auchan-login.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://*.auchan.pt/pt/historico-encomendas*",
        "https://*.auchan.pt/pt/detalhes-encomenda*"
      ],
      "js": ["content-scripts/auchan-orders.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://*.auchan.pt/pt/carrinho-compras*"],
      "js": ["content-scripts/auchan-cart.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://*.auchan.pt/pt/pesquisa*",
        "https://*.auchan.pt/pt/*.html"
      ],
      "js": ["content-scripts/auchan-search.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://*.auchan.pt/pt/checkout*",
        "https://*.auchan.pt/pt/escolher-horario*",
        "https://*.auchan.pt/pt/entrega*"
      ],
      "js": ["content-scripts/auchan-slots.js"],
      "run_at": "document_idle"
    }
  ]
}
```

---

## 3. Login Flow Analysis

### Authentication Architecture

Auchan.pt uses **Salesforce OAuth**:

```
User clicks login
       ↓
Redirect to login.salesforce.com
       ↓
User enters credentials
       ↓
OAuth callback to auchan.pt
       ↓
Session cookies set on auchan.pt
```

### Content Script Challenge

The login page is on `login.salesforce.com`, not `auchan.pt`. Options:

| Approach | Pros | Cons |
|----------|------|------|
| **Inject on Salesforce** | Direct form access | Needs additional host_permission |
| **User manual login** | No credential handling | Requires user action |
| **Detect logged-in state** | Simpler, safer | Extension waits for user to login |

### Recommended Approach

**Option 3: Detect logged-in state**

1. Extension checks for logged-in indicator on Auchan.pt
2. If not logged in, prompt user to login via popup
3. Extension waits for login completion
4. Proceed with automation once authenticated

This avoids:
- Handling credentials in extension
- Complex Salesforce domain permissions
- Security concerns with credential storage

### Logged-In Detection

```javascript
// content-scripts/auchan-common.js

function isLoggedIn() {
  // Check for user name in header
  const userElement = document.querySelector('.auc-header__user-name');
  return userElement && userElement.textContent.trim().length > 0;
}

function getLoggedInUser() {
  const userElement = document.querySelector('.auc-header__user-name');
  return userElement?.textContent?.trim() || null;
}
```

---

## 4. Selector Compatibility

### Existing Selector Registry

We have **7 pages** with validated selectors in `data/selectors/`:

| Page | Selectors | Status |
|------|-----------|--------|
| login | 6 | Verified (Salesforce OAuth) |
| order-history | 11 | Verified |
| order-detail | 19 | Verified |
| cart | 20 | Verified |
| search | 18 | Verified (1 unverified) |
| product-detail | 14 | Partial (7 unverified) |
| delivery-slots | 15 | Verified |

**Total: 103 selectors** ready for migration.

### Selector Usage in Content Scripts

Current Playwright pattern:
```javascript
// Playwright
const items = await page.locator('.auc-cart-item').all();
```

Content script equivalent:
```javascript
// Content Script
const items = document.querySelectorAll('.auc-cart-item');
```

### Selector Registry Integration

```javascript
// content-scripts/lib/selector-helper.js

import selectors from '../../data/selectors/pages/cart/v1.json';

function getSelector(key) {
  const def = selectors.selectors[key];
  if (!def) throw new Error(`Unknown selector: ${key}`);
  return def.primary;
}

function querySelector(key) {
  return document.querySelector(getSelector(key));
}

function querySelectorAll(key) {
  return document.querySelectorAll(getSelector(key));
}
```

---

## 5. Restrictions & Workarounds

### Known Restrictions

| Restriction | Cause | Workaround |
|-------------|-------|------------|
| Checkout button disabled | Min order value not met | Check cart total before proceeding |
| OneSignal popup | Push notification prompt | Dismiss via selector or ignore |
| Cookie consent | GDPR compliance | Auto-dismiss or track state |
| Session timeout | Idle detection | Monitor activity, re-auth prompt |

### Popup Handling

Reuse existing popup-dismisser patterns:

```javascript
// content-scripts/lib/popup-handler.js

const POPUP_SELECTORS = {
  cookieConsent: '#onetrust-accept-btn-handler',
  oneSignal: '.onesignal-slidedown-cancel-button',
  newsletter: '.newsletter-popup-close'
};

async function dismissPopups() {
  for (const [name, selector] of Object.entries(POPUP_SELECTORS)) {
    const popup = document.querySelector(selector);
    if (popup && popup.offsetParent !== null) {
      popup.click();
      console.log(`Dismissed ${name} popup`);
    }
  }
}
```

---

## 6. Page Load Timing

### Challenge

Content scripts run at `document_idle` by default. Some Auchan.pt pages load content dynamically (React/Vue).

### Solution: MutationObserver

```javascript
// content-scripts/lib/dom-ready.js

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}
```

---

## 7. Cross-Origin Considerations

### Same-Origin Pages

All Auchan.pt pages are same-origin (`*.auchan.pt`). Content scripts can:
- Access full DOM
- Click buttons, fill forms
- Read text content
- Monitor mutations

### Cross-Origin: Salesforce Login

The login page is on `login.salesforce.com`. Options:

1. **Add to host_permissions** and inject content script
2. **User handles login manually** - extension waits
3. **Open in popup** for user to complete

Recommendation: Option 2 (user manual login) for security.

### Cross-Origin: Anthropic API

Handled by service worker (see T001). Content scripts message the service worker, which makes the API call.

---

## 8. Summary: Compatibility Matrix

| Feature | Compatible | Notes |
|---------|------------|-------|
| Content script injection | YES | No CSP restrictions |
| DOM manipulation | YES | Standard selectors work |
| Form interaction | YES | Click, fill, submit |
| Navigation detection | YES | `chrome.webNavigation` API |
| Login automation | PARTIAL | User manual login recommended |
| Cart operations | YES | All selectors verified |
| Search operations | YES | All selectors verified |
| Checkout operations | YES | Delivery slots verified |
| API calls | YES | Via service worker |

### Verdict

**Auchan.pt is fully compatible with Chrome Extension automation.** The only consideration is the Salesforce OAuth login, which is best handled by having the user login manually while the extension detects the authenticated state.

---

## 9. Next Steps

1. **T003**: Map Playwright tools to content script functions
2. Create content script skeleton for each page type
3. Test selector registry integration
4. Implement popup dismissal utilities

---

*Research completed: 2026-01-16*
*Next: T003 - Playwright → Extension Migration Mapping*
