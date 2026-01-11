# SlotScout Module

**Status:** Research Phase (Sprint-SS-R-001)
**Purpose:** Discover and rank available delivery slots on Auchan.pt
**Agent Type:** Worker (delegated by Coordinator)

---

## Overview

SlotScout is a worker agent responsible for:
1. Navigating to the delivery slot selection page
2. Extracting all available time slots
3. Scoring slots based on user preferences (time of day, day of week, premium vs. standard)
4. Returning ranked slot options to the Coordinator for user review

**Critical:** SlotScout NEVER selects or confirms a slot. It only REPORTS options.

---

## Research Findings (Preliminary)

### Checkout Flow

**Current Knowledge:**
- Cart URL: `https://www.auchan.pt/pt/carrinho-compras`
- Checkout button selectors: `.checkout-btn`, `.auc-js-confirm-cart`
- Button has `data-url` attribute pointing to next step: `https://www.auchan.pt/pt/aproveite-ainda`
- Checkout button remains **disabled** until validation conditions are met

**Blocking Issues (2026-01-11):**
- Minimum order value requirement (exact threshold TBD)
- Possible delivery area/postcode validation required
- Client-side JavaScript validation preventing programmatic checkout

**Next URL (hypothesis):** `https://www.auchan.pt/pt/aproveite-ainda` → likely an upsell/cross-sell page before delivery selection

### Delivery Slot UI (TBD - Manual Research Required)

See: `data/selectors/pages/delivery-slots/MANUAL_RESEARCH_GUIDE.md`

**Questions to Answer:**
1. What is the URL pattern for the delivery slot page?
2. Is the UI a calendar, list, or time block grid?
3. How are slots displayed? (cards, buttons, table rows?)
4. What indicates availability vs. full?
5. Are there express/premium delivery options?
6. How are prices displayed?
7. What is the date range shown? (e.g., next 7 days, next 14 days)
8. What time windows are available? (e.g., 9-12, 12-15, 15-18, 18-21)

---

## Architecture

### Data Flow

```
Coordinator
    ↓
SlotScout.scoutSlots()
    ↓
  ┌─────────────────────┐
  │ 1. Navigate to      │
  │    delivery page    │
  └─────────────────────┘
    ↓
  ┌─────────────────────┐
  │ 2. Extract all slots│
  │    (date, time,     │
  │     price, premium) │
  └─────────────────────┘
    ↓
  ┌─────────────────────┐
  │ 3. Score each slot  │
  │    based on prefs   │
  └─────────────────────┘
    ↓
  ┌─────────────────────┐
  │ 4. Return ranked    │
  │    slot list        │
  └─────────────────────┘
    ↓
Coordinator (adds to ReviewPack)
```

### Slot Data Structure (Draft)

```typescript
interface DeliverySlot {
  id: string; // Unique identifier (e.g., "2026-01-15T09:00")
  date: string; // ISO date string "2026-01-15"
  dayOfWeek: string; // "Monday", "Tuesday", etc.
  timeWindow: {
    start: string; // "09:00"
    end: string; // "12:00"
  };
  available: boolean; // Is this slot bookable?
  price: number; // Delivery fee in EUR
  premium: boolean; // Is this an express/premium slot?
  capacity?: {
    remaining?: number; // Slots left (if shown)
    total?: number; // Total capacity (if shown)
  };
}

interface RankedSlot extends DeliverySlot {
  score: number; // 0-100, higher is better
  reason: string; // "Preferred afternoon slot on weekend"
}

interface SlotScoutResult {
  success: boolean;
  availableSlots: DeliverySlot[];
  rankedSlots: RankedSlot[];
  recommendations: {
    bestSlot: RankedSlot;
    alternatives: RankedSlot[]; // Top 3-5 alternatives
  };
  constraints: {
    minimumOrderValue?: number;
    earliestDate?: string;
    latestDate?: string;
  };
}
```

### Scoring Heuristics (Draft)

| Factor | Weight | Scoring |
|--------|--------|---------|
| Preferred day of week | 30% | Weekend +30, Weekday preference from user prefs |
| Preferred time of day | 30% | Morning/Afternoon/Evening preference from user |
| Delivery cost | 20% | Lower cost → higher score |
| Soonest available | 10% | Earlier date → slightly higher score |
| Premium option | 10% | Bonus if user prefers express delivery |

**User Preferences (to be defined):**
- `preferredDays`: `['Saturday', 'Sunday']`
- `preferredTime`: `'afternoon'` (9-12, 12-15, 15-18, 18-21)
- `maxDeliveryFee`: `5.00` (EUR)
- `premiumDeliveryOk`: `false`

---

## Tool Design

### SlotScout Tool Interface

```typescript
interface SlotScoutInput {
  /** User preferences for slot ranking */
  preferences: UserSlotPreferences;
  /** Minimum number of slots to return */
  minSlots?: number; // Default: 5
  /** Maximum date range to search */
  maxDaysAhead?: number; // Default: 14
}

interface SlotScoutOutput {
  /** All available slots found */
  availableSlots: DeliverySlot[];
  /** Top-ranked slots */
  rankedSlots: RankedSlot[];
  /** Best recommendation */
  bestSlot?: RankedSlot;
  /** Constraints discovered */
  constraints: SlotConstraints;
}
```

### Implementation Phases

**Phase 1: Research** (current sprint)
- [ ] Manual exploration of delivery slot UI
- [ ] Document selectors to `delivery-slots/v1.json`
- [ ] Capture screenshots and HTML snapshots
- [ ] Define slot data structure

**Phase 2: Extraction**
- [ ] Implement slot scraping tool using selectors
- [ ] Handle pagination/date navigation
- [ ] Extract all slot attributes (date, time, price, availability)
- [ ] Validate data structure

**Phase 3: Scoring**
- [ ] Implement scoring heuristics
- [ ] Load user preferences from config/memory
- [ ] Rank slots by score
- [ ] Generate recommendation explanation

**Phase 4: Integration**
- [ ] Integrate with Coordinator
- [ ] Add to ReviewPack output
- [ ] Handle edge cases (no slots available, all slots expensive)
- [ ] Add retry/recovery logic

---

## Selector Strategy

**Critical Selectors Needed:**

| Selector Key | Purpose | Stability Priority |
|--------------|---------|-------------------|
| `slotPicker` | Main container | High (data-testid or semantic class) |
| `dateNavNext` | Navigate to next week | Medium (aria-label preferred) |
| `dateNavPrev` | Navigate to previous week | Medium (aria-label preferred) |
| `slotButton` | Individual slot element | High (data-slot-id or stable class) |
| `slotTime` | Time window text | Medium (nested text content) |
| `slotPrice` | Delivery fee | Medium (price class or data-price) |
| `slotAvailable` | Availability indicator | High (state class or aria-disabled) |
| `slotPremium` | Premium/express badge | Low (may not exist) |

**Fallback Strategy:**
- Primary: `data-testid`, `data-slot-id`
- Secondary: `aria-label`, semantic classes (`.slot`, `.time-slot`)
- Tertiary: CSS classes (`.auc-slot-button`, `.delivery-slot`)
- Last resort: Text content matching (`:has-text("Disponível")`)

---

## Error Handling

### Expected Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| No slots available | All slots full, or outside delivery area | Notify user, suggest alternative dates |
| Minimum order not met | Cart value too low | Return error with required minimum |
| Page layout changed | Auchan UI update | Fallback selectors, log failure, alert maintainers |
| Navigation timeout | Slow network or page load | Retry up to 3 times with exponential backoff |
| Slot data incomplete | Partial scrape due to lazy loading | Retry after scroll, accept partial data |

### Circuit Breaker

If slot scraping fails **3 consecutive times** across different sessions:
1. Log critical error with screenshots
2. Notify Coordinator of SlotScout failure
3. Coordinator presents fallback: "Delivery slot selection unavailable - proceed to manual checkout"

---

## Testing Strategy

### Unit Tests
- Slot scoring algorithm (pure function)
- Preference matching logic
- Date/time parsing

### Integration Tests (with mocked page)
- Selector resolution
- Slot extraction from HTML fixtures
- Ranking output format

### E2E Tests (with real Auchan.pt)
- Full checkout flow to slot page
- Slot extraction
- Handle "no slots available" case
- Handle "premium only" case

---

## Open Questions

1. **Session handling:** Can we view slots without completing full checkout? Or do we need to maintain checkout state?
2. **Delivery area:** Is there a delivery area/postcode restriction? How is it validated?
3. **Minimum order:** What is the exact minimum cart value for delivery?
4. **Slot capacity:** Does Auchan.pt show remaining slot capacity, or just available/full?
5. **Booking window:** How far in advance can slots be booked? (e.g., max 14 days)
6. **Premium delivery:** What are the exact differences between standard and premium/express delivery?

---

## Next Steps

1. **User Action Required:** Complete manual research using `MANUAL_RESEARCH_GUIDE.md`
2. Create `delivery-slots/v1.json` with verified selectors
3. Update `registry.json` to register delivery-slots page
4. Implement `SlotScoutTool` in `src/agents/slot-scout/tools/`
5. Define types in `src/agents/slot-scout/types.ts`
6. Implement scoring in `src/agents/slot-scout/scoring.ts`

---

**Last Updated:** 2026-01-11
**Sprint:** Sprint-SS-R-001 (In Progress)
**Blockers:** Manual research required - automated exploration blocked by checkout validation
