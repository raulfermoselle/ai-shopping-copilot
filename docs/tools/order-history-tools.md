# Order History Tools

Browser automation tools for navigating to and extracting order history from Auchan.pt.

## Tools

### NavigateToOrderHistoryTool

**Purpose:** Navigate from any page to the order history page.

**Input:**
```typescript
{
  waitForLoad: boolean;    // Wait for page load (default: true)
  timeout: number;         // Timeout in ms (default: 30000)
}
```

**Output:**
```typescript
{
  success: boolean;
  url: string;            // Final URL after navigation
  screenshot?: string;    // Path to screenshot
}
```

**Features:**
- Detects if already on order history page (skips navigation)
- Handles authentication redirects (returns AUTH_ERROR if not logged in)
- Retries navigation once on failure
- Verifies page load by checking for order list container
- Captures diagnostic screenshots

**Error Codes:**
- `AUTH_ERROR` - User not logged in, redirect to login page
- `NETWORK_ERROR` - Navigation failed or wrong page reached
- `SELECTOR_ERROR` - Page loaded but order list container not found
- `TIMEOUT_ERROR` - Navigation timed out

**Example:**
```typescript
const result = await navigateToOrderHistoryTool.execute(
  { waitForLoad: true, timeout: 30000 },
  context
);

if (result.success && result.data) {
  console.log(`Navigated to: ${result.data.url}`);
}
```

---

### LoadOrderHistoryTool

**Purpose:** Extract order list from the order history page.

**Input:**
```typescript
{
  maxOrders: number;              // Max orders to extract (default: 10)
  includeDeliveryInfo: boolean;   // Include delivery info (default: false)
}
```

**Output:**
```typescript
{
  orders: OrderSummary[];     // Extracted orders
  totalAvailable: number;     // Total orders on page
  hasMore: boolean;           // More orders available than loaded
}
```

**OrderSummary:**
```typescript
{
  orderId: string;          // Auchan order ID
  date: Date;               // Order date (from data-date attribute)
  productCount: number;     // Number of products
  totalPrice: number;       // Total price in EUR
  detailUrl: string;        // URL to order detail page
}
```

**Features:**
- Uses Selector Registry for resilient element finding
- Validates each order with Zod schema
- Handles missing or malformed data gracefully (skips invalid orders)
- Logs warnings for parse failures
- Returns empty array if no orders found
- Captures screenshots for debugging

**Data Parsing:**
- **Date:** Extracts ISO timestamp from `data-date` attribute on day element
- **Order ID:** Parses numeric ID from order number text
- **Product Count:** Parses integer from "38 Produtos" format
- **Price:** Parses currency from "162,51 €" format (handles comma decimal separator)
- **Detail URL:** Extracts href from order link, converts to absolute URL

**Error Codes:**
- `VALIDATION_ERROR` - Not on order history page
- `SELECTOR_ERROR` - Order list container or selectors not found
- `UNKNOWN_ERROR` - Unexpected error during extraction

**Example:**
```typescript
const result = await loadOrderHistoryTool.execute(
  { maxOrders: 5, includeDeliveryInfo: false },
  context
);

if (result.success && result.data) {
  result.data.orders.forEach(order => {
    console.log(`Order ${order.orderId}: ${order.productCount} items, €${order.totalPrice}`);
  });
}
```

---

## Selector Registry Usage

Both tools use the Selector Registry for resilient element finding.

**Page ID:** `order-history`

**Selectors Used:**
- `orderListContainer` - Main container (`.auc-orders`)
- `orderCard` - Individual order card (`.auc-orders__order-card`)
- `orderLink` - Detail page link (`a[href*='/pt/detalhes-encomenda']`)
- `orderDateDay` - Date element with `data-date` attribute
- `orderNumber` - Order ID element
- `orderProductCount` - Product count text
- `orderTotalPrice` - Total price text

Each selector has 2+ fallbacks for resilience against UI changes.

---

## Error Handling & Retry Logic

### NavigateToOrderHistoryTool
- **Navigation retry:** 2 attempts with 1s delay between
- **Auth detection:** Checks URL for login redirect pattern
- **Page verification:** Waits for order list container with 10s timeout
- **Screenshot capture:** Saves diagnostic images on errors

### LoadOrderHistoryTool
- **Graceful degradation:** Skips orders with parse failures, continues processing
- **Schema validation:** Validates each order with Zod before including in results
- **Warning logs:** Logs detailed warnings for each failed extraction
- **Empty state handling:** Returns empty array instead of error if no orders exist

---

## Testing

Run the test script to validate both tools:

```bash
npm run build
node dist/scripts/test-order-history-tools.js
```

**Prerequisites:**
- Browser automation enabled
- User logged in to Auchan.pt (script will prompt)

**Test Flow:**
1. Opens browser to Auchan.pt
2. Prompts for manual login if needed
3. Tests NavigateToOrderHistoryTool
4. Tests LoadOrderHistoryTool with maxOrders=5
5. Displays extracted order details
6. Saves screenshots to `data/exploration/order-history-tools-test/`

---

## Integration Example

```typescript
import { navigateToOrderHistoryTool, loadOrderHistoryTool } from '../agents/cart-builder/tools/index.js';

// 1. Navigate to order history
const navResult = await navigateToOrderHistoryTool.execute(
  { waitForLoad: true },
  context
);

if (!navResult.success) {
  if (navResult.error?.code === 'AUTH_ERROR') {
    // User needs to log in first
    await loginTool.execute({ username, password }, context);
    // Retry navigation
  }
  throw new Error('Navigation failed');
}

// 2. Load order history
const loadResult = await loadOrderHistoryTool.execute(
  { maxOrders: 10 },
  context
);

if (!loadResult.success) {
  throw new Error('Failed to load orders');
}

// 3. Process orders
const recentOrders = loadResult.data!.orders.slice(0, 3);
for (const order of recentOrders) {
  console.log(`Processing order ${order.orderId} from ${order.date.toLocaleDateString()}`);
  // Load order details, add to cart, etc.
}
```

---

## Performance

**NavigateToOrderHistoryTool:**
- Skip navigation if already on page: ~100ms (selector check only)
- Full navigation: ~2-5s (depends on network)
- With retry: ~5-10s max

**LoadOrderHistoryTool:**
- Empty list: ~500ms
- 5 orders: ~1-2s
- 10 orders: ~2-4s

**Total for typical flow:** ~3-7s to navigate and extract 5 recent orders.

---

## Known Issues & Limitations

1. **Language Dependency:** Product count parsing assumes Portuguese text ("Produtos")
2. **Currency Format:** Price parsing assumes European format (comma as decimal separator)
3. **Pagination:** Does not handle paginated order history (loads only visible orders)
4. **Delivery Info:** `includeDeliveryInfo` parameter not yet implemented (reserved for future)
5. **Auth State:** Does not handle session expiration mid-extraction

---

## Future Enhancements

1. **Pagination Support:** Scroll or click "Load More" to fetch older orders
2. **Delivery Info Extraction:** Parse delivery type, address, and time from order cards
3. **Filtering:** Add date range or status filters
4. **Caching:** Cache extracted orders to avoid re-fetching on retry
5. **Internationalization:** Support multiple languages (detect locale, use appropriate selectors)
6. **Session Validation:** Check auth state before extraction, auto-relogin if expired

---

**Last Updated:** 2026-01-11
**Sprint:** Sprint-CB-I-001 (CartBuilder Implementation)
**Files:**
- `src/agents/cart-builder/tools/navigate-to-order-history.ts`
- `src/agents/cart-builder/tools/load-order-history.ts`
- `scripts/test-order-history-tools.ts`
