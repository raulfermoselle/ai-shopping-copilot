# Auchan.pt Order History UI Research Summary

**Sprint:** Sprint-CB-R-001
**Date:** 2026-01-11
**Status:** Complete

---

## Navigation Flow

### Access Order History
1. User must be logged in
2. Click account button (shows "OLÁ, [NAME]" in top right)
3. A sidebar opens from the right side
4. Click "Histórico de encomendas" link in sidebar
5. Navigates to: `https://www.auchan.pt/pt/historico-encomendas`

**Key Discovery:** The account menu is a **sidebar overlay**, not a dropdown menu. This is why initial automated detection failed - the links are injected/rendered dynamically when the sidebar opens.

---

## Order History List Page

**URL Pattern:** `https://www.auchan.pt/pt/historico-encomendas`
**Page Title:** "Histórico de Encomendas | Auchan"

### Structure

The page displays a vertical list of past orders. Each order is presented as a **clickable card** (`<a>` tag wrapping the entire card).

### Order Card Structure

Each order card contains:

- **Date display:**
  - Day number (e.g., "02")
  - Month abbreviation (e.g., "jan")
  - ISO timestamp in `data-date` attribute

- **Order number:**
  - Label: "Encomenda"
  - Numeric ID: "002915480"

- **Product count:**
  - Format: "38 Produtos"

- **Total price:**
  - Format: "162,51 €"

- **Right arrow icon:**
  - Visual indicator for clickability

### Primary Selectors

- **Order list container:** `.auc-orders`
- **Individual order card:** `.auc-orders__order-card`
- **Clickable link:** `a[href*='/pt/detalhes-encomenda?orderID=']`
- **Order date:** `.auc-orders__order-date` (with `.auc-run--day` and `.auc-run--monthd`)
- **Order number:** `.auc-orders__order-number span:nth-child(2)`
- **Product count:** `.auc-orders__order-products`
- **Total price:** `.auc-orders__order-price`

### CSS Class Naming Pattern

Auchan uses **BEM methodology** (Block Element Modifier):
- Block: `.auc-orders`
- Element: `.auc-orders__order-card`, `.auc-orders__order-date`
- Modifier: `.auc-orders--date`, `.auc-orders--price`

**Stability Assessment:** Moderate to good. BEM classes are intentionally semantic and less likely to change than auto-generated classes. However, they are not as stable as `data-testid` attributes.

---

## Order Detail Page

**URL Pattern:** `https://www.auchan.pt/pt/detalhes-encomenda?orderID=[uuid]`
**Page Title:** "Detalhes da sua Encomenda | Auchan"

### Structure

The page is divided into sections:

1. **Order Header**
   - Date, order number, product count, total price

2. **Delivery Information**
   - Delivery type (e.g., "Entrega em Casa")
   - Delivery address
   - Expected delivery date/time window

3. **Product List**
   - Each product shows:
     - Product image (thumbnail)
     - Product name (with link to product page)
     - Quantity (format: "x0", "x2")
     - Price per item
   - May be paginated with "Ver todos" (View all) button

4. **Action Button**
   - "Encomendar de novo" (Reorder) - adds all items to cart

5. **Order Summary (Resumo)**
   - Number of products
   - Products subtotal
   - Delivery fee ("Entrega")
   - Grand total

### Primary Selectors

**Order Header:**
- Date: `.auc-orders--date` with `[data-date]`
- Order number: `.auc-orders__order-number`
- Product count: `.auc-orders__order-products`
- Total: `.auc-orders__order-price`

**Delivery Info:**
- Container: `.auc-orders--delivery-info`
- Type: `.auc-order-adress`
- Address: `.auc-orders__sub-order-address`

**Product List:**
- Container: `.auc-orders__products`
- Product card: `.auc-orders__product-card`
- Product name: `.auc-orders__product-name a`
- Product image: `.auc-cart__product-image`
- Quantity: `.auc-orders__product-quantity`
- Price: `.auc-orders__product-price`

**Actions:**
- View all button: `button:has-text('Ver todos')`
- Reorder button: `button:has-text('Encomendar de novo')`

**Summary:**
- Container: `.auc-checkout__totals`
- Subtotal: `.tax-total`
- Total: `.auc-checkout__totals-grandtotal`

### Important Notes

1. **Product Pagination:** Products may be initially limited (showing ~3 items) with a "Ver todos" button to expand. The tool should click this button before extracting the full product list.

2. **Quantity Format:** Quantities are displayed as "x0", "x2", etc. Parse the integer after "x".

3. **Price Format:** Prices use Portuguese format: "162,51 €" (comma as decimal separator).

4. **Reorder Functionality:** The "Encomendar de novo" button exists and can add all order items to cart. This is valuable for the CartBuilder tool.

---

## Data Extraction Strategy

### Order List Extraction

To extract all past orders:

1. Navigate to order history page
2. Locate all `.auc-orders__order-card` elements
3. For each card, extract:
   - `orderDate` from `[data-date]` attribute (ISO timestamp)
   - `orderNumber` from `.auc-orders__order-number span:nth-child(2)` (text)
   - `productCount` from `.auc-orders__order-products` (parse integer)
   - `totalPrice` from `.auc-orders__order-price` (parse currency)
   - `detailUrl` from card's `href` attribute

### Order Detail Extraction

To extract full order details:

1. Navigate to order detail page (click order card or use direct URL)
2. Wait for page load
3. Click "Ver todos" button if present (to expand product list)
4. Extract order header info
5. Extract delivery info
6. Locate all `.auc-orders__product-card` elements
7. For each product, extract:
   - `name` from `.auc-orders__product-name a` (text)
   - `productUrl` from same link's `href`
   - `imageUrl` from `.auc-cart__product-image` `src` attribute
   - `quantity` from `.auc-orders__product-quantity` (parse "x#")
   - `price` from `.auc-orders__product-price` (parse currency)
8. Extract summary info

---

## Selector Resilience

### High Confidence (Score 75+)
- URL pattern selectors (e.g., `a[href*='/pt/detalhes-encomenda']`)
- These are stable as long as URL structure doesn't change

### Moderate Confidence (Score 60-74)
- BEM class selectors (e.g., `.auc-orders__order-card`)
- Fairly stable due to intentional naming
- May change with major redesigns

### Lower Confidence (Score 50-59)
- Structural selectors (e.g., `span:nth-child(2)`)
- Text-based selectors (e.g., `:has-text('Resumo')`)
- More fragile to UI changes

### Fallback Strategy

For critical selectors, 2-3 fallbacks are provided in selector registry files:

1. **Primary:** BEM class (best balance of stability and specificity)
2. **Fallback 1:** Alternative class or data attribute
3. **Fallback 2:** Structural or text-based selector (last resort)

---

## Screenshots and Artifacts

All captured artifacts are stored in:

**Screenshots:**
- `screenshots/account-sidebar.png` - Account menu sidebar
- `screenshots/order-history-list.png` - Full order history page
- `screenshots/order-detail-page.png` - Full order detail page

**HTML Snapshots:**
- `data/selectors/pages/order-history/snapshots/order-list.html`
- `data/selectors/pages/order-detail/snapshots/order-detail.html`

**Selector Registries:**
- `data/selectors/pages/order-history/v1.json`
- `data/selectors/pages/order-detail/v1.json`
- `data/selectors/registry.json` (updated)

**Analysis Files:**
- `data/selectors/pages/order-history/analysis.json`
- `data/selectors/pages/order-detail/analysis.json`

---

## Reorder Functionality Discovery

**Key Finding:** Auchan provides a "Encomendar de novo" (Reorder) button on the order detail page that adds **all items from that order to the cart**.

### Implications for CartBuilder Tool

This is extremely valuable for the CartBuilder agent. Instead of:
1. Navigating to order history
2. Opening order detail
3. Clicking each product individually
4. Adding each to cart

We can:
1. Navigate to order history
2. Open target order detail
3. Click "Encomendar de novo" button
4. Entire order added to cart instantly

**Recommended Strategy:**
- Use the reorder button for fast bulk cart population
- Fall back to individual product addition if button fails or for selective item addition
- Combine multiple orders by reordering sequentially

---

## Next Steps

With this research complete, the following can now be implemented:

1. **OrderHistoryTool**
   - Navigate to order history
   - Extract list of orders with metadata
   - Return structured order list

2. **OrderDetailTool**
   - Navigate to specific order detail
   - Extract full order data (products, delivery, summary)
   - Return structured order detail

3. **ReorderTool**
   - Navigate to order detail
   - Click "Encomendar de novo" button
   - Verify items added to cart

4. **CartBuilderAgent Integration**
   - Use OrderHistoryTool to list recent orders
   - Use ReorderTool to bulk-add items from selected orders
   - Use Substitution and StockPruner to refine cart

---

## Validation Status

**Selectors Verified:** Yes
**Reorder Button Tested:** Observed (not clicked in research)
**Pagination Handling:** "Ver todos" button identified
**URL Patterns:** Confirmed stable

**Last Validated:** 2026-01-11T17:45:00Z

---

**Research Completed By:** Playwright RPA Engineer Agent
**Approved For Implementation:** Ready
