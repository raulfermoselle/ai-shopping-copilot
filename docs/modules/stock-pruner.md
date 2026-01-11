# StockPruner Module

**Module ID:** SP
**Type:** Worker Agent
**Status:** Research Complete (Sprint-SP-R-001)

---

## Overview

The StockPruner agent is responsible for analyzing household stock levels and suggesting items to remove from the cart based on recent purchase history and restock cadence patterns. It uses historical order data to identify items that were "recently purchased" and are unlikely to need restocking yet.

### Key Insight

Non-food household items (detergents, toiletries, cleaning supplies) have predictable restock cadences (weekly, monthly, bi-monthly, quarterly). By tracking the last purchase date and typical consumption interval for each item category, we can suggest removing items that don't need restocking yet, significantly reducing cart bloat and saving user review time.

---

## Architecture

```
StockPruner Agent
       │
       ├── loadHouseholdContext()   → Load purchase history + restock profiles
       │
       ├── analyzeCartItems()       → Match cart items to historical purchases
       │
       ├── calculateRestockNeed()   → For each item:
       │       │                       - Days since last purchase
       │       │                       - Typical restock cadence
       │       │                       - Category-based heuristic
       │       │
       │       └──→ PruneDecision(prune: bool, confidence: 0-1, reason: string)
       │
       ├── generatePruneReport()    → StockPruneReport
       │
       └──→ Return to Coordinator
```

---

## Data Flow

```
1. Receive cart state (from CartBuilder)
       ↓
2. Load household purchase history (last 90 days)
       ↓
3. Load household restock profiles (per-item cadences)
       ↓
4. For each cart item:
   ├── Match to historical purchases (by productId, name)
   ├── Calculate days since last purchase
   ├── Lookup category restock cadence (default if unknown)
   ├── Apply heuristic: should prune if (daysSince < cadence * 0.7)
   └── Generate PruneDecision with confidence score
       ↓
5. Aggregate prune decisions
       ↓
6. Generate StockPruneReport
       ↓
→ Return to Coordinator for user review
```

---

## Types

### Purchase History Types

| Type | Description |
|------|-------------|
| `PurchaseRecord` | Single purchase of an item (productId, date, quantity) |
| `PurchaseHistory` | Array of PurchaseRecord for a given time window |
| `ItemPurchaseHistory` | Aggregated purchase history for a specific item |

### Restock Tracking Types

| Type | Description |
|------|-------------|
| `RestockCadence` | Typical restock interval in days (e.g., 30 for monthly) |
| `RestockProfile` | Item-specific restock cadence + category |
| `HouseholdStockProfile` | Map of productId → RestockProfile |
| `CategoryCadence` | Default cadences by product category |

### Pruning Decision Types

| Type | Description |
|------|-------------|
| `PruneDecision` | Decision to prune/keep an item with confidence + reason |
| `PruneReason` | Enumeration of prune reasons |
| `StockPruneReport` | Full report with all prune decisions + metadata |

---

## Data Model

### PurchaseRecord

```typescript
interface PurchaseRecord {
  // Product identifier
  productId: string;

  // Product name (for fuzzy matching if productId unavailable)
  productName: string;

  // Purchase date
  purchaseDate: Date;

  // Quantity purchased
  quantity: number;

  // Source order ID
  orderId: string;
}
```

### RestockProfile

```typescript
interface RestockProfile {
  // Product identifier
  productId: string;

  // Product name
  productName: string;

  // Product category (for fallback heuristics)
  category: ProductCategory;

  // Typical restock cadence in days
  restockCadenceDays: number;

  // Confidence in this cadence (0-1)
  // 1.0 = learned from history, 0.5 = category default
  confidence: number;

  // Last known purchase date
  lastPurchaseDate?: Date;

  // Average quantity per purchase
  averageQuantity?: number;

  // How this cadence was determined
  source: 'learned' | 'category-default' | 'user-override';
}
```

### ProductCategory

```typescript
enum ProductCategory {
  // Food categories (short cadences)
  FRESH_PRODUCE = 'fresh-produce',          // 3-7 days
  DAIRY = 'dairy',                          // 7-10 days
  MEAT_FISH = 'meat-fish',                  // 7-10 days
  BREAD_BAKERY = 'bread-bakery',            // 3-5 days

  // Pantry staples (medium cadences)
  PANTRY_STAPLES = 'pantry-staples',        // 30-45 days (rice, pasta, canned goods)
  BEVERAGES = 'beverages',                  // 14-21 days (coffee, tea, juices)
  SNACKS = 'snacks',                        // 14-21 days

  // Household consumables (long cadences)
  LAUNDRY = 'laundry',                      // 30-60 days (detergent, softener)
  CLEANING = 'cleaning',                    // 30-60 days (dish soap, cleaners)
  PAPER_PRODUCTS = 'paper-products',        // 30-45 days (toilet paper, paper towels)
  PERSONAL_HYGIENE = 'personal-hygiene',    // 30-60 days (shampoo, soap, toothpaste)

  // Baby & pet (variable cadences)
  BABY_CARE = 'baby-care',                  // 14-30 days (diapers, wipes)
  PET_SUPPLIES = 'pet-supplies',            // 21-30 days (pet food, litter)

  // Uncategorized (conservative default)
  UNKNOWN = 'unknown',                      // 21 days (conservative)
}
```

### CategoryCadenceDefaults

```typescript
const CATEGORY_CADENCE_DEFAULTS: Record<ProductCategory, number> = {
  [ProductCategory.FRESH_PRODUCE]: 5,
  [ProductCategory.DAIRY]: 8,
  [ProductCategory.MEAT_FISH]: 8,
  [ProductCategory.BREAD_BAKERY]: 4,

  [ProductCategory.PANTRY_STAPLES]: 37,
  [ProductCategory.BEVERAGES]: 17,
  [ProductCategory.SNACKS]: 17,

  [ProductCategory.LAUNDRY]: 45,
  [ProductCategory.CLEANING]: 45,
  [ProductCategory.PAPER_PRODUCTS]: 37,
  [ProductCategory.PERSONAL_HYGIENE]: 45,

  [ProductCategory.BABY_CARE]: 22,
  [ProductCategory.PET_SUPPLIES]: 25,

  [ProductCategory.UNKNOWN]: 21,
};
```

### PruneDecision

```typescript
interface PruneDecision {
  // Product being evaluated
  productId?: string;
  productName: string;

  // Should this item be pruned from the cart?
  prune: boolean;

  // Confidence in this decision (0-1)
  confidence: number;

  // Human-readable reason
  reason: string;

  // Detailed context for the decision
  context: {
    // Days since last purchase
    daysSinceLastPurchase?: number;

    // Expected restock cadence
    restockCadenceDays: number;

    // Restock urgency ratio (daysSince / cadence)
    // < 0.5 = very recent, 0.7-1.0 = approaching restock, > 1.0 = overdue
    restockUrgencyRatio?: number;

    // Product category used for heuristic
    category: ProductCategory;

    // Last purchase date
    lastPurchaseDate?: Date;

    // Whether this is a learned cadence or category default
    cadenceSource: 'learned' | 'category-default' | 'no-history';
  };
}
```

### PruneReason

```typescript
enum PruneReason {
  RECENTLY_PURCHASED = 'recently-purchased',           // Purchased within 70% of cadence
  ADEQUATE_STOCK = 'adequate-stock',                   // Sufficient quantity purchased recently
  SEASONAL_MISMATCH = 'seasonal-mismatch',             // Seasonal item out of season
  DUPLICATE_IN_CART = 'duplicate-in-cart',             // Same item already in cart
  USER_PREFERENCE_EXCLUDE = 'user-preference-exclude', // User explicitly excluded
}
```

### StockPruneReport

```typescript
interface StockPruneReport {
  // Report metadata
  timestamp: Date;
  sessionId: string;

  // Cart analysis
  itemsAnalyzed: number;
  itemsSuggestedForPruning: number;

  // Prune decisions for each cart item
  decisions: PruneDecision[];

  // Items recommended for removal (high confidence)
  recommendedPrunes: {
    productName: string;
    productId?: string;
    confidence: number;
    reason: string;
    daysSinceLastPurchase: number;
  }[];

  // Items with uncertain prune status (moderate confidence)
  uncertainItems: {
    productName: string;
    productId?: string;
    confidence: number;
    reason: string;
  }[];

  // Purchase history metadata
  historyAnalyzed: {
    daysBackAnalyzed: number;
    ordersAnalyzed: number;
    uniqueItemsPurchased: number;
  };

  // Confidence in overall report
  overallConfidence: number;

  // Warnings (e.g., limited history, category unknown)
  warnings: string[];

  // Screenshots captured during analysis
  screenshots: string[];
}
```

---

## Persistence Layer

### Option 1: SQLite Database (Recommended for Phase 2+)

**Schema Design:**

```sql
-- Purchase history table
CREATE TABLE purchase_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  product_name TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  quantity INTEGER NOT NULL,
  order_id TEXT NOT NULL,
  unit_price REAL,
  category TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_id (product_id),
  INDEX idx_purchase_date (purchase_date)
);

-- Restock profiles table
CREATE TABLE restock_profiles (
  product_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  restock_cadence_days INTEGER NOT NULL,
  confidence REAL NOT NULL,
  last_purchase_date DATE,
  average_quantity REAL,
  source TEXT NOT NULL, -- 'learned', 'category-default', 'user-override'
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User overrides table (explicit user preferences)
CREATE TABLE user_overrides (
  product_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  never_prune BOOLEAN DEFAULT FALSE,
  always_prune BOOLEAN DEFAULT FALSE,
  custom_cadence_days INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pruning history (episodic memory)
CREATE TABLE prune_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  prune_suggested BOOLEAN NOT NULL,
  user_accepted BOOLEAN,
  confidence REAL NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id)
);
```

### Option 2: File-Based Storage (Phase 1)

**Directory Structure:**

```
data/
  stock/
    purchase-history.json          # All purchase records
    restock-profiles.json          # Learned restock profiles
    user-overrides.json            # User preferences
    prune-history/
      session-{id}-prune.json      # Per-session prune decisions
```

**File Formats:**

```typescript
// purchase-history.json
{
  "records": PurchaseRecord[],
  "lastUpdated": "2026-01-11T10:00:00Z"
}

// restock-profiles.json
{
  "profiles": Record<productId, RestockProfile>,
  "lastUpdated": "2026-01-11T10:00:00Z"
}

// user-overrides.json
{
  "overrides": Record<productId, {
    neverPrune?: boolean;
    alwaysPrune?: boolean;
    customCadenceDays?: number;
    notes?: string;
  }>,
  "lastUpdated": "2026-01-11T10:00:00Z"
}
```

---

## Heuristics & Decision Logic

### Pruning Decision Algorithm

```typescript
function shouldPruneItem(
  item: CartItem,
  purchaseHistory: PurchaseRecord[],
  restockProfile: RestockProfile | null,
  userOverrides: UserOverride | null
): PruneDecision {
  // 1. Check user overrides first (highest priority)
  if (userOverrides?.neverPrune) {
    return {
      prune: false,
      confidence: 1.0,
      reason: 'User override: never prune',
      // ...
    };
  }

  if (userOverrides?.alwaysPrune) {
    return {
      prune: true,
      confidence: 1.0,
      reason: 'User override: always prune',
      // ...
    };
  }

  // 2. No purchase history → cannot prune (keep in cart)
  if (purchaseHistory.length === 0) {
    return {
      prune: false,
      confidence: 0.3,
      reason: 'No purchase history available',
      context: {
        cadenceSource: 'no-history',
        // ...
      }
    };
  }

  // 3. Find most recent purchase
  const lastPurchase = purchaseHistory.sort((a, b) =>
    b.purchaseDate.getTime() - a.purchaseDate.getTime()
  )[0];

  const daysSinceLastPurchase = Math.floor(
    (Date.now() - lastPurchase.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 4. Determine restock cadence
  let cadenceDays: number;
  let cadenceSource: 'learned' | 'category-default';
  let category: ProductCategory;

  if (restockProfile) {
    cadenceDays = restockProfile.restockCadenceDays;
    cadenceSource = restockProfile.source === 'learned' ? 'learned' : 'category-default';
    category = restockProfile.category;
  } else {
    // Fallback to category default (infer category from product name)
    category = inferCategoryFromName(item.name);
    cadenceDays = CATEGORY_CADENCE_DEFAULTS[category];
    cadenceSource = 'category-default';
  }

  // 5. Calculate restock urgency ratio
  const urgencyRatio = daysSinceLastPurchase / cadenceDays;

  // 6. Decision thresholds
  const PRUNE_THRESHOLD = 0.7;  // Prune if < 70% of cadence elapsed
  const UNCERTAIN_THRESHOLD = 0.9; // Uncertain if 70-90% of cadence elapsed

  if (urgencyRatio < PRUNE_THRESHOLD) {
    // Recently purchased, high confidence prune
    const confidence = Math.min(1.0, (PRUNE_THRESHOLD - urgencyRatio) / PRUNE_THRESHOLD);

    return {
      prune: true,
      confidence: cadenceSource === 'learned' ? confidence : confidence * 0.8,
      reason: `Purchased ${daysSinceLastPurchase} days ago (typical restock: ${cadenceDays} days)`,
      context: {
        daysSinceLastPurchase,
        restockCadenceDays: cadenceDays,
        restockUrgencyRatio: urgencyRatio,
        category,
        lastPurchaseDate: lastPurchase.purchaseDate,
        cadenceSource,
      }
    };
  } else if (urgencyRatio < UNCERTAIN_THRESHOLD) {
    // Approaching restock time, uncertain
    return {
      prune: false,
      confidence: 0.5,
      reason: `Approaching restock time (${daysSinceLastPurchase}/${cadenceDays} days)`,
      context: {
        daysSinceLastPurchase,
        restockCadenceDays: cadenceDays,
        restockUrgencyRatio: urgencyRatio,
        category,
        lastPurchaseDate: lastPurchase.purchaseDate,
        cadenceSource,
      }
    };
  } else {
    // Overdue for restock, keep in cart
    return {
      prune: false,
      confidence: 0.9,
      reason: `Overdue for restock (${daysSinceLastPurchase} days since last purchase)`,
      context: {
        daysSinceLastPurchase,
        restockCadenceDays: cadenceDays,
        restockUrgencyRatio: urgencyRatio,
        category,
        lastPurchaseDate: lastPurchase.purchaseDate,
        cadenceSource,
      }
    };
  }
}
```

### Category Inference

```typescript
function inferCategoryFromName(productName: string): ProductCategory {
  const nameLower = productName.toLowerCase();

  // Laundry keywords
  if (/detergente|amaciador|lixivia/i.test(nameLower)) {
    return ProductCategory.LAUNDRY;
  }

  // Cleaning keywords
  if (/limpeza|desinfetante|esfregona|pano/i.test(nameLower)) {
    return ProductCategory.CLEANING;
  }

  // Paper products
  if (/papel|guardanapo|toalha|lenço/i.test(nameLower)) {
    return ProductCategory.PAPER_PRODUCTS;
  }

  // Personal hygiene
  if (/champô|gel de banho|sabonete|pasta de dentes|desodorizante/i.test(nameLower)) {
    return ProductCategory.PERSONAL_HYGIENE;
  }

  // Beverages
  if (/café|chá|sumo|água|refrigerante/i.test(nameLower)) {
    return ProductCategory.BEVERAGES;
  }

  // Pantry staples
  if (/arroz|massa|azeite|óleo|conserva|enlatado/i.test(nameLower)) {
    return ProductCategory.PANTRY_STAPLES;
  }

  // Dairy
  if (/leite|iogurte|queijo|manteiga/i.test(nameLower)) {
    return ProductCategory.DAIRY;
  }

  // Fresh produce
  if (/fruta|legume|vegetal|hortalica/i.test(nameLower)) {
    return ProductCategory.FRESH_PRODUCE;
  }

  // Meat & fish
  if (/carne|peixe|frango|porco|vaca/i.test(nameLower)) {
    return ProductCategory.MEAT_FISH;
  }

  // Baby care
  if (/bebé|fralda|toalhita|biberão/i.test(nameLower)) {
    return ProductCategory.BABY_CARE;
  }

  // Pet supplies
  if (/ração|comida para|areia de gato/i.test(nameLower)) {
    return ProductCategory.PET_SUPPLIES;
  }

  // Default: unknown
  return ProductCategory.UNKNOWN;
}
```

### Learning Restock Cadences

```typescript
function learnRestockCadence(
  productId: string,
  purchaseHistory: PurchaseRecord[]
): RestockProfile | null {
  // Need at least 2 purchases to learn a cadence
  if (purchaseHistory.length < 2) {
    return null;
  }

  // Sort by date
  const sorted = purchaseHistory.sort((a, b) =>
    a.purchaseDate.getTime() - b.purchaseDate.getTime()
  );

  // Calculate intervals between purchases
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const daysDiff = Math.floor(
      (sorted[i].purchaseDate.getTime() - sorted[i-1].purchaseDate.getTime())
      / (1000 * 60 * 60 * 24)
    );
    intervals.push(daysDiff);
  }

  // Calculate average interval
  const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

  // Calculate standard deviation
  const variance = intervals.reduce((sum, val) =>
    sum + Math.pow(val - avgInterval, 2), 0
  ) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Confidence decreases with high variance
  const coefficientOfVariation = stdDev / avgInterval;
  const confidence = Math.max(0.5, 1.0 - coefficientOfVariation);

  // Infer category from product name
  const category = inferCategoryFromName(sorted[0].productName);

  return {
    productId,
    productName: sorted[0].productName,
    category,
    restockCadenceDays: Math.round(avgInterval),
    confidence,
    lastPurchaseDate: sorted[sorted.length - 1].purchaseDate,
    averageQuantity: purchaseHistory.reduce((sum, p) => sum + p.quantity, 0) / purchaseHistory.length,
    source: 'learned',
  };
}
```

---

## StockPruner Interface

```typescript
interface StockPrunerAgent {
  /**
   * Analyze cart and generate prune suggestions.
   *
   * @param cart - Current cart state
   * @param config - Pruner configuration
   * @param context - Agent runtime context (page, logger, sessionId)
   * @returns StockPruneReport with prune decisions
   */
  analyzeCart(
    cart: CartSnapshot,
    config: StockPrunerConfig,
    context: AgentContext
  ): Promise<StockPruneReport>;

  /**
   * Load purchase history from persistent storage.
   *
   * @param daysBack - Number of days to load history for
   * @returns Array of purchase records
   */
  loadPurchaseHistory(daysBack: number): Promise<PurchaseRecord[]>;

  /**
   * Load restock profiles from persistent storage.
   *
   * @returns Map of productId to RestockProfile
   */
  loadRestockProfiles(): Promise<Record<string, RestockProfile>>;

  /**
   * Learn restock cadences from purchase history.
   * Updates restock profiles in persistent storage.
   *
   * @param purchaseHistory - Historical purchases
   * @returns Updated restock profiles
   */
  learnRestockCadences(
    purchaseHistory: PurchaseRecord[]
  ): Promise<Record<string, RestockProfile>>;

  /**
   * Apply user feedback to improve prune decisions.
   *
   * @param sessionId - Session identifier
   * @param decisions - Original prune decisions
   * @param userFeedback - User accepted/rejected prunes
   */
  applyUserFeedback(
    sessionId: string,
    decisions: PruneDecision[],
    userFeedback: Record<string, boolean>
  ): Promise<void>;
}
```

### StockPrunerConfig

```typescript
interface StockPrunerConfig {
  // Days of purchase history to analyze
  historyDaysBack: number; // default: 90

  // Minimum confidence to suggest pruning
  minPruneConfidence: number; // default: 0.7

  // Whether to use learned cadences or always use category defaults
  useLearnedCadences: boolean; // default: true

  // Conservative mode: only prune items with very high confidence
  conservativeMode: boolean; // default: true

  // Include uncertain items in report (for user review)
  includeUncertainItems: boolean; // default: true
}
```

---

## Integration Points

### Input (from Coordinator)

- `CartSnapshot` - Current cart state from CartBuilder
- `AgentContext` - Runtime context (page, logger, sessionId)
- `StockPrunerConfig` - Configuration options

### Output (to Coordinator)

- `StockPruneReport` - Prune decisions for all cart items
  - `recommendedPrunes` - High-confidence items to remove
  - `uncertainItems` - Items needing user review
  - `decisions` - Full decision log for all items

### Persistence

- **Read**: Purchase history, restock profiles, user overrides
- **Write**: Updated restock profiles (after learning), prune history (for episodic memory)

---

## Example Scenarios

### Scenario 1: Recently Purchased Detergent

**Input:**
- Cart contains "Detergente Líquido Skip 40 Lavagens"
- Last purchased 15 days ago (cadence: 45 days)

**Analysis:**
- Urgency ratio: 15 / 45 = 0.33 (< 0.7 threshold)
- Category: LAUNDRY
- Cadence source: learned (3 previous purchases at 42, 48, 45 day intervals)

**Decision:**
```typescript
{
  prune: true,
  confidence: 0.85,
  reason: "Purchased 15 days ago (typical restock: 45 days)",
  context: {
    daysSinceLastPurchase: 15,
    restockCadenceDays: 45,
    restockUrgencyRatio: 0.33,
    category: ProductCategory.LAUNDRY,
    lastPurchaseDate: new Date('2025-12-27'),
    cadenceSource: 'learned'
  }
}
```

### Scenario 2: Overdue Rice Restock

**Input:**
- Cart contains "Arroz Agulha Tio João 1kg"
- Last purchased 50 days ago (cadence: 37 days)

**Analysis:**
- Urgency ratio: 50 / 37 = 1.35 (> 1.0, overdue)
- Category: PANTRY_STAPLES
- Cadence source: category-default

**Decision:**
```typescript
{
  prune: false,
  confidence: 0.9,
  reason: "Overdue for restock (50 days since last purchase)",
  context: {
    daysSinceLastPurchase: 50,
    restockCadenceDays: 37,
    restockUrgencyRatio: 1.35,
    category: ProductCategory.PANTRY_STAPLES,
    lastPurchaseDate: new Date('2025-11-22'),
    cadenceSource: 'category-default'
  }
}
```

### Scenario 3: No Purchase History

**Input:**
- Cart contains "Amaciador Mimosín 72 Lavagens" (new product)
- No purchase history available

**Analysis:**
- No historical data
- Cannot make pruning decision

**Decision:**
```typescript
{
  prune: false,
  confidence: 0.3,
  reason: "No purchase history available",
  context: {
    restockCadenceDays: 45, // category default
    category: ProductCategory.LAUNDRY,
    cadenceSource: 'no-history'
  }
}
```

---

## Error Handling

| Error | Recoverable | Action |
|-------|-------------|--------|
| Purchase history load failed | Yes | Use empty history, log warning |
| Restock profiles load failed | Yes | Use category defaults, log warning |
| Item matching ambiguous | Yes | Mark as uncertain, keep in cart |
| Invalid date in history | Yes | Skip record, log warning |
| Category inference failed | Yes | Use UNKNOWN category (21-day default) |

---

## Quality Assurance

### Testing Strategy

1. **Unit Tests**: Test category inference, cadence calculation, pruning logic
2. **Integration Tests**: Test with real purchase history data
3. **Accuracy Metrics**:
   - Precision: % of pruned items user agrees with (target: >85%)
   - Recall: % of over-stocked items correctly identified (target: >70%)
   - User satisfaction: Measure time saved vs. items incorrectly pruned

### Validation Criteria

- Pruning decisions must be explainable (clear reason + context)
- Conservative mode: false positives (keeping items) preferred over false negatives (removing needed items)
- Confidence scores must align with decision accuracy (calibration)

---

## Future Enhancements (Phase 3)

1. **Multi-Item Dependency**: Detect items that are always purchased together (e.g., pasta + pasta sauce)
2. **Seasonal Adjustments**: Adjust cadences for seasonal items (e.g., sunscreen in summer)
3. **Quantity Learning**: Suggest quantity adjustments based on consumption patterns
4. **Budget-Aware Pruning**: Prioritize pruning expensive items when household is over budget
5. **Collaborative Filtering**: Learn from similar households' purchase patterns

---

## Implementation Status

| Component | Status | Sprint |
|-----------|--------|--------|
| Research & design | Complete | SP-R-001 |
| Data models | Complete | SP-R-001 |
| Documentation | Complete | SP-R-001 |
| Type definitions | Pending | SP-A-001 |
| Persistence layer | Pending | SP-A-001 |
| Pruning logic | Pending | SP-I-001 |
| Learning algorithms | Pending | SP-I-001 |
| Agent integration | Pending | SP-I-001 |

---

*Last Updated: 2026-01-11*
*Sprint: SP-R-001*
