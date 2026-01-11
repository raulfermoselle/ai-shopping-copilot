# Login Page Selector Discovery Report

**Date:** 2026-01-11
**Engineer:** agent:playwright-rpa-engineer
**Target:** Auchan.pt OAuth Login (Salesforce)
**Status:** VERIFIED AND WORKING

---

## Summary

Conducted full selector discovery protocol on Auchan.pt login flow. Updated selector registry with verified selectors from live page capture. Login automation now working successfully.

---

## Discovery Protocol Executed

### 1. Live Page Capture
- **Script:** `scripts/discover-login-selectors.ts`
- **Method:** Headed browser navigation with HTML snapshot capture
- **URL:** `https://login.auchan.pt/authorization?language=pt&startURL=...`

### 2. HTML Analysis
- **Snapshot Location:** `data/selectors/pages/login/snapshots/login-page-2026-01-11T12-25-25-234Z.html`
- **Screenshot:** `screenshots/login-page-2026-01-11T12-25-25-234Z.png`
- **Page Title:** "Aceda à sua conta" (Access your account)

### 3. Selector Identification

#### Email Input
```html
<input class="form-control form-control-lg"
       id="uname1"
       name="uname1"
       type="email"
       mandatory="true"
       onkeyup="return noenter(event)">
```

**Primary Selector:** `#uname1`
**Stability Score:** 90/100
**Rationale:** ID selector, stable Salesforce pattern

#### Password Input
```html
<input class="form-control form-control-lg"
       id="pwd1"
       name="passwordLogin"
       type="password"
       mandatory="true"
       onkeyup="return noenter(event)">
```

**Primary Selector:** `#pwd1`
**Stability Score:** 90/100
**Rationale:** ID selector, stable Salesforce pattern

#### Submit Button
```html
<input class="btn btn-success btn-lg align-middle w-100"
       id="btnSubmit_login"
       type="button"
       value="Aceda à sua conta">
```

**Primary Selector:** `#btnSubmit_login`
**Stability Score:** 95/100
**Rationale:** ID selector, unique and stable

**CRITICAL FINDING:** Submit button is `type="button"` NOT `type="submit"`. It triggers AJAX login via onclick handler that calls the `login()` JavaScript function.

---

## Updated Selectors

### Registry Update
**File:** `data/selectors/pages/login/v1.json`

| Element | Old Primary | New Primary | Reason |
|---------|-------------|-------------|--------|
| emailInput | `#username` | `#uname1` | Actual ID from live page |
| passwordInput | `#password` | `#pwd1` | Actual ID from live page |
| submitButton | `button[type="submit"]` | `#btnSubmit_login` | Actual ID; type is "button" not "submit" |

### Code Update
**File:** `src/tools/login.ts`

Updated `LOGIN_SELECTORS` constant to match registry with proper fallback chains:

```typescript
emailInput: '#uname1, input[type="email"], input[name="uname1"], input[name="username"], input[name="email"]',
passwordInput: '#pwd1, input[type="password"], input[name="passwordLogin"], input[name="password"]',
submitButton: '#btnSubmit_login, input[type="button"][value*="Aceda"], input.btn-success[type="button"], button:has-text("Aceda à sua conta"), input[type="submit"]',
```

---

## Test Results

### Test Execution
**Script:** `scripts/test-login.ts`
**Run Date:** 2026-01-11 12:28:07 UTC
**Duration:** 22.6 seconds
**Result:** SUCCESS

### Execution Flow
1. Navigate to homepage: https://www.auchan.pt
2. Accept cookie consent (OneTrust banner)
3. Click account/login button
4. Wait for OAuth page load
5. Fill email: raul.fermoselle@gmail.com
6. Fill password: (credentials from .env)
7. Click submit button
8. Wait for login completion
9. Verify logged-in state

### Verification
- **User Detected:** "Olá, RAUL"
- **Final URL:** https://www.auchan.pt/
- **Screenshots Captured:**
  - Login page: `2026-01-11T12-28-18-079Z-login-page.png`
  - Login success: `2026-01-11T12-28-30-507Z-login-success.png`

---

## Selector Stability Analysis

### High Stability (90-95)
These selectors are ID-based and unlikely to change:

- `#uname1` - Email input
- `#pwd1` - Password input
- `#btnSubmit_login` - Submit button

### Medium Stability (80-85)
These selectors are class-based with Salesforce conventions:

- `.form-control` - Form inputs (too generic, not used)
- `.btn-success` - Submit button (used as fallback)

### Fallback Chain Rationale

1. **Primary:** ID selector (fastest, most stable)
2. **Secondary:** Type + name attributes (structural stability)
3. **Tertiary:** Text content (language-dependent, last resort)

---

## Known Quirks and Behavior Notes

### AJAX Login Flow
The login form does NOT use standard HTML form submission. Instead:

1. Submit button has `onclick` handler
2. Handler calls JavaScript `login(username, password, startUrl, hpot)` function
3. Function uses `A4J.AJAX.Submit` (Ajax4jsf library)
4. After AJAX success, page redirects to startURL

**Implication:** Playwright must wait for network activity and state changes, not just navigation.

### Honeypot Field
Form includes a hidden honeypot field:
```html
<input class="hfield" id="potfield" type="text">
```

This is an anti-bot measure. The `login()` function passes this value. Currently not filled by automation (left empty).

### Session Indicators
After successful login, the page shows:
- Selector: `.auc-header__user-name`
- Content: "Olá, [FIRST_NAME]"

### Error Messages
Login errors appear in:
- Selector: `.slds-form-element__help` (Salesforce Lightning Design System)
- Also: `[role="alert"]`

---

## Recommendations

### Immediate
1. Monitor selector stability over next 2-3 weeks
2. Log selector match attempts for early detection of changes
3. Implement selector version detection (compare page structure hash)

### Future Enhancements
1. Add multi-language support (EN, FR, PT selectors)
2. Implement honeypot field handling if bot detection occurs
3. Add retry logic for AJAX timeout scenarios
4. Capture and parse AJAX error responses

### Resilience Patterns
1. Implement checkpoint after successful login
2. Store session cookies for faster re-authentication
3. Add circuit breaker if 3 consecutive logins fail
4. Screenshot on every error for debugging

---

## Files Modified

1. `data/selectors/pages/login/v1.json` - Updated selector registry
2. `src/tools/login.ts` - Updated LOGIN_SELECTORS constant
3. `scripts/discover-login-selectors.ts` - NEW: Discovery automation script

## Files Created

1. `data/selectors/pages/login/snapshots/login-page-2026-01-11T12-25-25-234Z.html` - HTML snapshot
2. `data/selectors/pages/login/snapshots/homepage-2026-01-11T12-25-25-234Z.html` - Homepage snapshot
3. `screenshots/login-page-2026-01-11T12-25-25-234Z.png` - Login page screenshot
4. `screenshots/2026-01-11T12-28-18-079Z-login-page.png` - Test login page
5. `screenshots/2026-01-11T12-28-30-507Z-login-success.png` - Test success

---

## Conclusion

Login selector discovery completed successfully. All selectors verified against live Auchan.pt page. Login automation tested and working. Registry updated with high-stability ID-based selectors and comprehensive fallback chains.

**Next Steps:**
- Monitor selector stability
- Test login across different sessions
- Implement session state checkpointing
- Add error recovery scenarios

---

**Verification Signature:**
Selectors verified: 2026-01-11 12:28 UTC
Test passed: YES
Login working: YES
Production ready: YES (with monitoring)
