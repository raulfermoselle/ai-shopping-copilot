# Sprint-CB-R-001: Research Auchan.pt Order History UI

**Module:** CartBuilder
**Type:** Research (R)
**Status:** In Progress
**Started:** 2026-01-11
**Dependencies:** Sprint-G-002 (Login automation) ✅

---

## Objective

Research and document the Auchan.pt order history interface to enable cart loading and merging. This sprint will discover:
1. How to navigate to order history
2. Page structure and selectors for order lists
3. Data available per order (items, quantities, prices, dates)
4. How to access order details
5. Any pagination or lazy-loading patterns

---

## Research Questions

| # | Question | Priority |
|---|----------|----------|
| RQ1 | Where is the order history located after login? | P0 |
| RQ2 | What selectors identify the order list container? | P0 |
| RQ3 | What data is visible per order in the list view? | P0 |
| RQ4 | How do you access individual order details? | P0 |
| RQ5 | What item data is available in order details? | P0 |
| RQ6 | Are there pagination/infinite scroll patterns? | P1 |
| RQ7 | Can you add items from a past order directly to cart? | P1 |
| RQ8 | Is there a "reorder" or "buy again" feature? | P1 |

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| T001 | Navigate to order history after login | Pending |
| T002 | Capture HTML snapshot of order list page | Pending |
| T003 | Discover and document order list selectors | Pending |
| T004 | Navigate to a single order detail page | Pending |
| T005 | Capture HTML snapshot of order detail page | Pending |
| T006 | Discover and document order item selectors | Pending |
| T007 | Register selectors in Selector Registry | Pending |
| T008 | Document findings and data model recommendations | Pending |

---

## Approach

Use the **Selector Discovery Protocol** established in Sprint-G-002:

1. **Login** using existing LoginTool
2. **Navigate** to order history section
3. **Capture** HTML snapshots and screenshots
4. **Analyze** page structure for stable selectors
5. **Register** discovered selectors in the registry
6. **Document** findings for CartBuilder architecture

---

## Expected Outputs

1. `data/selectors/pages/order-history/v1.json` - Order list page selectors
2. `data/selectors/pages/order-detail/v1.json` - Order detail page selectors
3. `Sprints/Modules/CartBuilder/Sprint-CB-R-001/RESEARCH-FINDINGS.md` - Documentation
4. Updated `data/selectors/registry.json`

---

## Success Criteria

- [ ] All P0 research questions answered
- [ ] Order history selectors validated and registered
- [ ] Order detail selectors validated and registered
- [ ] Data model documented for CartBuilder implementation
- [ ] Screenshots captured at key navigation points

---

*Created: 2026-01-11*
