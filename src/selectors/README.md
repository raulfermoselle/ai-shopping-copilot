# Selector Registry & Resilient Resolution

Production-grade selector management system with intelligent fallback strategies, retry logic, and graceful degradation.

## Quick Start

```typescript
import { ResilientResolver } from './selectors';

// Create resolver
const resolver = new ResilientResolver();

// Resolve with full resilience
const result = await resolver.resolve(page, 'login', 'emailInput', {
  timeout: 10000,
  enableTextHeuristics: true,
  captureScreenshot: true,
});

if (result.success && result.element) {
  await result.element.fill('user@example.com');
  console.log(`Resolved with ${result.confidence} confidence using ${result.strategy}`);
} else {
  console.error(`Failed after ${result.attempts} attempts: ${result.error}`);
  if (result.screenshot) {
    console.log(`Screenshot saved: ${result.screenshot}`);
  }
}
```

## Features

### 1. Multiple Selector Fallbacks

The resolver tries selectors in order of stability:
1. **Primary selector** - Highest stability (data-testid, ID)
2. **Fallback 1-3** - Registered alternatives (aria-label, class, xpath)
3. **Text heuristics** - Last resort text-based matching
4. **Structural heuristics** - DOM structure patterns

### 2. Retry Logic with Escalation

Four-attempt strategy with increasing sophistication:

| Attempt | Strategy | Timeout | Notes |
|---------|----------|---------|-------|
| 1 | Primary selector | 2s | Fast fail |
| 2 | Registered fallbacks | 3s | 500ms delay before retry |
| 3 | Text-based heuristics | 2s | Screenshot captured |
| 4 | Structural heuristics | 2s | DOM tolerance enabled |

### 3. Confidence Tracking

Resolution results include confidence levels:

- **high** - Primary selector matched
- **medium** - Early fallback or DOM-tolerant selector
- **low** - Text heuristic matched
- **very-low** - Structural heuristic or failed

### 4. Graceful Degradation

Options for handling degraded matches:

```typescript
const result = await resolver.resolve(page, 'cart', 'productName', {
  allowDegraded: true,  // Accept low-confidence matches
  enableTextHeuristics: true,
  enableStructuralHeuristics: true,
});

if (result.success) {
  if (result.confidence === 'low' || result.confidence === 'very-low') {
    console.warn(`Low confidence match: ${result.warnings.join(', ')}`);
    // Mark data as provisional
  }
}
```

## DOM Structure Tolerance

Handles minor DOM changes automatically:

```typescript
const result = await resolver.resolveWithDomTolerance(
  page,
  'search',
  'productTile'
);

// Tolerates:
// - Extra wrapper divs
// - CSS module suffixes (.button_abc123)
// - Dynamic class names
```

## Batch Resolution

Resolve multiple selectors concurrently:

```typescript
const results = await resolver.resolveBatch(
  page,
  'cart',
  ['cartItem', 'productName', 'productPrice', 'quantityInput']
);

for (const [key, result] of results) {
  console.log(`${key}: ${result.success ? 'found' : 'not found'}`);
}
```

## Fallback Strategies

### Text-Based Heuristics

Automatically generated from selector definitions:

- `button:has-text("Login")` - Exact text match
- `[aria-label*="submit" i]` - Aria-label contains
- `input[placeholder*="email" i]` - Placeholder text
- `[title*="add to cart" i]` - Title attribute

### Structural Heuristics

Pattern-based DOM navigation:

- `header button` - Element in semantic section
- `input[type="email"]` - Type-specific patterns
- `[role="navigation"] a` - ARIA landmark regions
- `[class*="login"]` - Partial class matching

### Custom Text Hints

Provide additional hints for text-based fallbacks:

```typescript
const result = await resolver.resolve(page, 'cart', 'checkoutButton', {
  enableTextHeuristics: true,
  textHints: ['Finalizar', 'Checkout', 'Pagar'],
});
```

## Diagnostic Information

Failed resolutions capture diagnostic data:

```typescript
const result = await resolver.resolve(page, 'cart', 'unavailableElement', {
  captureScreenshot: true,
  captureDomSnapshot: true,
});

if (!result.success && result.diagnostic) {
  console.log('Tried selectors:', result.diagnostic.triedSelectors);
  console.log('Page URL:', result.diagnostic.pageUrl);
  console.log('Screenshot:', result.screenshot);
  // DOM snapshot available in result.diagnostic.domSnapshot
}
```

## Best Practices

### 1. Always Check Confidence

```typescript
const result = await resolver.resolve(page, 'search', 'productPrice');

if (result.success && result.element) {
  if (result.confidence === 'high' || result.confidence === 'medium') {
    // High confidence - safe to proceed
    await processElement(result.element);
  } else {
    // Low confidence - validate data or skip
    console.warn(`Low confidence match: ${result.warnings.join(', ')}`);
    // Consider manual review or alternative approach
  }
}
```

### 2. Handle Warnings

```typescript
if (result.success && result.warnings.length > 0) {
  console.log('Resolution warnings:');
  result.warnings.forEach(w => console.log(`  - ${w}`));

  // Log to monitoring system for selector health tracking
  monitoring.track('selector_degraded', {
    pageId: 'cart',
    selectorKey: 'productName',
    warnings: result.warnings,
  });
}
```

### 3. Set Appropriate Timeouts

```typescript
// Fast operations (element visibility)
await resolver.resolve(page, 'login', 'submitButton', { timeout: 3000 });

// Slow operations (network-dependent)
await resolver.resolve(page, 'cart', 'cartItems', { timeout: 15000 });

// Critical operations (may require multiple attempts)
await resolver.resolve(page, 'checkout', 'paymentForm', {
  timeout: 20000,
  maxAttempts: 5,
});
```

### 4. Disable Heuristics for Critical Elements

For elements that must be exact (payment, submit):

```typescript
const result = await resolver.resolve(page, 'checkout', 'submitPayment', {
  enableTextHeuristics: false,  // Disable text fallbacks
  enableStructuralHeuristics: false,  // Disable structural fallbacks
  allowDegraded: false,  // Only accept high-confidence matches
});

if (!result.success) {
  throw new Error('Critical element not found - aborting');
}
```

## Options Reference

```typescript
interface ResilientResolveOptions {
  /** Total timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Required element state (default: 'visible') */
  state?: 'visible' | 'attached' | 'hidden';

  /** Maximum retry attempts (default: 4) */
  maxAttempts?: number;

  /** Capture screenshot on failure (default: true) */
  captureScreenshot?: boolean;

  /** Capture DOM snapshot on failure (default: false) */
  captureDomSnapshot?: boolean;

  /** Try text-based heuristics (default: true) */
  enableTextHeuristics?: boolean;

  /** Try structural heuristics (default: true) */
  enableStructuralHeuristics?: boolean;

  /** Custom text hints for fallbacks (default: []) */
  textHints?: string[];

  /** Allow degraded confidence results (default: true) */
  allowDegraded?: boolean;
}
```

## Migration from SelectorResolver

Old approach:
```typescript
import { SelectorResolver } from './selectors';
const resolver = new SelectorResolver();
const result = await resolver.tryResolve(page, 'login', 'emailInput');
```

New approach:
```typescript
import { ResilientResolver } from './selectors';
const resolver = new ResilientResolver();
const result = await resolver.resolve(page, 'login', 'emailInput');
// Now includes: confidence, warnings, diagnostics, retry logic
```

## Architecture

```
ResilientResolver
    │
    ├─> SelectorResolver (basic resolution)
    │   └─> SelectorRegistry (selector storage)
    │
    ├─> FallbackStrategies (text & structural heuristics)
    │   ├─> generateTextHeuristics()
    │   ├─> generateStructuralHeuristics()
    │   └─> generateDomTolerantSelectors()
    │
    └─> Retry Logic (4-attempt escalation)
        ├─> Attempt 1: Primary
        ├─> Attempt 2: Fallbacks + delay
        ├─> Attempt 3: Text heuristics + screenshot
        └─> Attempt 4: Structural heuristics
```

## Screenshots

Screenshots are automatically saved to:
```
data/diagnostics/selectors/{pageId}_{selectorKey}_{attempt}_{timestamp}.png
```

Example: `cart_productName_attempt-3_2026-01-12T10-30-45-123Z.png`

## Performance

- **Primary selector match**: ~50ms average
- **Fallback selector match**: ~500ms average (includes 500ms delay)
- **Text heuristic match**: ~2s average (multiple attempts)
- **Full escalation (all attempts)**: ~10s maximum

## Troubleshooting

### Element found but wrong confidence

Update selector definition in registry with better fallbacks:

```json
{
  "primary": "#specific-id",
  "fallbacks": [
    "[data-testid='specific-test']",
    ".semantic-class-name",
    "button[type='submit']"
  ]
}
```

### Heuristics matching wrong element

Provide better text hints or disable heuristics:

```typescript
await resolver.resolve(page, 'cart', 'removeButton', {
  textHints: ['Remover', 'Eliminar'],  // More specific hints
  enableStructuralHeuristics: false,   // Disable if too broad
});
```

### Timeout too short

Increase timeout and attempts for network-dependent elements:

```typescript
await resolver.resolve(page, 'search', 'productResults', {
  timeout: 20000,
  maxAttempts: 5,
});
```

---

**Last Updated:** 2026-01-12
**Sprint:** Sprint-G-004 (UI & Selector Resilience)
**Status:** Production Ready
