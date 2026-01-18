# Security & Safety Constraints for Chrome Extension

**Sprint**: Sprint-EXT-R-001
**Task**: T006 - Security & Safety Constraints Documentation
**Date**: 2026-01-16

---

## Overview

This document defines the security boundaries and safety constraints for the AI Shopping Copilot Chrome Extension. The extension handles sensitive data (API keys, shopping history) and automates actions on a commercial website.

---

## 1. Critical Safety Constraint

### NEVER AUTO-PURCHASE

**This is the single most important safety rule.**

```
THE EXTENSION MUST NEVER PLACE ORDERS AUTOMATICALLY.

The system prepares carts for user review but STOPS before checkout.
Any code path that triggers a purchase without explicit user approval
is a CRITICAL SECURITY VIOLATION.
```

### Implementation Safeguards

1. **No Checkout Button Interaction**
   - Content scripts MUST NOT have selectors for checkout/payment buttons
   - Selector registry MUST exclude all checkout-related elements

2. **Phase Boundary Enforcement**
   ```javascript
   const ALLOWED_PHASES = ['cart', 'substitution', 'slots', 'review'];
   // Note: NO 'checkout' or 'payment' phase exists
   ```

3. **User Approval Gate**
   - Run status changes to 'review' before any purchase-adjacent actions
   - Popup MUST display review summary
   - User MUST explicitly confirm (separate from starting the run)

4. **Audit Trail**
   - All cart modifications logged with timestamps
   - Screenshot capability for debugging (not automated capture)

---

## 2. API Key Security

### Storage Strategy

| Approach | Security | UX | Decision |
|----------|----------|-----|----------|
| Session storage | High - cleared on browser close | Good - persists during session | **CHOSEN** |
| Local storage | Low - persists indefinitely | Best - no re-entry | NOT USED |
| Prompt each run | Highest - never stored | Poor - friction | Alternative option |

### Implementation

```javascript
// Store in session storage only
chrome.storage.session.set({ anthropicApiKey: key });

// Clear on extension unload
chrome.runtime.onSuspend.addListener(() => {
  chrome.storage.session.remove('anthropicApiKey');
});
```

### Validation

```javascript
function validateApiKey(key) {
  // Anthropic keys start with 'sk-ant-'
  if (!key?.startsWith('sk-ant-')) {
    return { valid: false, error: 'Invalid API key format' };
  }
  return { valid: true };
}
```

### Never Do

- Store API key in local/sync storage (persists too long)
- Log API key in console or error messages
- Send API key to any domain except api.anthropic.com
- Include API key in content script messages

---

## 3. Content Script Isolation

### Chrome Extension Security Model

Content scripts run in an **isolated world**:
- Separate JavaScript context from the page
- Share DOM access but not JavaScript variables
- Page cannot access content script functions/variables
- Content script cannot access page's JavaScript

### What This Means

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Malicious Auchan.pt script | Cannot read content script variables | Isolation by design |
| XSS on Auchan.pt page | Cannot access extension storage | Isolation by design |
| Content script reads passwords | DOM access allows reading inputs | Don't read password fields |

### Sensitive Element Avoidance

```javascript
// NEVER read these selectors
const FORBIDDEN_SELECTORS = [
  'input[type="password"]',
  'input[name*="card"]',
  'input[name*="cvv"]',
  'input[name*="credit"]',
  '[data-payment]',
  '.payment-form',
  '.checkout-confirm'
];

function safeQuerySelector(selector) {
  if (FORBIDDEN_SELECTORS.some(f => selector.includes(f))) {
    throw new Error('Forbidden selector: potential sensitive data');
  }
  return document.querySelector(selector);
}
```

---

## 4. Data Protection

### Data Classification

| Data | Sensitivity | Storage | Encryption |
|------|-------------|---------|------------|
| Anthropic API Key | HIGH | Session only | N/A (cleared on close) |
| Auchan.pt credentials | HIGH | NEVER stored | N/A |
| Order history cache | MEDIUM | Local storage | Optional |
| User preferences | LOW | Sync storage | N/A |
| Cart contents | LOW | Session storage | N/A |

### Order History Cache

```javascript
// Cache structure
const orderCache = {
  orders: [...],           // Product names, quantities, prices
  lastFetched: timestamp,
  expiresAt: timestamp     // 24-hour TTL
};

// What to cache
const safeToCacheFields = ['productName', 'quantity', 'price', 'date'];

// What NOT to cache
const neverCacheFields = ['paymentMethod', 'cardLast4', 'billingAddress'];
```

### Data Minimization

- Only cache data needed for cart preparation
- Strip personal identifiers from cached orders
- Clear caches on explicit user request
- Implement 24-hour automatic expiration

---

## 5. Communication Security

### Message Passing Security

```javascript
// Content script → Service worker
chrome.runtime.sendMessage({
  action: 'cartScanned',
  items: [...],  // Safe data only
  // NEVER include: passwords, payment info, API keys
});

// Service worker → Content script
chrome.tabs.sendMessage(tabId, {
  action: 'scanCart',
  // No sensitive data in outbound messages
});
```

### External API Calls

Only the service worker makes external calls:

```javascript
// ALLOWED
const ALLOWED_HOSTS = [
  'https://api.anthropic.com'  // LLM API only
];

// Service worker validates before fetch
function isAllowedHost(url) {
  return ALLOWED_HOSTS.some(host => url.startsWith(host));
}
```

### Content Script Network Restrictions

Content scripts should NOT make network calls. All API communication goes through the service worker:

```
Content Script → Message → Service Worker → API
              (internal)              (external)
```

---

## 6. Permission Model

### Requested Permissions

| Permission | Why Needed | Risk Level |
|------------|------------|------------|
| `storage` | Save state, preferences, API key (session) | Low |
| `activeTab` | Interact with current tab only | Low |
| `alarms` | Keep service worker alive for long runs | Low |

### Host Permissions

| Host | Why Needed | Risk Level |
|------|------------|------------|
| `https://*.auchan.pt/*` | DOM automation | Medium |
| `https://api.anthropic.com/*` | LLM API calls | Low |

### Permission Minimization

- No `tabs` permission (can't see all tabs)
- No `history` permission
- No `<all_urls>` permission
- Content script only on auchan.pt (not all sites)

---

## 7. Error Handling Security

### What NOT to Expose

```javascript
// BAD - exposes API key
catch (error) {
  console.error('API call failed:', { apiKey, error });
}

// GOOD - redact sensitive data
catch (error) {
  console.error('API call failed:', error.message);
  // Log to structured format without secrets
}
```

### Error Messages to User

```javascript
const USER_SAFE_ERRORS = {
  'API key not configured': 'Please set your API key in the extension popup.',
  'Rate limited': 'Too many requests. Please wait a moment.',
  'Network error': 'Could not connect to AI service. Check your internet.',
  // Never expose internal details
};
```

---

## 8. Extension Update Security

### On Extension Update

- Session storage is cleared (API key lost - expected)
- Local storage is preserved (order cache - may need migration)
- User must re-enter API key (security feature)

### Migration Considerations

```javascript
// Check schema version on startup
const CURRENT_SCHEMA = 1;

async function migrateIfNeeded() {
  const { schemaVersion } = await chrome.storage.local.get('schemaVersion');

  if (schemaVersion !== CURRENT_SCHEMA) {
    // Clear potentially incompatible data
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ schemaVersion: CURRENT_SCHEMA });
  }
}
```

---

## 9. Security Checklist

### Before Release

- [ ] API key only in session storage
- [ ] No checkout/payment selectors in registry
- [ ] Content scripts don't read password fields
- [ ] Error messages don't expose secrets
- [ ] No sensitive data in console logs
- [ ] Review phase enforced before any order-adjacent actions
- [ ] host_permissions limited to auchan.pt and anthropic.com

### Code Review Focus Areas

- [ ] Any new selectors - check against forbidden list
- [ ] Any new API calls - verify allowed hosts
- [ ] Any new storage - verify appropriate storage type
- [ ] Any new user-facing actions - verify approval gates

---

## 10. Threat Model Summary

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| API key theft | High | Low | Session storage only |
| Auto-purchase bug | Critical | Low | No checkout selectors, review gate |
| XSS on Auchan.pt | Medium | Low | Content script isolation |
| Order history leak | Medium | Low | Local-only, expiration |
| Extension compromise | High | Very Low | Chrome Web Store review |

---

*Security constraints defined: 2026-01-16*
*Next: T007 - Sprint Retrospective & Next Steps*
