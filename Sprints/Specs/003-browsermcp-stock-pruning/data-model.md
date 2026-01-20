# Data Model: BrowserMCP Stock Pruning

**Date**: 2026-01-19
**Specification**: `Sprints/Specs/003-browsermcp-stock-pruning/spec.md`
**Version**: 1.0

---

## Overview

This data model defines the entities used in the BrowserMCP Stock Pruning workflow. The model reuses existing types from cart-builder and stock-pruner modules, with minimal new types added for purchase history sync status and pruning report generation.

---

## Entity Definitions

### CartItem

**Purpose**: Represents a product currently in the user's Auchan.pt shopping cart (from cart-builder module)

**Lifecycle**: Created when cart is scanned, exists only in memory during workflow execution

####Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `name` | `string` | Yes | N/A | Non-empty string | Product display name from cart page |
| `quantity` | `number` | Yes | N/A | Positive integer | Number of units in cart |
| `unitPrice` | `number` | No | `undefined` | Positive decimal | Price per unit in EUR |
| `productId` | `string` | No | `undefined` | Auchan SKU format | Auchan product identifier if available |
| `productUrl` | `string` | No | `undefined` | Valid URL | Link to product detail page |
| `available` | `boolean` | No | `true` | Boolean | Whether product is in stock |

#### Example

```json
{
  "name": "Tomate Cherry:250 g",
  "quantity": 2,
  "unitPrice": 1.39,
  "productId": "AUC123456",
  "productUrl": "https://www.auchan.pt/pt/tomate-cherry",
  "available": true
}
```

#### Type Definition

```typescript
interface CartItem {
  name: string;
  quantity: number;
  unitPrice?: number;
  productId?: string;
  productUrl?: string;
  available?: boolean;
}

// From src/agents/cart-builder/types.ts
const CartItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive().optional(),
  productId: z.string().optional(),
  productUrl: z.string().url().optional(),
  available: z.boolean().optional().default(true)
});
```

---

### PurchaseRecord

**Purpose**: Represents a product purchased in a past Auchan.pt order (from stock-pruner module)

**Lifecycle**: Created when order history is synced, stored in purchase-history.json, immutable after creation

#### Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `productName` | `string` | Yes | N/A | Non-empty string | Product name at time of purchase |
| `purchaseDate` | `Date` | Yes | N/A | Valid ISO 8601 date | Order delivery/completion date. **Storage**: ISO 8601 string in JSON. **Runtime**: Zod schema transforms to Date object on read, serializes to string on write. |
| `quantity` | `number` | Yes | N/A | Positive integer | Units purchased |
| `orderId` | `string` | Yes | N/A | Auchan order ID format | Reference to parent order |
| `unitPrice` | `number` | No | `undefined` | Positive decimal | Price paid per unit in EUR |
| `productId` | `string` | No | `undefined` | Auchan SKU format | Product identifier if available |
| `category` | `ProductCategory` | No | `undefined` | One of 14 defined categories | Detected product category |

#### Example

```json
{
  "productName": "Tomate Cherry:250 g",
  "purchaseDate": "2026-01-02T14:00:30.000Z",
  "quantity": 2,
  "orderId": "002915480",
  "unitPrice": 1.39,
  "productId": "AUC123456",
  "category": "fresh-produce"
}
```

#### Type Definition

```typescript
type ProductCategory =
  | 'fresh-produce'
  | 'dairy'
  | 'meat-fish'
  | 'bakery'
  | 'beverages'
  | 'snacks'
  | 'pantry'
  | 'frozen'
  | 'personal-hygiene'
  | 'household-cleaning'
  | 'baby-care'
  | 'pet-supplies'
  | 'health-wellness'
  | 'other';

interface PurchaseRecord {
  productName: string;
  purchaseDate: Date;
  quantity: number;
  orderId: string;
  unitPrice?: number;
  productId?: string;
  category?: ProductCategory;
}

// From src/agents/stock-pruner/types.ts
const PurchaseRecordSchema = z.object({
  productName: z.string().min(1),
  purchaseDate: z.date(),
  quantity: z.number().int().positive(),
  orderId: z.string().min(1),
  unitPrice: z.number().positive().optional(),
  productId: z.string().optional(),
  category: z.enum([...categories]).optional()
});
```

---

### PruneDecision

**Purpose**: Represents the agent's determination about whether to keep or remove a cart item (from stock-pruner module)

**Lifecycle**: Created by heuristics, enhanced by LLM, used to execute removals, logged for audit trail

#### Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `productName` | `string` | Yes | N/A | Non-empty string | Product name being evaluated |
| `prune` | `boolean` | Yes | N/A | Boolean | Whether item should be removed |
| `confidence` | `number` | Yes | N/A | 0-1 decimal | Heuristic confidence in decision |
| `reason` | `string` | Yes | N/A | Non-empty string | Human-readable explanation from heuristics |
| `decision` | `enum` | Yes | Computed | `KEEP`, `REVIEW`, `AUTO_REMOVE` | Classification based on confidence: <0.6=KEEP, 0.6-0.8=REVIEW, >0.8=AUTO_REMOVE |
| `productId` | `string` | No | `undefined` | Auchan SKU format | Product identifier if available |
| `context` | `object` | Yes | N/A | Valid context structure | Detailed heuristic context (cadence, urgency, category) |
| `llmReasoning` | `string` | No | `undefined` | Non-empty string | Enhanced explanation from LLM |
| `llmConfidenceAdjustment` | `number` | No | `undefined` | -1 to 1 decimal | LLM's confidence adjustment from heuristic baseline |
| `wasLLMEnhanced` | `boolean` | Yes | `false` | Boolean | Whether LLM validated this decision |

#### Context Subfield

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| `daysSinceLastPurchase` | `number` | No | Days since this item was last purchased |
| `restockCadenceDays` | `number` | Yes | Typical repurchase interval in days |
| `restockUrgencyRatio` | `number` | No | daysSince / cadence (0-1+) |
| `category` | `ProductCategory` | Yes | Detected product category |
| `lastPurchaseDate` | `Date` | No | Date of last purchase |
| `cadenceSource` | `enum` | Yes | `learned`, `category-default`, `user-override`, `no-history` |

#### Example

```json
{
  "productName": "Tomate Cherry:250 g",
  "prune": false,
  "confidence": 0.85,
  "reason": "Last purchased 8 days ago, typical 14-day cadence, urgency ratio 0.57",
  "decision": "KEEP",
  "productId": "AUC123456",
  "context": {
    "daysSinceLastPurchase": 8,
    "restockCadenceDays": 14,
    "restockUrgencyRatio": 0.57,
    "category": "fresh-produce",
    "lastPurchaseDate": "2026-01-11T00:00:00.000Z",
    "cadenceSource": "learned"
  },
  "llmReasoning": "Fresh produce with short cadence. Household typically shops weekly. Keep.",
  "llmConfidenceAdjustment": 0.10,
  "wasLLMEnhanced": true
}
```

#### Type Definition

```typescript
interface PruneDecision {
  productName: string;
  prune: boolean;
  confidence: number;
  reason: string;
  decision: 'KEEP' | 'REVIEW' | 'AUTO_REMOVE';
  productId?: string;
  context: {
    daysSinceLastPurchase?: number;
    restockCadenceDays: number;
    restockUrgencyRatio?: number;
    category: ProductCategory;
    lastPurchaseDate?: Date;
    cadenceSource: 'learned' | 'category-default' | 'user-override' | 'no-history';
  };
  llmReasoning?: string;
  llmConfidenceAdjustment?: number;
  wasLLMEnhanced: boolean;
}

const PruneDecisionSchema = z.object({
  productName: z.string().min(1),
  prune: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  decision: z.enum(['KEEP', 'REVIEW', 'AUTO_REMOVE']),
  productId: z.string().optional(),
  context: z.object({
    daysSinceLastPurchase: z.number().int().nonnegative().optional(),
    restockCadenceDays: z.number().int().positive(),
    restockUrgencyRatio: z.number().nonnegative().optional(),
    category: z.enum([...categories]),
    lastPurchaseDate: z.date().optional(),
    cadenceSource: z.enum(['learned', 'category-default', 'user-override', 'no-history'])
  }),
  llmReasoning: z.string().min(1).optional(),
  llmConfidenceAdjustment: z.number().min(-1).max(1).optional(),
  wasLLMEnhanced: z.boolean()
});
```

---

### PurchaseHistorySyncStatus

**Purpose**: Tracks metadata about the most recent order history extraction (new entity for this feature)

**Lifecycle**: Created on first sync, updated after each incremental sync, stored in purchase-history.json metadata

#### Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `lastSyncTimestamp` | `Date` | Yes | N/A | Valid ISO 8601 datetime | When extraction last ran |
| `ordersCaptured` | `number` | Yes | N/A | Non-negative integer | Total orders in history file |
| `recordCount` | `number` | Yes | N/A | Non-negative integer | Total product records |
| `lastOrderDate` | `Date` | No | `undefined` | Valid ISO 8601 date | Most recent order in history |

#### Example

```json
{
  "lastSyncTimestamp": "2026-01-19T10:30:00.000Z",
  "ordersCaptured": 47,
  "recordCount": 2147,
  "lastOrderDate": "2026-01-15T00:00:00.000Z"
}
```

#### Type Definition

```typescript
interface PurchaseHistorySyncStatus {
  lastSyncTimestamp: Date;
  ordersCaptured: number;
  recordCount: number;
  lastOrderDate?: Date;
}

const PurchaseHistorySyncStatusSchema = z.object({
  lastSyncTimestamp: z.date(),
  ordersCaptured: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  lastOrderDate: z.date().optional()
});
```

---

### PruningReport

**Purpose**: JSON output containing all pruning decisions and final cart state (new entity for this feature)

**Lifecycle**: Generated after pruning execution, saved to runs/ directory, consumed by user or chat interface

#### Fields

| Field Name | Type | Required | Default | Validation Rules | Description |
|------------|------|----------|---------|------------------|-------------|
| `timestamp` | `Date` | Yes | N/A | Valid ISO 8601 datetime | When pruning was executed |
| `initialCartCount` | `number` | Yes | N/A | Non-negative integer | Items in cart before pruning |
| `finalCartCount` | `number` | Yes | N/A | Non-negative integer | Items in cart after pruning |
| `autoRemoved` | `PruneDecision[]` | Yes | `[]` | Array | Items removed with high confidence |
| `reviewRequired` | `PruneDecision[]` | Yes | `[]` | Array | Items needing user decision |
| `kept` | `PruneDecision[]` | Yes | `[]` | Array | Items kept in cart |
| `syncStatus` | `PurchaseHistorySyncStatus` | Yes | N/A | Valid sync status | Purchase history sync metadata |

#### Example

```json
{
  "timestamp": "2026-01-19T10:45:00.000Z",
  "initialCartCount": 77,
  "finalCartCount": 45,
  "autoRemoved": [
    {
      "productName": "Shower Gel:500ml",
      "prune": true,
      "confidence": 0.92,
      "reason": "Bought 8 days ago, 45-day cadence, urgency 0.18",
      "decision": "AUTO_REMOVE",
      "wasLLMEnhanced": true,
      "llmReasoning": "Personal hygiene product with long cadence. Recently purchased. Remove."
    }
  ],
  "reviewRequired": [
    {
      "productName": "Olive Oil:1L",
      "prune": true,
      "confidence": 0.72,
      "reason": "Bought 30 days ago, 45-day cadence, urgency 0.67",
      "decision": "REVIEW",
      "wasLLMEnhanced": true,
      "llmReasoning": "Midway through restock cycle. Consider current stock at home."
    }
  ],
  "kept": [
    {
      "productName": "Milk:1L",
      "prune": false,
      "confidence": 0.95,
      "reason": "Overdue - bought 8 days ago, 7-day cadence, urgency 1.14",
      "decision": "KEEP",
      "wasLLMEnhanced": false
    }
  ],
  "syncStatus": {
    "lastSyncTimestamp": "2026-01-19T10:30:00.000Z",
    "ordersCaptured": 47,
    "recordCount": 2147,
    "lastOrderDate": "2026-01-15T00:00:00.000Z"
  }
}
```

#### Type Definition

```typescript
interface PruningReport {
  timestamp: Date;
  initialCartCount: number;
  finalCartCount: number;
  autoRemoved: PruneDecision[];
  reviewRequired: PruneDecision[];
  kept: PruneDecision[];
  syncStatus: PurchaseHistorySyncStatus;
}

const PruningReportSchema = z.object({
  timestamp: z.date(),
  initialCartCount: z.number().int().nonnegative(),
  finalCartCount: z.number().int().nonnegative(),
  autoRemoved: z.array(PruneDecisionSchema),
  reviewRequired: z.array(PruneDecisionSchema),
  kept: z.array(PruneDecisionSchema),
  syncStatus: PurchaseHistorySyncStatusSchema
});
```

---

## Relationships

### One-to-Many

| Parent Entity | Child Entity | Relationship | Cascade Behavior |
|---------------|--------------|--------------|------------------|
| Order (Auchan.pt) | PurchaseRecord | One order contains many products | N/A (read-only from Auchan) |
| PruningReport | PruneDecision | One report contains decisions for all cart items | Decisions are embedded in report JSON |

**Example**: An Auchan order with ID "002915480" has 37 products. When synced, 37 PurchaseRecord entities are created, each referencing orderId "002915480".

### Many-to-Many

None - this feature does not create many-to-many relationships.

### One-to-One

| Entity A | Entity B | Relationship | Enforcement |
|----------|----------|--------------|-------------|
| purchase-history.json | PurchaseHistorySyncStatus | File has one sync status metadata object | Stored in same JSON file |

---

## State Transitions

### PruneDecision State Machine

```
[Heuristic Baseline] --LLM Validation--> [LLM Enhanced]
        |                                      |
        +-------(confidence-based)------------+
        |                                      |
        v                                      v
    [Classification]                    [Classification]
        |                                      |
        +---------> KEEP (<0.6)                |
        +---------> REVIEW (0.6-0.8) <---------+
        +---------> AUTO_REMOVE (>0.8)

AUTO_REMOVE --> [Executed] --> Removed from cart
REVIEW --> [User Decision] --> Removed or Kept
KEEP --> [No Action] --> Remains in cart
```

#### States

| State | Description | Valid Transitions | Entry Actions | Exit Actions |
|-------|-------------|-------------------|---------------|--------------|
| `Heuristic Baseline` | Initial decision from heuristics | → LLM Enhanced | Calculate confidence, cadence, urgency | None |
| `LLM Enhanced` | Validated by LLM | → Classification | Add llmReasoning, adjust confidence | None |
| `Classification` | Assigned to bucket | → KEEP, REVIEW, AUTO_REMOVE | Map confidence to decision enum | None |
| `KEEP` | High confidence to keep | None (terminal) | Add to kept array | None |
| `REVIEW` | Uncertain, needs user input | → Removed, Kept | Add to reviewRequired array | None |
| `AUTO_REMOVE` | High confidence to prune | → Executed | Add to autoRemoved array | None |
| `Executed` | Removed from cart | None (terminal) | Remove item via BrowserMCP | Log removal |

#### Transition Rules

**Heuristic Baseline → LLM Enhanced**:
- **Trigger**: Decision confidence is <threshold OR decision is prune=true
- **Conditions**: LLM is available (dev or prod mode)
- **Actions**: Call LLMEnhancer.enhance(), receive llmReasoning and adjustment
- **Validation**: LLM confidence must be 0-1

**Classification → AUTO_REMOVE**:
- **Trigger**: Final confidence (after LLM adjustment) > 0.8
- **Conditions**: prune=true
- **Actions**: Add to autoRemoved array
- **Validation**: Must have reasoning (heuristic + optional LLM)

**AUTO_REMOVE → Executed**:
- **Trigger**: User runs pruning (no intermediate approval)
- **Conditions**: BrowserMCP cart access available
- **Actions**: Locate item row, click remove button, verify removal
- **Validation**: Cart count decreases by 1

---

## Business Rules

### Validation Rules

1. **Confidence Range**: All confidence values must be between 0 and 1
   - **Applies to**: PruneDecision.confidence, llmConfidenceAdjustment
   - **Enforcement**: Zod schema validation at runtime
   - **Error Message**: "Confidence must be between 0 and 1"

2. **Decision Enum Mapping**: decision field must match confidence thresholds
   - **Applies to**: PruneDecision.decision
   - **Enforcement**: Application logic (computed from confidence)
   - **Error Message**: N/A (computed, not user-provided)

3. **Unique Order Records**: Each (orderId + productName) pair appears only once in purchase history
   - **Applies to**: PurchaseRecord
   - **Enforcement**: Application logic during JSON merge
   - **Error Message**: "Duplicate record found for order {orderId}, product {productName}"

4. **Non-negative Quantities**: quantity fields cannot be negative
   - **Applies to**: CartItem.quantity, PurchaseRecord.quantity
   - **Enforcement**: Zod schema validation
   - **Error Message**: "Quantity must be a positive integer"

5. **Valid ISO Dates**: All date fields must be valid ISO 8601 format
   - **Applies to**: PurchaseRecord.purchaseDate, PurchaseHistorySyncStatus.lastSyncTimestamp
   - **Enforcement**: Zod schema validation
   - **Error Message**: "Invalid date format"

### Computed Fields

| Field | Formula | When Computed | Cached? |
|-------|---------|---------------|---------|
| `decision` | if conf <0.6: KEEP, elif conf <0.8: REVIEW, else: AUTO_REMOVE | After LLM enhancement | No (computed on read) |
| `restockUrgencyRatio` | daysSinceLastPurchase / restockCadenceDays | During heuristic analysis | Yes (stored in context) |

### Invariants

- **Cart counts must balance**: `finalCartCount = initialCartCount - autoRemoved.length - reviewRemoved.length`
- **LLM enhancement flag accuracy**: if `wasLLMEnhanced=true`, then `llmReasoning` must be present
- **Purchase history ordering**: Records are stored sorted by purchaseDate descending (most recent first)

---

## Storage & Indexing

### Primary Storage

- **Type**: File System (JSON)
- **Location**:
  - Purchase history: `data/memory/household-demo/purchase-history.json`
  - Pruning reports: `runs/{ISO-timestamp}/pruning-report.json`
- **Persistence**: Durable (written to disk)

### File Structure

**purchase-history.json**:
```json
{
  "syncStatus": {
    "lastSyncTimestamp": "2026-01-19T10:30:00.000Z",
    "ordersCaptured": 47,
    "recordCount": 2147,
    "lastOrderDate": "2026-01-15T00:00:00.000Z"
  },
  "records": [
    {...},
    {...}
  ]
}
```

### Indexes

No database indexes (JSON file storage). In-memory access patterns:

**Query Pattern 1: Find purchases by product name**
```typescript
const matches = records.filter(r =>
  normalizeProductName(r.productName) === normalizeProductName(searchName)
);
// O(n) scan, optimized with Map<normalizedName, PurchaseRecord[]> cache
```

**Query Pattern 2: Find purchases since date**
```typescript
const recent = records.filter(r => r.purchaseDate >= sinceDate);
// O(n) scan, acceptable for 2000+ records (< 10ms)
```

### Sharding Strategy

N/A - Single-file storage sufficient for current scale (< 10k records expected).

---

## Performance Considerations

### Data Volume

- **Expected Size**: 2000-5000 purchase records per household
- **Growth Rate**: ~100 records/month (2-3 orders/week, 10-20 items/order)
- **Retention Policy**: Indefinite (historical data improves pruning accuracy)

### Access Patterns

| Operation | Frequency | Latency Target | Optimization |
|-----------|-----------|----------------|--------------|
| Load purchase history | 1x per prune run | < 100ms | Read full file, in-memory cache |
| Match cart items to history | 77 items per prune | < 500ms | Build Map index on load |
| Sync new orders | 1x per prune run | < 30s | Incremental (only new orders) |
| Generate pruning report | 1x per prune run | < 1s | JSON.stringify |

### Caching Strategy

- **Cache Type**: In-memory (within Node.js process)
- **Cached Entities**:
  - Purchase history records as `Map<normalizedProductName, PurchaseRecord[]>`
  - Product analytics from LLMEnhancer (after buildAnalytics call)
- **TTL**: Process lifetime (workflow execution)
- **Invalidation**: On next workflow run

---

## Migration Strategy

### From Current State

**Current Schema** (existing):
```typescript
interface PurchaseRecord {
  productName: string;
  purchaseDate: Date;
  quantity: number;
  orderId: string;
  unitPrice?: number;
  productId?: string;
  category?: ProductCategory;
}
```

**New Schema** (added sync status):
```typescript
interface PurchaseHistoryFile {
  syncStatus: PurchaseHistorySyncStatus;
  records: PurchaseRecord[];
}
```

### Migration Steps

1. **Add syncStatus field**:
   - Backfill: If missing, create with lastSyncTimestamp = earliest record date, ordersCaptured = unique order IDs count
   - No SQL (JSON file)
   - Backward compatible: Old code can still read records array

2. **Normalize product names in index**:
   - Backfill: Build Map<normalizedName, Record[]> on first load
   - No persistence needed (computed index)

### Rollback Plan

If migration fails:
- Restore purchase-history.json from backup (auto-created before sync)
- Remove syncStatus field (optional - doesn't break old code)

---

## Security & Privacy

### Sensitive Data

| Field | Sensitivity Level | Encryption | Access Control |
|-------|-------------------|------------|----------------|
| `productName` | Low (shopping habits) | None | Local filesystem only |
| `purchaseDate` | Low | None | Local filesystem only |
| `unitPrice` | Low | None | Local filesystem only |
| `orderId` | Medium (Auchan internal ID) | None | Local filesystem only |

### PII Handling

- **PII Fields**: None (product names are not PII)
- **Retention**: Indefinite (improves pruning accuracy)
- **Anonymization**: Not required (no personal identifiers)
- **Deletion**: User can delete `data/memory/household-demo/` directory

**Note**: This is a local-first system. All data stays on user's machine. No cloud sync.

---

## Example Usage

### Scenario 1: Pruning Workflow

```typescript
// 1. Load purchase history
const historyFile = await readJSON('data/memory/household-demo/purchase-history.json');
const history: PurchaseRecord[] = historyFile.records;
const syncStatus: PurchaseHistorySyncStatus = historyFile.syncStatus;

// 2. Check if sync needed (>24 hours old)
const needsSync = (new Date().getTime() - syncStatus.lastSyncTimestamp.getTime()) > 24 * 60 * 60 * 1000;
if (needsSync) {
  const newRecords = await syncPurchaseHistory(syncStatus.lastOrderDate);
  history.push(...newRecords);
  historyFile.syncStatus.lastSyncTimestamp = new Date();
  historyFile.syncStatus.recordCount += newRecords.length;
  await writeJSON('data/memory/household-demo/purchase-history.json', historyFile);
}

// 3. Scan cart via BrowserMCP
const cartSnapshot = await scanCartTool.execute(page);
const cartItems: CartItem[] = cartSnapshot.items;

// 4. Run heuristics
import { processCartItems } from './src/agents/stock-pruner/heuristics.js';
const heuristicDecisions = processCartItems(cartItems, history, config);

// 5. LLM enhancement
import { LLMEnhancer } from './src/agents/stock-pruner/llm-enhancer.js';
const enhancer = new LLMEnhancer({ apiKey: process.env.ANTHROPIC_API_KEY });
enhancer.buildAnalytics(history);
const enhancedResult = await enhancer.enhance(heuristicDecisions);

// 6. Classify decisions
const autoRemoved = enhancedResult.decisions.filter(d => d.decision === 'AUTO_REMOVE');
const reviewRequired = enhancedResult.decisions.filter(d => d.decision === 'REVIEW');
const kept = enhancedResult.decisions.filter(d => d.decision === 'KEEP');

// 7. Execute removals
for (const decision of autoRemoved) {
  await removeCartItem(page, decision.productName);
}

// 8. Generate report
const report: PruningReport = {
  timestamp: new Date(),
  initialCartCount: cartItems.length,
  finalCartCount: cartItems.length - autoRemoved.length,
  autoRemoved,
  reviewRequired,
  kept,
  syncStatus: historyFile.syncStatus
};

await writeJSON(`runs/${new Date().toISOString()}/pruning-report.json`, report);
```

---

## Notes

**Product Name Normalization**: Use `normalizeProductName()` from `src/agents/stock-pruner/analytics/engine.ts` to handle variations like "Tomate Cherry:250 g" vs "tomate cherry 250g".

**Category Detection**: Heuristics automatically detect categories via keyword matching. No manual categorization needed.

**LLM Mode**: For development, Claude Code (this conversation) acts as the LLM. For production, llm-enhancer.ts invokes Anthropic API.

**Backward Compatibility**: All new types (PurchaseHistorySyncStatus, PruningReport) are additive. Existing code continues to work.
