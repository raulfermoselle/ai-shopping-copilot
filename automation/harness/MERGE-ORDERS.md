# merge_orders Procedure

**Purpose**: Load last 3 orders from Auchan.pt order history and merge them into the current cart.

**Prerequisites**:
- User logged in to Auchan.pt
- BrowserMCP extension connected
- Auth verified (see `button "Olá, {NAME}"` pattern)

---

## URL Shortcuts

Use these for efficiency, but keep manual navigation as fallback if URLs change.

| Page | URL | Fallback |
|------|-----|----------|
| Order History | `/pt/historico-encomendas` | Account menu → "Encomendas" |
| Order Detail | `/pt/detalhes-encomenda?orderID={uuid}` | Click order row |
| Cart | `/pt/carrinho-compras` | Click cart button in header |

---

## Procedure

### 1. Verify Authentication

Check for auth indicator in page snapshot:
```
banner > navigation > button "Olá, {NAME}"
```

If not present: abort and request login.

### 2. Navigate to Order History

**Fast path**: `browser_navigate` to `/pt/historico-encomendas`

**Fallback**:
1. Click `button "Olá, {NAME}"` to open account menu
2. Click "Encomendas" or "Histórico" link

### 3. Extract Last 3 Orders

From order history page snapshot, identify order rows. Each row contains:
- Order date (e.g., "18 jan", "02 jan", "06 dez")
- Order ID (e.g., "002948384")
- Product count (e.g., "44 produtos")
- Total amount (e.g., "199,31€")
- Status (e.g., "Em expedição", "Entregue")

**UUID Extraction (Token Optimization)**:
The order history page contains buttons with UUIDs embedded:
```
button "View Order Number: {uuid}" [ref=...]
```

Extract these UUIDs to enable direct navigation to order detail pages, saving one click per order.

Select the **3 most recent orders** (top of list).

### 4. Merge Orders (Oldest First)

Process orders **chronologically** (oldest → newest) to build cart incrementally.

```
FOR each order (oldest to newest):
    1. Navigate to order detail page
       - Fast: /pt/detalhes-encomenda?orderID={uuid}
       - Fallback: Click order row from history

    2. Click "Encomendar de novo" button

    3. Handle modal:
       - IF cart is empty:
           → Simple confirmation modal
           → Click confirm button

       - IF cart has items:
           → Choice modal appears with:
             - "Eliminar" = Replace cart (DON'T USE)
             - "Juntar" = Merge/add to cart (USE THIS)
           → Click "Juntar"

    4. Wait for cart update

    5. Verify merge succeeded:
       - Check cart count in header
       - Should increase (with deduplication)
```

### 5. Verify Final Cart

Navigate to cart page (`/pt/carrinho-compras`) and capture:
- Total item count
- Total price
- Any unavailable items (if shown)

---

## Modal Handling

### Empty Cart Modal
Simple confirmation. Look for any confirm/proceed button.

### Merge vs Replace Modal
**Critical**: Always choose "Juntar" (merge), never "Eliminar" (replace).

```
Modal buttons:
- "Eliminar" [ref=...] → Deletes current cart, replaces with order
- "Juntar" [ref=...]   → Adds order items to existing cart (USE THIS)
```

---

## Cart Behavior

- **Deduplication**: Same products from multiple orders are combined, not duplicated
- **Header indicator**: `button "{count} {total} €"` shows current cart state
- **Example**: Merging 3 orders (35+38+44=117 items) → 77 unique items

---

## Error Handling

| Scenario | Detection | Action |
|----------|-----------|--------|
| Not logged in | No "Olá, {NAME}" button | Abort, request login |
| Order page changed | "Encomendar de novo" not found | capture_state, investigate |
| Modal type unexpected | Neither "Juntar" nor "Eliminar" | capture_state, investigate |
| Cart not updating | Count unchanged after merge | Check for error messages |

---

## Example Run

### Input
- 3 orders: 06 dez (35 items), 02 jan (38 items), 18 jan (44 items)

### Execution
1. Auth verified: "Olá, RAUL" present
2. Navigate to `/pt/historico-encomendas`
3. Identify orders, process oldest first:
   - 06 dez: Click → "Encomendar de novo" → Confirm (empty cart)
   - 02 jan: Click → "Encomendar de novo" → "Juntar" (merge)
   - 18 jan: Click → "Encomendar de novo" → "Juntar" (merge)
4. Final cart: 77 items, 337,62€

### Artifacts
```
runs/2026-01-18T-live/
├── phase2-T007-auth-check/
├── phase2-T008-order-history/
├── phase2-T009-extract-orders/
├── phase2-T010-merge-order-1/
├── phase2-T010-merge-order-2/
├── phase2-T010-merge-order-3/
└── phase2-T011-cart-final/
```

---

## Command Usage (Future)

```
/merge-orders [count=3]
```

Arguments:
- `count`: Number of recent orders to merge (default: 3)

---

## Related Procedures

- `capture_state`: Call after each significant action
- `verify_auth`: Check login state before starting

---

## Token Optimization Notes

To reduce context consumption when using BrowserMCP:

1. **Skip intermediate snapshots**: Only snapshot when absolutely needed (auth check, final verification)
2. **Use direct URLs**: Extract UUIDs from order history and navigate directly to order detail pages
3. **Grep for key data**: Instead of parsing full snapshots, use grep patterns:
   - Cart count: `button "{count} {total} €"`
   - Auth: `button "Olá, {NAME}"`
4. **Minimal verification**: Only check cart header count between merges, full snapshot at end

**Benchmarks** (optimized vs unoptimized):
- Unoptimized: 2+ context compactions per 3-order merge
- Optimized: 0 compactions, ~50% fewer API tokens

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-18 | Added token optimization notes from optimized flow test |
| 2026-01-18 | Initial procedure documented from live run |
