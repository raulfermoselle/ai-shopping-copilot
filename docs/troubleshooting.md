# Troubleshooting Playwright Failures

This guide covers common issues with browser automation and how to resolve them.

## Common Selector Issues

### Problem: Element Not Found

**Error Message:**
```
Error: waiting for selector ".auc-cart-item" failed: timeout 10000ms exceeded
```

**Causes:**
1. Selector changed on the website
2. Element not yet loaded (timing issue)
3. Element hidden or not rendered
4. Wrong page context

**Solutions:**

1. **Update selectors:**
   ```bash
   # Check current selectors
   cat data/selectors/pages/cart/v1.json

   # Run selector validation
   npm run validate-selectors
   ```

2. **Increase timeout:**
   ```typescript
   await page.waitForSelector('.auc-cart-item', {
     timeout: 30000,  // Increase from default
     state: 'visible'
   });
   ```

3. **Use fallback chain:**
   ```typescript
   const resolver = new SelectorResolver();
   const result = await resolver.tryResolve(page, 'cart', 'cartItem', {
     timeout: 15000,
     state: 'visible'
   });
   ```

4. **Check page state:**
   ```typescript
   // Ensure page is fully loaded
   await page.waitForLoadState('networkidle');
   ```

### Problem: Multiple Elements Match

**Error Message:**
```
Error: strict mode violation: locator('.cart-item') resolved to 15 elements
```

**Solution:**
```typescript
// Use .first() for the first match
await page.locator('.cart-item').first().click();

// Or use more specific selector
await page.locator('.cart-item[data-product-id="P123"]').click();

// Or iterate all matches
const items = await page.locator('.cart-item').all();
for (const item of items) {
  const name = await item.locator('.item-name').textContent();
  console.log(name);
}
```

### Problem: Selector Works in DevTools But Fails in Code

**Causes:**
- Shadow DOM
- Iframes
- Dynamic content loading
- CSS transitions

**Solution:**
```typescript
// Check for iframes
const frame = page.frameLocator('iframe.checkout-frame');
await frame.locator('.submit-button').click();

// Handle shadow DOM
const host = await page.locator('.shadow-host').elementHandle();
const shadowRoot = await host.evaluateHandle(el => el.shadowRoot);

// Wait for transitions
await page.waitForTimeout(500);  // After animation
```

## Login/Auth Failures

### Problem: Login Form Not Found

**Error Message:**
```
Error: waiting for selector "#uname1" failed: timeout 10000ms exceeded
```

**Diagnosis:**
```typescript
// Capture screenshot at failure point
await page.screenshot({ path: 'debug-login.png' });

// Check current URL
console.log('Current URL:', page.url());

// Check for redirects
page.on('response', response => {
  if (response.status() >= 300 && response.status() < 400) {
    console.log('Redirect:', response.url());
  }
});
```

**Solutions:**

1. **Handle OAuth redirects:**
   ```typescript
   // Auchan uses Salesforce OAuth
   // Wait for redirect to complete
   await page.waitForURL(/login\.salesforce\.com|auchan\.pt/);
   ```

2. **Update login selectors:**
   ```json
   // data/selectors/pages/login/v1.json
   {
     "emailInput": {
       "primary": "#uname1",
       "fallbacks": [
         "input[name='username']",
         "input[type='email']",
         "[data-testid='email-input']"
       ]
     }
   }
   ```

### Problem: Invalid Credentials

**Error Message:**
```
Error: Login failed: Invalid username or password
```

**Solutions:**

1. **Verify credentials:**
   ```bash
   # Check .env file
   cat .env | grep AUCHAN

   # Test manually
   # Go to auchan.pt and try logging in with these credentials
   ```

2. **Check for account issues:**
   - Account locked after failed attempts
   - Password expired
   - Two-factor authentication enabled

3. **Clear session and retry:**
   ```bash
   rm -rf sessions/auchan-session.json
   npm run demo
   ```

### Problem: Session Expired

**Error Message:**
```
Error: Session restored but user not logged in
```

**Solutions:**

1. **Force fresh login:**
   ```typescript
   const loginTool = createLoginTool();
   await loginTool.execute({ forceLogin: true }, context);
   ```

2. **Clear session storage:**
   ```bash
   rm sessions/auchan-session.json
   ```

3. **Reduce session max age:**
   ```typescript
   // config
   const sessionConfig = {
     maxAge: 4 * 60 * 60 * 1000  // 4 hours instead of 24
   };
   ```

## Timeout Handling

### Problem: Navigation Timeout

**Error Message:**
```
Error: page.goto: Timeout 30000ms exceeded
```

**Solutions:**

1. **Increase navigation timeout:**
   ```bash
   # .env
   AUCHAN_TIMEOUT_NAVIGATION=60000
   ```

2. **Check network conditions:**
   ```typescript
   // Add retry logic
   const result = await withRetry(
     () => page.goto('https://www.auchan.pt'),
     { maxRetries: 3, baseDelayMs: 2000 }
   );
   ```

3. **Use different wait strategy:**
   ```typescript
   // Don't wait for all resources
   await page.goto('https://www.auchan.pt', {
     waitUntil: 'domcontentloaded'  // Instead of 'load'
   });
   ```

### Problem: Element Wait Timeout

**Error Message:**
```
Error: Timeout 10000ms exceeded while waiting for selector
```

**Solutions:**

1. **Increase element timeout:**
   ```bash
   # .env
   AUCHAN_TIMEOUT_ELEMENT=20000
   ```

2. **Check visibility state:**
   ```typescript
   // Element might exist but not visible
   await page.waitForSelector('.element', {
     state: 'attached'  // Less strict than 'visible'
   });
   ```

3. **Add intermediate wait:**
   ```typescript
   // Wait for page to settle
   await page.waitForLoadState('networkidle');
   await page.waitForSelector('.element');
   ```

### Problem: Action Timeout

**Error Message:**
```
Error: locator.click: Timeout 30000ms exceeded
```

**Solutions:**

1. **Scroll element into view:**
   ```typescript
   const element = page.locator('.button');
   await element.scrollIntoViewIfNeeded();
   await element.click();
   ```

2. **Dismiss overlays:**
   ```typescript
   // Check for popups/modals
   const popup = page.locator('.modal-overlay');
   if (await popup.isVisible()) {
     await popup.locator('.close-button').click();
   }
   ```

3. **Force click:**
   ```typescript
   await page.locator('.button').click({ force: true });
   ```

## Session Recovery

### Problem: Session Lost Mid-Run

**Error Message:**
```
Error: Navigation interrupted - session context destroyed
```

**Solutions:**

1. **Use session persistence:**
   ```typescript
   // coordinator.ts stores session state
   const session = await this.recoverSession(sessionId);
   if (session.status === 'loading_cart') {
     // Resume from where we left off
   }
   ```

2. **Implement checkpoint saves:**
   ```typescript
   // After each major step
   await saveCheckpoint(session);
   ```

3. **Handle browser crashes:**
   ```typescript
   browser.on('disconnected', async () => {
     logger.error('Browser disconnected');
     await saveSession(currentSession);
   });
   ```

### Problem: Cart State Mismatch

**Error Message:**
```
Warning: Cart on website doesn't match session state
```

**Solutions:**

1. **Rescan cart:**
   ```typescript
   // Force cart refresh
   const currentCart = await scanCartTool.execute({}, context);
   session.cart = currentCart;
   ```

2. **Clear and rebuild:**
   ```typescript
   // Clear cart and re-add items
   await clearCart(context);
   await reorderFromHistory(context, orderIds);
   ```

## Debug Mode

### Enabling Debug Mode

```bash
# Environment variables
BROWSER_HEADLESS=false    # See the browser
BROWSER_SLOW_MO=500       # Slow down actions
LOG_LEVEL=debug           # Verbose logging
```

### Debug Script

```typescript
// scripts/debug-session.ts
import { chromium } from 'playwright';

async function debugSession() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    devtools: true,  // Open DevTools
  });

  const context = await browser.newContext({
    recordVideo: { dir: 'debug-videos/' }
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  // Your automation code here...
}
```

### Tracing

```typescript
// Enable tracing for detailed debugging
await context.tracing.start({
  screenshots: true,
  snapshots: true,
  sources: true
});

try {
  // Run automation
  await runSession(page);
} finally {
  await context.tracing.stop({
    path: 'trace.zip'
  });
}

// View trace
// npx playwright show-trace trace.zip
```

## Screenshot Capture

### Automatic Screenshots

Screenshots are captured at key points:
- `login-page-{timestamp}.png` - Before login
- `login-success-{timestamp}.png` - After login
- `cart-before-{timestamp}.png` - Cart state before changes
- `cart-after-{timestamp}.png` - Cart state after changes
- `error-{timestamp}.png` - On error

### Manual Screenshot

```typescript
// Capture full page
await page.screenshot({
  path: 'debug.png',
  fullPage: true
});

// Capture specific element
await page.locator('.cart-container').screenshot({
  path: 'cart-element.png'
});

// Capture with debug info
await page.screenshot({
  path: `debug-${Date.now()}.png`,
  type: 'png',
  mask: [page.locator('.sensitive-data')]  // Hide sensitive areas
});
```

### Screenshot on Error

```typescript
try {
  await performAction();
} catch (error) {
  await context.screenshot(`error-${Date.now()}`);
  throw error;
}
```

## Common Error Messages and Solutions

### Error: net::ERR_CONNECTION_REFUSED

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at https://www.auchan.pt
```

**Cause:** Cannot connect to website

**Solution:**
- Check internet connection
- Verify website is accessible in browser
- Check for firewall/proxy issues

### Error: strict mode violation

```
Error: locator('.btn') resolved to 5 elements
```

**Cause:** Selector matches multiple elements

**Solution:**
```typescript
// Be more specific
await page.locator('.btn.primary').click();
// Or use first
await page.locator('.btn').first().click();
```

### Error: Element is not visible

```
Error: element is not visible
```

**Cause:** Element exists but hidden

**Solution:**
```typescript
// Wait for visibility
await page.locator('.element').waitFor({ state: 'visible' });
// Or scroll into view
await page.locator('.element').scrollIntoViewIfNeeded();
```

### Error: Target closed

```
Error: Target page, context or browser has been closed
```

**Cause:** Browser/page was closed unexpectedly

**Solution:**
```typescript
// Check before operations
if (page.isClosed()) {
  page = await context.newPage();
}

// Handle close events
page.on('close', () => {
  console.log('Page was closed');
});
```

### Error: Cookie consent required

```
Warning: Cookie consent banner blocking interaction
```

**Solution:**
```typescript
// Handle before main automation
await handleCookieConsent(page);

async function handleCookieConsent(page: Page) {
  const consentButton = page.locator('[data-testid="cookie-accept"]');
  if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await consentButton.click();
    await page.waitForTimeout(500);
  }
}
```

## Getting Help

### Collect Debug Information

When reporting issues, include:

1. **Error message and stack trace**
2. **Screenshots at failure point**
3. **Log output** (`LOG_LEVEL=debug`)
4. **Session state** (from `sessions/`)
5. **Browser version**
6. **Node.js version**

### Debug Checklist

- [ ] Is the website accessible manually?
- [ ] Are credentials correct?
- [ ] Are selectors up to date?
- [ ] Is the session valid?
- [ ] Are there popups blocking?
- [ ] Is the page fully loaded?
- [ ] Are timeouts sufficient?
