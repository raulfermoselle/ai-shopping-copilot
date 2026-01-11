# Delivery Slot Manual Research Guide

**Sprint:** Sprint-SS-R-001
**Date:** 2026-01-11
**Status:** Automated exploration blocked - manual completion required

---

## Problem Summary

Automated research script successfully:
- Logged into Auchan.pt
- Added product to cart
- Located checkout button (`.checkout-btn`, `.auc-js-confirm-cart`)

However, checkout button remains **disabled** and navigation to checkout is blocked, likely due to:
1. Minimum order value requirement
2. Delivery area/postcode validation required
3. Client-side JavaScript validation
4. Session state requirements

---

## Manual Research Instructions

### Step 1: Prepare Cart
1. Login to Auchan.pt manually: `https://www.auchan.pt`
2. Add multiple items to cart (aim for ~30-50€ to meet minimum order)
3. Navigate to cart: `https://www.auchan.pt/pt/carrinho-compras`

### Step 2: Proceed to Checkout
1. Verify checkout button is **enabled** (not grayed out)
2. Click the checkout button
3. **Document the URL** you land on

### Step 3: Delivery Slot UI Research

Record the following information:

#### 3.1 URL Pattern
- What is the URL for the delivery slot selection page?
- Does it include query parameters? (e.g., `?step=delivery`)

#### 3.2 Page Structure
- **Format:** Is it a calendar view, list view, or time blocks?
- **Date Range:** How many days ahead can you see?
- **Time Slots:** What time windows are available? (e.g., 9-12, 12-15, 15-18)

#### 3.3 Slot Availability
- How are available slots indicated? (green button, checkmark, "Disponível"?)
- How are full slots indicated? (grayed out, "Esgotado", disabled state?)
- Are there **premium** or **express** delivery options? What distinguishes them?

#### 3.4 Pricing
- Do different slots have different prices?
- Is delivery free above a certain cart value?
- Are there premium slot surcharges?

#### 3.5 Constraints
- What is the **minimum cart value** for delivery?
- How far in advance can slots be booked?
- Are there capacity limits per slot?

### Step 4: Capture Selectors

#### Critical Elements to Identify

| Element | Description | Selector Examples |
|---------|-------------|-------------------|
| **Calendar Container** | Main date/time picker | `.calendar`, `.slot-picker`, `[role="grid"]` |
| **Date Navigation** | Previous/Next week buttons | `button[aria-label*="next"]`, `.calendar-nav` |
| **Individual Slot** | Clickable time slot button/card | `.slot-button`, `[data-slot-id]`, `.time-slot` |
| **Availability Indicator** | Shows if slot is available/full | `.available`, `.full`, `[aria-disabled]` |
| **Slot Price** | Fee for that specific slot | `.slot-price`, `[data-price]` |
| **Slot Time** | Time window text (e.g., "9:00-12:00") | `.slot-time`, `[data-time]` |
| **Express/Premium Badge** | Indicates special delivery type | `.express`, `.premium`, `.badge` |

#### How to Capture

1. **Right-click** on each element → **Inspect**
2. Note the **class names**, **data attributes**, and **IDs**
3. Look for multiple selector options (primary + fallbacks)
4. Take **screenshots** of:
   - Full page view
   - Calendar/picker UI
   - Individual slot (hover state if any)
   - Unavailable slot
   - Premium slot (if exists)

### Step 5: Test Slot Data Extraction

Using browser console, test extracting slot data:

```javascript
// Find all slot elements
const slots = document.querySelectorAll('[YOUR_SLOT_SELECTOR]');

// Extract slot data
slots.forEach(slot => {
  console.log({
    date: slot.getAttribute('data-date') || slot.querySelector('.date')?.textContent,
    time: slot.getAttribute('data-time') || slot.querySelector('.time')?.textContent,
    available: !slot.classList.contains('disabled') && !slot.hasAttribute('disabled'),
    price: slot.querySelector('.price')?.textContent,
    premium: slot.classList.contains('premium') || slot.classList.contains('express')
  });
});
```

### Step 6: Document Findings

Create/update the following files:

1. **`v1.json`** - Selector definitions (see template below)
2. **`research-notes.md`** - Prose description of UI behavior
3. **Screenshots** - Save to `snapshots/` directory

---

## Selector Definition Template

```json
{
  "schemaVersion": "1.0.0",
  "page": "delivery-slots",
  "version": 1,
  "urlPattern": "^https://(www\\.)?auchan\\.pt/pt/[YOUR_PATTERN]",
  "lastValidated": "2026-01-11T00:00:00Z",
  "notes": "Delivery slot selection page. Accessed after checkout from cart.",
  "selectors": {
    "slotPicker": {
      "name": "Main slot picker container",
      "primary": "YOUR_PRIMARY_SELECTOR",
      "fallbacks": ["FALLBACK_1", "FALLBACK_2"],
      "score": 75,
      "reason": "Explanation of why this selector is stable",
      "verified": true
    },
    "slotButton": {
      "name": "Individual time slot button",
      "primary": "YOUR_PRIMARY_SELECTOR",
      "fallbacks": ["FALLBACK_1", "FALLBACK_2"],
      "score": 70,
      "reason": "Explanation",
      "verified": true
    }
    // ... add all other selectors
  }
}
```

---

## Next Steps After Manual Research

1. Update `data/selectors/registry.json` to include `delivery-slots` page
2. Create `docs/modules/slot-scout.md` with research findings
3. Define slot data structure in `src/agents/slot-scout/types.ts`
4. Implement `SlotScoutTool` using discovered selectors

---

## Current Automated Research Output

See:
- `research-findings.json` - Partial automated findings
- `snapshots/cart-with-item-*.png` - Cart page screenshots
- `snapshots/cart-with-item-*.html` - Cart page HTML dumps

**Note:** These show the cart page but NOT the delivery slot page due to checkout being blocked.
