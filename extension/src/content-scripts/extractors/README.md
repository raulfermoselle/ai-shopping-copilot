# Content Script Extractors

Pure DOM extraction utilities for Auchan.pt pages.

## Cart Scanner

Extracts cart items and summary from the shopping cart page.

### Usage

```typescript
import { extractCartItems, isOnCartPage, hasCartItems } from './cart-scanner';

// Check if on cart page
if (isOnCartPage()) {
  // Quick check for items
  if (hasCartItems()) {
    // Full extraction
    const result = extractCartItems({
      includeOutOfStock: true,  // Include unavailable items (default: true)
      verbose: false            // Enable console logging (default: false)
    });

    console.log(`Found ${result.items.length} items`);
    console.log(`Total: €${result.summary.total.toFixed(2)}`);
    console.log(`Unavailable: ${result.summary.unavailableCount}`);
  }
}
```

### Return Type

```typescript
interface CartExtractionResult {
  items: CartItem[];           // All cart items
  summary: CartSummary;        // Cart totals and counts
  isEmpty: boolean;            // True if cart has no items
  url: string;                 // URL where extraction occurred
}

interface CartItem {
  id: string;                  // Unique item ID (UUID)
  productId: string;           // Product ID (SKU)
  name: string;                // Product name
  price: number;               // Unit price (in euros)
  quantity: number;            // Quantity in cart
  availability: ItemAvailability; // available | out-of-stock | low-stock | unknown
  imageUrl?: string;           // Product image URL
  category?: string;           // Product category (from URL)
  brand?: string;              // Brand name (extracted from product name)
  unit?: string;               // Unit (Kg, L, un)
  pricePerUnit?: number;       // Price per unit (€/Kg, €/L, etc.)
}

interface CartSummary {
  itemCount: number;           // Total number of items (sum of quantities)
  uniqueProducts: number;      // Number of unique products
  subtotal: number;            // Subtotal (available items only)
  deliveryFee?: number;        // Delivery fee (if detectable)
  total: number;               // Total including delivery
  unavailableCount: number;    // Number of unavailable items
}
```

### Selectors Used

Based on `data/selectors/pages/cart/v1.json`:

- `.auc-cart--empty` - Empty cart indicator
- `.auc-cart__product-cards > div` - Product cards
- `.auc-cart__product-title` - Product name
- `a.auc-cart__product-title` - Product link (for category extraction)
- `input[name*='quantity']` - Quantity input
- `.auc-cart--price` - Line total price
- `.auc-measures--price-per-unit` - Price per unit
- `.auc-unavailable-name` - Out-of-stock indicator
- `.auc-header-cart-total` - Cart total (header)
- `data-pid` - Product ID attribute
- `data-uuid` - Item UUID attribute

### Features

- **Bulk DOM Extraction**: Single pass through product cards (~50ms for 20 items)
- **Availability Detection**: Detects out-of-stock items via `.auc-unavailable-name` class
- **Price Parsing**: Handles Portuguese format ("1,39 €", "162,51 €")
- **Unit Extraction**: Parses unit from price per unit text ("5,89 €/Kg" → unit: "Kg")
- **Category Extraction**: Extracts from product URL path
- **Brand Extraction**: Best-effort from product name (first capitalized word)
- **Filtering**: Optional exclusion of out-of-stock items
- **Graceful**: Returns empty result for empty cart, skips malformed items

### Notes

- Empty cart is detected via `.auc-cart--empty` element
- Subtotal excludes unavailable items (matches Auchan behavior)
- Total is extracted from header (most reliable source)
- Category is extracted from URL: `/pt/alimentacao/lacticinios/p/123` → "lacticinios"
- Brand extraction is heuristic (not always accurate)

### Tests

17 comprehensive tests covering:
- Empty cart detection
- Single/multiple item extraction
- Out-of-stock detection and filtering
- Price parsing (commas, spaces)
- Unit extraction (Kg, L, un)
- Category extraction from URLs
- Brand extraction from names
- Cart summary calculation

Run tests:
```bash
npm test -- src/content-scripts/extractors/__tests__/cart-scanner.test.ts
```

---

## Order History Extractor

Extracts order summaries from the order history list page.

### Usage

```typescript
import { extractOrderHistory, isOnOrderHistoryPage, getOrderCount } from './order-history';

// Check if on order history page
if (!isOnOrderHistoryPage()) {
  console.error('Not on order history page');
}

// Get total order count
const totalOrders = getOrderCount();
console.log(`Found ${totalOrders} orders`);

// Extract all orders
const orders = extractOrderHistory();
console.log(orders);
// [
//   {
//     orderId: "002915480",
//     date: "2026-01-02T14:00:30+00:00",
//     timestamp: 1735826430000,
//     total: 162.51,
//     itemCount: 38,
//     status: "delivered"
//   },
//   ...
// ]

// Extract only the last 5 orders
const recentOrders = extractOrderHistory({ limit: 5 });
```

### Return Type

```typescript
interface OrderSummary {
  orderId: string;              // Numeric order ID (e.g., "002915480")
  date: string;                 // ISO date string
  timestamp: number;            // Unix timestamp (milliseconds)
  total: number;                // Total price in euros
  itemCount: number;            // Number of products in order
  status: OrderStatus;          // Order status
  deliveryAddress?: string;     // Delivery address (if available)
  deliveryDate?: string;        // Delivery date (if available)
}

type OrderStatus =
  | 'pending' | 'processing' | 'ready' | 'delivering' | 'delivered' | 'cancelled' | 'unknown';
```

### Selectors Used

Based on `data/selectors/pages/order-history/v1.json`:

- `.auc-orders__order-card` - Order card elements
- `.auc-orders__order-number span:nth-child(2)` - Order ID
- `.auc-orders--date.auc-run--day[data-date]` - Order date
- `.auc-orders__order-products` - Product count
- `.auc-orders__order-price` - Total price

### Notes

- **Bulk Extraction**: Single `querySelectorAll()` call, processes all orders in <100ms
- **Date Parsing**: Prefers `data-date` attribute (ISO timestamp), falls back to day/month text
- **Price Parsing**: Handles Portuguese format ("162,51 €", "1.234,56 €")
- **Status Detection**: Defaults to "delivered" (Auchan.pt doesn't show status in list)
- **Graceful**: Skips malformed cards, returns empty array if no orders found

## Slot Extractor

Extracts delivery slot information from the slot selection page.

### Usage

```typescript
import { extractDeliverySlots, isOnSlotsPage } from './extractors';

// Check if on correct page
if (isOnSlotsPage()) {
  // Extract current day's slots
  const result = extractDeliverySlots();
  
  console.log(`Found ${result.availableCount} available slots`);
  console.log(`Date range: ${result.dateRange.start} to ${result.dateRange.end}`);
  
  result.slots.forEach(slot => {
    console.log(`${slot.date} ${slot.timeStart}-${slot.timeEnd}: €${slot.fee} (${slot.available ? 'Available' : 'Full'})`);
  });
}
```

### Extract All Days (Async)

```typescript
import { extractAllDaysSlots } from './extractors';

// Clicks through all day tabs and extracts slots
const allSlots = await extractAllDaysSlots(500); // 500ms delay between tabs
console.log(`Total slots: ${allSlots.slots.length}`);
```

### Return Type

```typescript
interface SlotExtractionResult {
  slots: DeliverySlot[];           // All extracted slots
  dateRange: {
    start: string;                  // First date (YYYY-MM-DD)
    end: string;                    // Last date (YYYY-MM-DD)
  };
  availableCount: number;           // Count of available slots
  unavailableCount: number;         // Count of unavailable/full slots
  extractedAt: number;              // Timestamp
}

interface DeliverySlot {
  id: string;                       // Unique ID (date-time)
  date: string;                     // YYYY-MM-DD
  dayOfWeek: string;                // monday, tuesday, etc.
  timeStart: string;                // HH:MM
  timeEnd: string;                  // HH:MM
  fee: number;                      // Delivery fee in euros
  available: boolean;               // Whether slot can be booked
  isFree?: boolean;                 // Whether slot is free/promotional
}
```

## Selectors Used

Based on `data/selectors/pages/delivery-slots/v1.json`:

- `.auc-book-slot__slot` - Time slot elements
- `.auc-run-day-month[data-date]` - Day date elements
- `.nav-link-tab.nav-link.active` - Active day tab
- Data attributes: `data-time`, `data-price`, `data-is-free`, `data-has-slots-to-book`

## Notes

- **Synchronous**: `extractDeliverySlots()` only reads current day (no tab clicking)
- **Asynchronous**: `extractAllDaysSlots()` clicks tabs and waits for DOM updates
- **Pure Functions**: No Chrome API calls, only DOM reading
- **Verified Selectors**: All selectors verified against live site (2026-01-14)
