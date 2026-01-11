# CartBuilder Order Detail Tools Implementation

**Status:** Complete
**Date:** 2026-01-11
**Sprint:** Sprint-CB-I-001

## Overview

Implemented two critical CartBuilder tools for order detail interaction:
1. **LoadOrderDetailTool** - Extracts complete order information from detail pages
2. **ReorderTool** - Adds all items from a previous order to cart

## Files Created

| File | Description | Lines |
|------|-------------|-------|
| `src/agents/cart-builder/tools/load-order-detail.ts` | Full order detail extraction with all items | 420 |
| `src/agents/cart-builder/tools/reorder.ts` | Reorder button automation | 280 |
| `scripts/test-order-detail-tools.ts` | Validation test script | 95 |

## LoadOrderDetailTool

### Purpose
Navigate to an order detail page and extract complete order information including all products, delivery details, and cost summary.

### Input
```typescript
{
  orderId: string;           // Order ID to load
  detailUrl: string;         // Full URL to order detail page
  expandAllProducts: boolean; // Whether to click "Ver todos" (default: true)
}
```

### Output
```typescript
{
  order: OrderDetail;        // Complete order with items, delivery, costs
  allProductsLoaded: boolean; // Whether all products were loaded
  screenshot?: string;       // Screenshot of order detail page
}
```

### Features
- **Navigation** - Goes to order detail URL, waits for page load
- **Product Expansion** - Optionally clicks "Ver todos" to show all products
- **Comprehensive Extraction**:
  - Order header (ID, date, product count, total)
  - Delivery info (type, address, date/time)
  - All product items (name, URL, quantity, price, product ID)
  - Cost summary (subtotal, delivery fee, total)
- **Validation** - Zod schema validation of extracted data
- **Error Handling** - Graceful failures with screenshots

### Parsing Utilities
- `parseQuantity("x2")` → `2`
- `parseCurrency("1,39 €")` → `1.39`
- `extractProductId(url)` → Product ID from URL path

## ReorderTool

### Purpose
Click the "Encomendar de novo" button to add all items from a previous order to the current cart.

### Input
```typescript
{
  orderId: string;    // Order ID to reorder
  detailUrl: string;  // URL to order detail page
}
```

### Output
```typescript
{
  success: boolean;      // Whether reorder succeeded
  itemsAdded: number;    // Estimated items added to cart
  failedItems: string[]; // Error messages for failed items
  cartTotal: number;     // Estimated cart total after reorder
  screenshot?: string;   // Screenshot after reorder
}
```

### Features
- **Navigation** - Navigates to order detail if needed
- **Button Detection** - Finds reorder button with fallbacks
- **Click & Wait** - Clicks button, waits for cart update (3s)
- **Error Detection** - Scans for error messages, unavailable items
- **Cart Estimation** - Attempts to detect cart count and total
- **Redirect Handling** - Detects if redirected to cart page

### Error Handling
- Button not found → Error with screenshot
- Timeout → Recoverable error
- Failed items → Captured in `failedItems` array

## Selector Registry Integration

Both tools use the **Selector Registry** system (`order-detail` page):

| Selector Key | Purpose | Fallbacks |
|--------------|---------|-----------|
| `orderHeader` | Page load verification | 2 |
| `orderDate` | Extract order date (with data-date attribute) | 2 |
| `orderProductCount` | Parse product count | 2 |
| `orderTotalPrice` | Extract total price | 2 |
| `deliveryType` | Delivery method | 2 |
| `deliveryAddress` | Delivery address | 2 |
| `deliveryDateTime` | Delivery window | 2 |
| `productCard` | Individual product cards | 2 |
| `productNameLink` | Product name + URL | 2 |
| `productQuantity` | Quantity (e.g., "x2") | 2 |
| `productPrice` | Unit price | 2 |
| `viewAllButton` | Expand all products | 2 |
| `reorderButton` | Reorder button | 2 |
| `summaryProductsTotal` | Subtotal | 2 |
| `summaryDeliveryFee` | Delivery fee | 2 |
| `summaryTotal` | Total cost | 2 |

All selectors have **primary + 2 fallbacks** for resilience.

## Usage Example

```typescript
import { loadOrderDetailTool, reorderTool } from './agents/cart-builder/tools';

// Load order details
const detailResult = await loadOrderDetailTool.execute({
  orderId: '12345678',
  detailUrl: 'https://www.auchan.pt/pt/detalhes-encomenda?orderID=12345678',
  expandAllProducts: true,
}, toolContext);

if (detailResult.success) {
  const { order, allProductsLoaded } = detailResult.data;
  console.log(`Order ${order.orderId}: ${order.items.length} items, €${order.totalPrice}`);
}

// Reorder
const reorderResult = await reorderTool.execute({
  orderId: '12345678',
  detailUrl: 'https://www.auchan.pt/pt/detalhes-encomenda?orderID=12345678',
}, toolContext);

if (reorderResult.success) {
  const { itemsAdded, cartTotal } = reorderResult.data;
  console.log(`Added ${itemsAdded} items to cart. Total: €${cartTotal}`);
}
```

## Testing

Run validation test:
```bash
npm run build
npx tsx scripts/test-order-detail-tools.ts
```

Test results:
- Tool exports verified
- Selector registry integration verified
- All 15 required selectors found
- Fallback chains confirmed (3 selectors each)

## Integration with CartBuilder Agent

These tools integrate into the CartBuilder workflow:

1. **LoadOrderHistoryTool** → Get order summaries
2. **LoadOrderDetailTool** → Load full order with all items
3. **ReorderTool** → Add order items to cart
4. **ScanCartTool** → Verify cart contents after reorder

## Known Limitations

1. **Cart Detection** - Item count and total estimation is best-effort (depends on cart UI visibility)
2. **Error Messages** - Failed items detection uses common selectors but may miss Auchan-specific errors
3. **Network Wait** - Fixed 3s wait for cart update (could be optimized with network idle detection)
4. **Product Pagination** - Assumes "Ver todos" button expands all products (may need adjustment if Auchan changes UI)

## Future Enhancements

- [ ] Add retry logic for reorder button (handle transient failures)
- [ ] Improve cart update detection (listen for network events)
- [ ] Add progress callback for large orders (many products)
- [ ] Cache extracted order details to avoid re-extraction
- [ ] Add validation for product URLs (ensure they're valid Auchan URLs)

## Compliance

- TypeScript strict mode: ✅
- Selector Registry usage: ✅
- Tool interface conformance: ✅
- Error handling with screenshots: ✅
- Structured logging: ✅
- Zod schema validation: ✅

## References

- Type definitions: `src/agents/cart-builder/tools/types.ts`
- Data models: `src/agents/cart-builder/types.ts`
- Selector registry: `data/selectors/pages/order-detail/v1.json`
- Tool interface: `src/types/tool.ts`
