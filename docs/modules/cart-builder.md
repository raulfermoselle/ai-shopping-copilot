# CartBuilder Module

**Module ID:** CB
**Type:** Worker Agent
**Status:** Architecture Complete (Sprint-CB-A-001)

---

## Overview

The CartBuilder agent is responsible for loading previous orders from Auchan.pt order history and populating the shopping cart. It uses the "Encomendar de novo" (reorder) button to efficiently add entire orders to the cart.

### Key Insight

Research (Sprint-CB-R-001) discovered that clicking "Encomendar de novo" adds an entire order to the cart instantly. This eliminates the need to add 30+ items individually and dramatically simplifies cart building.

---

## Architecture

```
CartBuilder Agent
       │
       ├── captureCartSnapshot()    → ScanCartTool
       │
       ├── navigateToOrderHistory() → NavigateToOrderHistoryTool
       │
       ├── loadOrderList()          → LoadOrderHistoryTool
       │
       ├── selectOrders()           → [internal logic]
       │
       ├── reorderSelectedOrders()  → ReorderTool
       │       │
       │       ├── LoadOrderDetailTool (if needed)
       │       └── ExtractOrderItemsTool (if needed)
       │
       ├── captureCartSnapshot()    → ScanCartTool
       │
       ├── computeDiff()            → [internal logic]
       │
       └── generateReport()         → CartDiffReport
```

---

## Data Flow

```
1. Login (via Coordinator)
       ↓
2. Capture initial cart state
       ↓
3. Navigate to order history
       ↓
4. Extract order list (OrderSummary[])
       ↓
5. Select orders based on strategy
       ↓
6. For each selected order:
   ├── Navigate to order detail
   └── Click "Encomendar de novo"
       ↓
7. Capture final cart state
       ↓
8. Compute diff (CartDiff)
       ↓
9. Generate report (CartDiffReport)
       ↓
→ Return to Coordinator
```

---

## Types

### Order Types

| Type | Description |
|------|-------------|
| `OrderSummary` | Minimal order info from list view (id, date, count, total) |
| `OrderItem` | Individual product in an order |
| `OrderDetail` | Full order with all items and delivery info |
| `DeliveryInfo` | Delivery type, address, date/time |
| `OrderCostSummary` | Subtotal, delivery fee, total |

### Cart Types

| Type | Description |
|------|-------------|
| `CartItem` | Item currently in cart |
| `CartSnapshot` | Point-in-time cart state |
| `CartDiff` | Difference between two cart states |
| `CartDiffReport` | Full report for Coordinator |

### Config Types

| Type | Description |
|------|-------------|
| `CartBuilderConfig` | Agent configuration |
| `MergeStrategy` | How to combine multiple orders |

---

## Configuration

```typescript
interface CartBuilderConfig {
  // Maximum orders to load (default: 3)
  maxOrdersToLoad: number;

  // Include favorites in cart (default: false)
  includeFavorites: boolean;

  // Order merge strategy
  mergeStrategy: 'latest' | 'combined' | 'most-frequent';

  // Clear existing cart first (default: false)
  clearExistingCart: boolean;
}
```

### Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `latest` | Use items from most recent order only |
| `combined` | Combine items from all selected orders, sum quantities |
| `most-frequent` | Use most frequently ordered items (Phase 3) |

---

## Tools

### NavigateToOrderHistoryTool

Navigates from any page to the order history page.

**Selectors:** login page (account menu), order-history page

**Flow:**
1. Click account menu button
2. Wait for sidebar overlay
3. Click "Histórico de encomendas"
4. Wait for order history page

### LoadOrderHistoryTool

Extracts order list from the order history page.

**Selectors:** order-history/v1.json

**Output:** `OrderSummary[]` with orderId, date, productCount, totalPrice, detailUrl

### LoadOrderDetailTool

Navigates to order detail and extracts all items.

**Selectors:** order-detail/v1.json

**Flow:**
1. Navigate to order detail URL
2. Click "Ver todos" if products paginated
3. Extract all product cards
4. Parse item data (name, quantity, price)

### ReorderTool

Clicks "Encomendar de novo" to add order to cart.

**Selectors:** order-detail/reorderButton

**Flow:**
1. Ensure on order detail page
2. Click "Encomendar de novo" button
3. Wait for cart update
4. Return success status

### ScanCartTool

Extracts current cart contents.

**Selectors:** cart/v1.json (to be defined)

**Output:** `CartSnapshot` with items, itemCount, totalPrice

### ExtractOrderItemsTool

Extracts items from current order detail page.

**Selectors:** order-detail/v1.json (productCard, productName, etc.)

**Output:** `OrderItem[]` with all product details

---

## Selector Dependencies

| Page | Selector File | Key Selectors |
|------|---------------|---------------|
| order-history | order-history/v1.json | orderCard, orderLink, orderDate, orderNumber, orderProductCount, orderTotalPrice |
| order-detail | order-detail/v1.json | productCard, productName, productQuantity, productPrice, reorderButton, viewAllButton |
| cart | cart/v1.json | (to be defined in future sprint) |

---

## CartDiff Report Structure

```typescript
interface CartDiffReport {
  timestamp: Date;
  sessionId: string;
  ordersAnalyzed: string[];

  cart: {
    before: CartSnapshot;
    after: CartSnapshot;
  };

  diff: {
    added: CartDiffItem[];
    removed: CartDiffItem[];
    quantityChanged: CartDiffQuantityChange[];
    unchanged: CartDiffItem[];
    summary: CartDiffSummary;
  };

  confidence: number;  // 0-1
  warnings: CartBuilderWarning[];
  screenshots: string[];
}
```

---

## Warning Types

| Type | Meaning |
|------|---------|
| `item_unavailable` | Item not available for purchase |
| `price_changed` | Price different from previous order |
| `quantity_adjusted` | Quantity was adjusted (e.g., max stock) |
| `order_load_partial` | Some items from order couldn't be loaded |
| `reorder_failed` | Reorder button click failed |

---

## Error Handling

| Error | Recoverable | Action |
|-------|-------------|--------|
| Network timeout | Yes | Retry with backoff |
| Selector not found | No | Log, escalate to Coordinator |
| Reorder button missing | No | Log warning, skip order |
| Cart scan failed | Yes | Retry once, then proceed with empty snapshot |

---

## Integration Points

### Input (from Coordinator)

- `AgentContext` with page, logger, sessionId
- Optional: specific order IDs to load

### Output (to Coordinator)

- `CartBuilderResult` with:
  - `ordersLoaded`: Which orders were processed
  - `cartBefore`/`cartAfter`: Cart snapshots
  - `diff`: What changed
  - `report`: Full diff report

---

## Future Enhancements (Phase 3)

1. **Frequency Analysis**: Track which items appear most often across orders
2. **Preference Learning**: Learn from approved/rejected items
3. **Favorites Integration**: Include starred items
4. **Smart Quantities**: Suggest quantities based on consumption patterns

---

## Implementation Status

| Component | Status | Sprint |
|-----------|--------|--------|
| Data models | Complete | CB-A-001 |
| Worker interface | Complete | CB-A-001 |
| Tool specifications | Complete | CB-A-001 |
| Documentation | Complete | CB-A-001 |
| Tool implementations | Planned | CB-I-001 |
| Agent integration | Planned | CB-I-001 |

---

*Last Updated: 2026-01-11*
