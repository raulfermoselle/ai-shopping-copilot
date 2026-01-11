# ScanCartTool Implementation

**Status:** Complete
**Date:** 2026-01-11
**File:** `src/agents/cart-builder/tools/scan-cart.ts`

## Overview

The ScanCartTool extracts the current shopping cart state from Auchan.pt, returning a CartSnapshot with all items, quantities, prices, and availability information.

## Implementation

### Tool Interface

```typescript
Tool<ScanCartInput, ScanCartOutput>
```

### Input

```typescript
{
  expandAll: boolean;          // Expand collapsed cart sections
  captureScreenshot: boolean;  // Capture screenshot of cart
}
```

### Output

```typescript
{
  snapshot: CartSnapshot;  // Current cart state
  isEmpty: boolean;        // Whether cart is empty
  cartUrl: string;         // Cart page URL
  screenshot?: string;     // Screenshot path (if captured)
}
```

## Features

### 1. Navigation
- Navigates to cart page if not already there (`/pt/carrinho-compras`)
- Validates cart page loaded before extraction

### 2. Empty Cart Detection
- Checks for `.auc-cart--empty` indicator
- Returns empty CartSnapshot immediately if detected
- Saves time by avoiding unnecessary extraction attempts

### 3. Item Extraction
- Finds all cart item elements using Selector Registry
- For each item, extracts:
  - **Product Name**: Text content from product name element
  - **Product URL**: Link to product detail page
  - **Product ID**: Extracted from product URL
  - **Quantity**: From numeric input field
  - **Unit Price**: Parsed from price element (handles "1,39 €" format)
  - **Availability**: Checks for unavailable/out-of-stock indicators
  - **Availability Note**: Captures unavailability message if present

### 4. Price Calculation
- Primary: Extracts cart total from page element
- Fallback: Calculates total from sum of (quantity × unitPrice) for all items

### 5. Error Handling
- Graceful handling of missing elements (try-catch for each field)
- Continues extraction if individual items fail
- Logs warnings for failed extractions
- Captures error screenshots for debugging

## Selector Registry Integration

### Cart Page Selectors (v1.json)

**Status:** Partially Verified

- **Empty cart selectors**: VERIFIED
  - `.auc-cart--empty` - Empty cart indicator
  - `.auc-cart--empty__title` - Empty message text

- **Cart item selectors**: NOT YET VERIFIED (based on Auchan patterns)
  - `.auc-cart__product` - Individual cart item
  - `.auc-cart__product-name` - Product name
  - `.auc-cart__qty-input` - Quantity input
  - `.auc-cart__product-price` - Unit price
  - `.auc-cart__total` - Cart total

**Verification Status**: Empty cart tested successfully. Item selectors need validation with actual cart containing items.

## Utility Functions

### parseCurrency(text: string): number
Parses Auchan price format:
- Input: `"1,39 €"`
- Output: `1.39`
- Handles: whitespace removal, comma → dot conversion, € symbol removal

### extractProductId(url: string): string | undefined
Extracts product ID from Auchan product URLs:
- Pattern: `/produtos/{productId}`
- Returns: productId or undefined

### parseQuantity(value: string | null): number
Parses quantity from input value:
- Handles null/empty → defaults to 1
- Parses integer, validates >= 1

## Testing

**Test Script**: `scripts/test-scan-cart.ts`

### Test Results (2026-01-11)

✅ **Test 1: Empty Cart**
- Success: true
- Is Empty: true
- Item Count: 0
- Total Price: 0
- Duration: 2895 ms
- Screenshot captured: ✓

## Known Limitations

1. **Cart item selectors not verified** - Based on Auchan naming patterns but not tested with real cart items
2. **No "show more" button handling** - expandAll parameter exists but "show more" selectors not identified
3. **Availability detection untested** - No test data for out-of-stock items yet

## Next Steps

1. **Verify item selectors** - Add items to cart and validate extraction
2. **Test with unavailable items** - Validate availability detection logic
3. **Update selectors** - Adjust v1.json based on real cart item structure
4. **Performance optimization** - Consider caching cart state for repeated scans

## Integration

**Used By:**
- CartBuilder agent (future)
- Cart diff computation
- Availability checking workflows

**Dependencies:**
- Selector Registry (`cart` page)
- Logger (structured logging)
- Screenshot utility

## Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `src/agents/cart-builder/tools/scan-cart.ts` | Created | Tool implementation |
| `data/selectors/pages/cart/v1.json` | Created | Cart page selectors |
| `data/selectors/registry.json` | Updated | Added cart page entry |
| `src/agents/cart-builder/tools/index.ts` | Updated | Export scanCartTool |
| `scripts/test-scan-cart.ts` | Created | Test script |
| `scripts/discover-cart-page.ts` | Created | Selector discovery |
| `scripts/discover-cart-with-items.ts` | Created | Attempt to discover with items |

## Cart Snapshot Schema

```typescript
{
  timestamp: Date;
  items: CartItem[];
  itemCount: number;
  totalPrice: number;
}
```

```typescript
CartItem {
  productId?: string;
  name: string;
  productUrl?: string;
  quantity: number;
  unitPrice: number;
  available: boolean;
  availabilityNote?: string;
}
```

---

**Completion Status:** ✅ Tool implemented and tested with empty cart. Item extraction logic ready but requires validation with actual cart items.
