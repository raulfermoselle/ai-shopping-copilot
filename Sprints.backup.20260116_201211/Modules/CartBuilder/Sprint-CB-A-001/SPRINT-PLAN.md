# Sprint-CB-A-001: Design CartBuilder Worker Interface & Data Models

**Module:** CartBuilder
**Type:** Architecture (A)
**Status:** Complete
**Started:** 2026-01-11
**Completed:** 2026-01-11
**Dependencies:** Sprint-CB-R-001 (Order History Research) ✅

---

## Objective

Design the CartBuilder worker interface and data models based on research findings from Sprint-CB-R-001. This sprint establishes:
1. TypeScript types for orders, items, and cart diffs
2. CartBuilder worker interface contract
3. Tool specifications for order loading and cart operations
4. Cart diff report format for the Coordinator

---

## Key Inputs from Research

| Finding | Implication |
|---------|-------------|
| "Encomendar de novo" button | Use bulk reorder instead of individual item adds |
| 30 selectors registered | Selector Registry ready for implementation |
| Order list shows: date, number, count, total | OrderSummary type fields defined |
| Order detail shows: items with name, quantity, price | OrderItem type fields defined |
| Products may be paginated | Need "Ver todos" expansion before extraction |

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| T001 | Define CartBuilder data models (Order, OrderItem, CartDiff) | Pending |
| T002 | Design CartBuilder worker interface | Pending |
| T003 | Define CartBuilder tool specifications | Pending |
| T004 | Design cart diff report format | Pending |
| T005 | Document CartBuilder architecture in module docs | Pending |

---

## T001: Data Models

Create `src/agents/cart-builder/types.ts`:

```typescript
// Order from history (before loading into cart)
interface Order {
  orderId: string;
  date: Date;
  productCount: number;
  totalPrice: number;
  detailUrl: string;
}

// Detailed order item
interface OrderItem {
  productId: string;
  name: string;
  productUrl: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Full order with items
interface OrderDetail extends Order {
  items: OrderItem[];
  delivery: DeliveryInfo;
  summary: OrderSummary;
}

// Cart diff result
interface CartDiff {
  added: CartDiffItem[];
  removed: CartDiffItem[];
  quantityChanged: CartDiffQuantityChange[];
  unchanged: CartDiffItem[];
  summary: CartDiffSummary;
}
```

---

## T002: Worker Interface

Extend `src/agents/cart-builder/cart-builder.ts`:

```typescript
interface CartBuilderResult extends AgentResult {
  data: {
    ordersLoaded: Order[];
    cartBefore: CartItem[];
    cartAfter: CartItem[];
    diff: CartDiff;
    screenshots: string[];
  }
}

interface CartBuilderConfig {
  maxOrdersToLoad: number;
  includeFavorites: boolean;
  mergeStrategy: 'latest' | 'combined' | 'most-frequent';
}
```

---

## T003: Tool Specifications

Tools needed for CartBuilder:

| Tool | Purpose | Selectors Used |
|------|---------|----------------|
| `LoadOrderHistoryTool` | Navigate to order history, extract order list | order-history/* |
| `LoadOrderDetailTool` | Navigate to order detail, extract items | order-detail/* |
| `ReorderTool` | Click "Encomendar de novo" button | order-detail/reorderButton |
| `ScanCartTool` | Extract current cart contents | cart/* (future sprint) |

---

## T004: Cart Diff Report Format

JSON report for Coordinator consumption:

```typescript
interface CartDiffReport {
  timestamp: Date;
  sessionId: string;
  ordersAnalyzed: string[];
  cart: {
    before: CartSnapshot;
    after: CartSnapshot;
  };
  diff: CartDiff;
  confidence: number;
  warnings: string[];
}
```

---

## Expected Outputs

1. `src/agents/cart-builder/types.ts` - Data model definitions
2. `src/agents/cart-builder/cart-builder.ts` - Updated worker interface
3. `src/agents/cart-builder/tools/` - Tool type specifications
4. `docs/modules/cart-builder.md` - Architecture documentation
5. Updated SPRINT-LOG.md with decisions

---

## Success Criteria

- [x] Data models defined with Zod validation schemas
- [x] CartBuilder worker interface documented
- [x] Tool specifications complete with input/output types
- [x] Cart diff format ready for Coordinator consumption
- [x] Module documentation updated

---

*Created: 2026-01-11*
