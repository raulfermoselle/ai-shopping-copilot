# ACTION REQUIRED: Complete Delivery Slot Research

**Sprint:** Sprint-SS-R-001
**Status:** 60% Complete - Manual Research Needed
**Estimated Time:** 1-2 hours

---

## Summary

Automated research successfully explored the login and cart flows, but **cannot proceed past checkout** due to validation requirements. Your manual input is needed to complete this sprint.

---

## What You Need to Do

### Step 1: Read the Research Guide

Open and follow: **`data/selectors/pages/delivery-slots/MANUAL_RESEARCH_GUIDE.md`**

This guide contains detailed instructions for:
- Adding items to cart
- Proceeding through checkout
- Capturing delivery slot UI selectors
- Documenting constraints

### Step 2: Add Items to Cart

1. Go to `https://www.auchan.pt`
2. Add **40-50 EUR** worth of items to cart (minimum order requirement)
3. Ensure delivery address is configured in your account

### Step 3: Proceed to Checkout

1. Navigate to cart: `https://www.auchan.pt/pt/carrinho-compras`
2. Click the checkout button (should now be **enabled**)
3. **Document the URL** you land on

### Step 4: Explore Delivery Slots

**Record these details:**
- URL pattern for slot selection page
- UI format (calendar, list, time blocks)
- Time windows available (9-12, 12-15, etc.)
- How availability is shown (colors, text, icons)
- How prices are displayed
- Premium/express delivery options

### Step 5: Capture Selectors

Using browser DevTools (F12):
1. Right-click each important element → Inspect
2. Note the **class names**, **data attributes**, **IDs**
3. Take screenshots of the UI

**Critical Elements:**
- Slot picker container
- Individual slot buttons
- Availability indicators
- Price displays
- Date navigation

### Step 6: Create Selector File

Create: **`data/selectors/pages/delivery-slots/v1.json`**

Use the template in `MANUAL_RESEARCH_GUIDE.md`

### Step 7: Update Registry

Add delivery-slots page entry to: **`data/selectors/registry.json`**

Example:
```json
"delivery-slots": {
  "name": "Delivery Slot Selection",
  "urlPattern": "^https://(www\\.)?auchan\\.pt/pt/YOUR_URL_PATTERN",
  "activeVersion": 1,
  "versions": [1],
  "lastValidation": {
    "timestamp": "2026-01-11T00:00:00Z",
    "status": "valid",
    "failedSelectors": []
  },
  "notes": "Delivery slot picker. Accessed after checkout from cart."
}
```

---

## Files to Create/Update

| File | Action | Template |
|------|--------|----------|
| `data/selectors/pages/delivery-slots/v1.json` | Create | See MANUAL_RESEARCH_GUIDE.md |
| `data/selectors/registry.json` | Update | Add delivery-slots entry |
| `data/selectors/pages/delivery-slots/research-notes.md` | Create (optional) | Prose description of UI |

---

## What We've Already Done

- ✅ Created login automation
- ✅ Created cart automation
- ✅ Added test product to cart
- ✅ Identified checkout button selectors
- ✅ Captured screenshots of cart flow
- ✅ Documented research methodology
- ✅ Created module architecture docs

**You're picking up where automation stopped.**

---

## Why We Need This

The **SlotScout** agent needs to:
1. Navigate to the delivery slot page
2. Extract all available slots (date, time, price, availability)
3. Rank slots based on user preferences
4. Present top options in the Review Pack

**Without these selectors, SlotScout cannot be implemented.**

---

## Questions You Should Answer

1. **URL:** What is the delivery slot selection page URL?
2. **Format:** Calendar, list, or time block grid?
3. **Slots:** What time windows are shown? (e.g., 9-12, 12-15, 15-18, 18-21)
4. **Availability:** How do you know a slot is available vs. full?
5. **Pricing:** Is delivery free? Are there surcharges for some slots?
6. **Premium:** Are there express/premium delivery options?
7. **Constraints:** What is the minimum cart value? How far ahead can you book?

---

## After You Complete This

1. Commit your changes:
   ```bash
   git add data/selectors/pages/delivery-slots/
   git commit -m "feat(slot-scout): Add delivery slot selectors from manual research"
   ```

2. Move to implementation sprint: **Sprint-SS-I-001**

3. Implement `SlotScoutTool` using your discovered selectors

---

## Need Help?

- **Detailed Guide:** `data/selectors/pages/delivery-slots/MANUAL_RESEARCH_GUIDE.md`
- **Module Context:** `docs/modules/slot-scout.md`
- **Progress Report:** `Sprints/Sprint-SS-R-001/RESEARCH_STATUS.md`
- **Sprint Overview:** `Sprints/Sprint-SS-R-001/README.md`

---

## Timeline

**Manual Research:** 1-2 hours
**Implementation (after):** 8-12 hours

---

**Priority:** High - Blocks Sprint-SS-I-001 (Slot Scout Implementation)

Thank you for completing this research! 🙏
