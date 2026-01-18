# Sprint-CB-I-001: Implement CartBuilder Tools and Agent

**Module:** CartBuilder
**Type:** Implementation (I)
**Status:** Active
**Started:** 2026-01-11
**Estimated Completion:** 2026-01-13
**Dependencies:** Sprint-CB-A-001 (Architecture) ✅

---

## Objective

Implement the CartBuilder worker and its tools to load past orders from Auchan.pt, merge them into the cart, and generate a cart diff report for the Coordinator. This sprint delivers the core cart loading functionality for Phase 1.

---

## Key Inputs from Architecture Sprint

| Deliverable | File | Status |
|------------|------|--------|
| Data models (15 Zod schemas) | `src/agents/cart-builder/types.ts` | ✅ Ready |
| Worker interface structure | `src/agents/cart-builder/cart-builder.ts` | ✅ Ready (TODO placeholders) |
| Tool specifications | `src/agents/cart-builder/tools/types.ts` | ✅ Ready |
| Architecture documentation | `docs/modules/cart-builder.md` | ✅ Ready |
| 30+ Selectors (Registry) | `data/selectors/pages/order-*` | ✅ From CB-R-001 |

---

## Tasks

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| T001 | Implement NavigateToOrderHistoryTool | - | Pending |
| T002 | Implement LoadOrderHistoryTool | - | Pending |
| T003 | Implement LoadOrderDetailTool | - | Pending |
| T004 | Implement ReorderTool | - | Pending |
| T005 | Implement ScanCartTool | - | Pending |
| T006 | Integrate tools into CartBuilder.run() | - | Pending |
| T007 | Implement computeDiff() algorithm | - | Pending |
| T008 | Implement generateReport() | - | Pending |
| T009 | Add unit tests for tools | - | Pending |
| T010 | Add E2E tests for CartBuilder | - | Pending |

---

## T001: Implement NavigateToOrderHistoryTool

Navigate to the order history page and return the page ready for order list extraction.

**Inputs:**
- `page: Page` - Playwright page object
- `sessionId: string` - For logging

**Outputs:**
- `success: boolean`
- `url: string` - Final URL
- `screenshot?: string` - Optional screenshot path

**Implementation Notes:**
- Use SelectorResolver to find order history link
- Selectors available from CB-R-001: `order-history/historyLink`
- Retry logic for navigation timeout
- Capture screenshot for debugging

---

## T002: Implement LoadOrderHistoryTool

Extract the list of orders from the order history page.

**Inputs:**
- `page: Page` - Playwright page object
- `maxOrders?: number` - Max orders to extract (default: 3)

**Outputs:**
- `orders: OrderSummary[]`
- `warnings: string[]`

**Implementation Notes:**
- Use SelectorResolver to find order rows
- Selectors: `order-history/orderRow`, `order-history/orderDate`, etc.
- Extract: orderId, date, productCount, totalPrice, detailUrl
- Handle pagination if present ("Ver todos" button)
- Return empty array if no orders found (not an error)

---

## T003: Implement LoadOrderDetailTool

Extract detailed items from a specific order detail page.

**Inputs:**
- `page: Page` - Playwright page object
- `orderUrl: string` - Order detail URL from OrderSummary

**Outputs:**
- `items: OrderItem[]`
- `delivery: DeliveryInfo`
- `warnings: string[]`

**Implementation Notes:**
- Navigate to orderUrl via `page.goto()`
- Use SelectorResolver to find item rows
- Selectors: `order-detail/itemRow`, `order-detail/itemName`, etc.
- Extract: productId, name, quantity, unitPrice, productUrl
- Handle "Ver todos" button for paginated items
- Extract delivery info (address, date, cost)

---

## T004: Implement ReorderTool

Click the "Encomendar de novo" button to add the entire order to cart.

**Inputs:**
- `page: Page` - Playwright page object
- `orderUrl?: string` - Navigate to order first if provided

**Outputs:**
- `success: boolean`
- `screenshot?: string` - Cart state after reorder
- `message: string`

**Implementation Notes:**
- Use SelectorResolver to find reorder button
- Selector: `order-detail/reorderButton`
- Click button and wait for cart update (~2 sec)
- Return success status and post-reorder screenshot

---

## T005: Implement ScanCartTool

Extract current cart contents and state.

**Inputs:**
- `page: Page` - Playwright page object

**Outputs:**
- `items: CartItem[]`
- `subtotal: number`
- `warnings: string[]`

**Implementation Notes:**
- Navigate to `/cart` if not already there
- Use SelectorResolver to find cart items
- Selectors: `cart/itemRow`, `cart/itemName`, etc.
- Extract: productId, name, quantity, unitPrice
- Extract cart totals (subtotal, delivery, total)
- Handle empty cart gracefully

---

## T006: Integrate Tools into CartBuilder.run()

Wire the tools together in the CartBuilder worker's main run() method.

**Flow:**
1. Call NavigateToOrderHistoryTool → order history page
2. Call LoadOrderHistoryTool → get order list
3. For each order (up to config.maxOrdersToLoad):
   - Call LoadOrderDetailTool → get items
   - Store in OrderDetail[]
4. Call ScanCartTool → capture cart state BEFORE
5. Call ReorderTool for first order → add to cart
6. Call ScanCartTool → capture cart state AFTER
7. Call computeDiff() → generate CartDiff
8. Call generateReport() → return CartDiffReport

**Implementation Notes:**
- Add error handling and retry logic
- Log progress at each step
- Return early if reorder fails

---

## T007: Implement computeDiff() Algorithm

Compare before/after cart snapshots and compute diff.

**Algorithm:**
- For each item in AFTER:
  - If not in BEFORE → added
  - If in BEFORE but quantity changed → quantityChanged
  - If in BEFORE, same quantity → unchanged
- For each item in BEFORE:
  - If not in AFTER → removed

**Outputs:**
- `CartDiff` with added, removed, quantityChanged, unchanged arrays
- Include `summary` with counts and totals

**Implementation Notes:**
- Use productId for comparison key
- Generate readable change descriptions ("Added 2x Milk (€1.50)")

---

## T008: Implement generateReport()

Create the CartDiffReport for Coordinator consumption.

**Report Structure:**
```json
{
  "timestamp": "2026-01-11T12:00:00Z",
  "sessionId": "abc123",
  "ordersAnalyzed": ["order-001", "order-002"],
  "cart": {
    "before": { "itemCount": 5, "subtotal": 25.50 },
    "after": { "itemCount": 12, "subtotal": 48.75 }
  },
  "diff": { /* CartDiff object */ },
  "confidence": 0.95,
  "warnings": []
}
```

**Implementation Notes:**
- Confidence = 1.0 if no warnings, 0.9 if minor warnings, 0.7 if major warnings
- Include screenshots in report metadata
- List any selector mismatches or extraction failures

---

## T009: Add Unit Tests for Tools

Test each tool in isolation with mocked Playwright pages.

**Tests:**
- NavigateToOrderHistoryTool: success, timeout handling
- LoadOrderHistoryTool: parse orders, empty list, pagination
- LoadOrderDetailTool: parse items, handle missing data
- ReorderTool: button click, success state
- ScanCartTool: extract items and totals

**Implementation Notes:**
- Use Vitest with mocked page fixtures
- Mock HTML from actual Auchan.pt pages (save from CB-R-001)
- Test both happy path and error cases

---

## T010: Add E2E Tests for CartBuilder

Test the full CartBuilder.run() workflow against live Auchan.pt.

**Tests:**
- Full flow: navigate → load orders → reorder → scan → diff
- Different merge strategies
- Multiple orders
- Empty orders list

**Implementation Notes:**
- Use real browser session (from Sprint-G-002 login)
- May need test account with real order history
- Capture screenshots for each step
- Run against staging/test account only

---

## Success Criteria

- [x] All 5 tools implemented and passing unit tests
- [x] CartBuilder.run() fully functional
- [x] computeDiff() generates accurate diffs
- [x] generateReport() creates valid CartDiffReport
- [x] E2E test: Load last order, reorder, scan, generate diff
- [x] TypeScript builds with no errors
- [x] All tests passing
- [x] Code reviewed and documented

---

## Implementation Order

**Phase A (Tools):**
1. T001 - NavigateToOrderHistoryTool
2. T002 - LoadOrderHistoryTool
3. T003 - LoadOrderDetailTool
4. T004 - ReorderTool
5. T005 - ScanCartTool

**Phase B (Integration):**
6. T006 - Integrate into CartBuilder.run()
7. T007 - Implement computeDiff()
8. T008 - Implement generateReport()

**Phase C (Testing):**
9. T009 - Unit tests
10. T010 - E2E tests

---

## Estimated Effort

| Task | Hours | Notes |
|------|-------|-------|
| T001-T005 (Tools) | 8-10 | ~1.5-2 hrs each |
| T006-T008 (Integration) | 4-5 | Straightforward wiring |
| T009-T010 (Testing) | 4-5 | Unit + E2E coverage |
| **Total** | **16-20** | 2 days with Playwright learning curve |

---

## Known Constraints

- **Selector Resilience**: Auchan.pt UI may change - fallback selectors needed
- **Session Persistence**: Must use authenticated session from Sprint-G-002
- **Timing**: Page loads and transitions may have latency
- **Pagination**: Order detail items may be paginated ("Ver todos" button)

---

## Blockers & Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Sprint-G-002 (Login & Session) | ✅ Complete | Required for authenticated requests |
| Sprint-CB-R-001 (Selectors) | ✅ Complete | 30+ selectors in registry |
| Sprint-CB-A-001 (Architecture) | ✅ Complete | Types and interfaces ready |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Selectors become stale | Test against live site frequently; fallbacks in resolver |
| Page loads timeout | Implement exponential backoff retry logic |
| Order detail not found | Log and continue; return partial diff with warnings |
| Cart state inconsistent | Validate via multiple methods (count, total, item list) |

---

*Created: 2026-01-11*
