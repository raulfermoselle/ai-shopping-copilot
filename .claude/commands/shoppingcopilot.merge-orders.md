---
description: Merge last N orders from Auchan order history into cart
---

# Merge Orders (Shopping Copilot)

**Usage**: `/shoppingcopilot.merge-orders [count]`

**Examples**:
```
/shoppingcopilot.merge-orders 3      # Merge last 3 orders (default)
/shoppingcopilot.merge-orders 5      # Merge last 5 orders
/shoppingcopilot.merge-orders        # Uses default count of 3
```

**Namespace**: `shoppingcopilot` - Operational commands for Auchan.pt automation

## Prerequisites

- BrowserMCP extension connected to Auchan.pt tab
- User logged in (verify `button "Olá, {NAME}"` present)

## Procedure Reference

Full procedure documented in: `automation/harness/MERGE-ORDERS.md`

## Quick Reference

### URL Shortcuts
| Page | URL |
|------|-----|
| Order History | `/pt/historico-encomendas` |
| Order Detail | `/pt/detalhes-encomenda?orderID={uuid}` |
| Cart | `/pt/carrinho-compras` |

### Execution Steps
1. **Verify auth**: Check for `button "Olá, {NAME}"` in banner
2. **Navigate**: Go to `/pt/historico-encomendas`
3. **Extract orders**: Identify last N orders from list
4. **Merge loop** (oldest first):
   - Navigate to order detail
   - Click "Encomendar de novo"
   - Handle modal:
     - Empty cart: Click confirm
     - Cart has items: Click **"Juntar"** (NOT "Eliminar")
5. **Verify**: Navigate to cart, confirm item count

### Modal Handling (Critical)
```
"Eliminar" = Replace cart (DON'T USE)
"Juntar"   = Merge/add to cart (USE THIS)
```

### Cart Behavior
- Duplicate products are automatically combined
- Header shows: `button "{count} {total} €"`

## Call capture_state

After each significant action, call the `capture_state` procedure (see `automation/harness/CAPTURE-STATE.md`) to save debugging artifacts.

## Error Handling

| Issue | Action |
|-------|--------|
| Not logged in | Abort, request user to log in |
| Modal unexpected | capture_state, investigate snapshot |
| Cart not updating | Check for error banners |

## Example Output

```
Merged 3 orders into cart:
- Order 06 dez (35 items) → Cart: 35 items
- Order 02 jan (38 items) → Cart: 56 items (merged)
- Order 18 jan (44 items) → Cart: 77 items (merged)

Final cart: 77 unique items, 337,62€
```
