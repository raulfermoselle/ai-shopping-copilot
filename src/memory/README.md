# Persistent Memory Layer

The persistent memory layer provides durable storage for the AI Shopping Copilot to learn from history, recognize patterns, and make informed decisions across sessions.

## Architecture

### Data Stores

| Store | Purpose | File |
|-------|---------|------|
| **Household Preferences** | Dietary restrictions, allergies, brand preferences, budget constraints | `household-preferences.json` |
| **Item Signals** | Purchase history, frequency, typical quantity/price per item | `item-signals.json` |
| **Substitution History** | Accepted/rejected substitutions, brand tolerance, price tolerance | `substitution-history.json` |
| **Cadence Signals** | Learned restock intervals (category & item level) | `cadence-signals.json` |
| **Episodic Memory** | Run summaries, outcomes, errors, performance metrics | `episodic-memory.json` |

### File Structure

```
data/memory/
  {householdId}/
    household-preferences.json
    item-signals.json
    substitution-history.json
    cadence-signals.json
    episodic-memory.json
```

## Usage

### Quick Start

```typescript
import { MemoryManager } from './memory';

// Initialize memory manager for a household
const memory = new MemoryManager({
  householdId: 'household-123',
  autoLoad: true, // Auto-load stores on first access
});

// Load complete household context (for agent use)
const context = await memory.loadHouseholdContext();

console.log(`Recent items: ${context.recentItems.length}`);
console.log(`Frequent items: ${context.frequentItems.length}`);
console.log(`Substitution acceptance rate: ${context.substitutionInsights.acceptanceRate}`);
```

### Import Purchase History

```typescript
// Import past orders from Auchan
await memory.importPurchaseHistory([
  {
    orderId: 'ORD-001',
    date: '2025-12-15T10:00:00Z',
    items: [
      {
        item: {
          sku: 'SKU-123',
          name: 'Leite Mimosa 1L',
          barcode: '1234567890123',
          category: 'Laticínios',
        },
        quantity: 2,
        price: 0.89,
      },
      // ... more items
    ],
  },
  // ... more orders
]);
```

### Record Substitutions

```typescript
// Record a substitution outcome
await memory.recordSubstitution(
  { name: 'Leite Mimosa 1L', sku: 'SKU-123' },
  { name: 'Leite Agros 1L', sku: 'SKU-456' },
  {
    reason: 'out-of-stock',
    originalPrice: 0.89,
    substitutePrice: 0.92,
    outcome: 'accepted',
    userFeedback: 'Good substitute',
    runId: 'run-001',
  }
);
```

### Track Coordinator Runs

```typescript
// Start a run
await memory.startRun('run-001', 'v1.0.0');

// Update episodic memory with actions
const episodicMemory = await memory.getEpisodicMemory();
await episodicMemory.addAction('run-001', {
  item: { name: 'Leite Mimosa 1L' },
  action: 'added',
  reason: 'frequent-purchase',
});

// Complete the run
await memory.completeRun('run-001', 'success', 'complete');
```

### Working with Individual Stores

```typescript
// Household preferences
const prefs = await memory.getHouseholdPreferences();
await prefs.addDietaryRestriction('vegan');
await prefs.addAllergy({ allergen: 'peanuts', severity: 'severe' });
await prefs.setBrandPreference('Continente', 'preferred', 'Good quality');

// Item signals
const items = await memory.getItemSignals();
const signal = await items.findExactSignal({ name: 'Leite Mimosa 1L' });
console.log(`Average quantity: ${signal?.averageQuantity}`);
console.log(`Purchase frequency: ${signal?.purchaseFrequency} per month`);

// Substitution history
const subs = await memory.getSubstitutionHistory();
const patterns = await subs.getSubstitutionPatterns();
const priceTolerance = await subs.getPriceDeltaTolerance();

// Cadence signals
const cadence = await memory.getCadenceSignals();
const effective = await cadence.getEffectiveCadence({ name: 'Leite Mimosa 1L' });
console.log(`Typical restock: every ${effective.typicalRestockDays} days`);

// Episodic memory
const episodic = await memory.getEpisodicMemory();
const stats = await episodic.getStatistics(30); // Last 30 days
console.log(`Success rate: ${stats.successRate * 100}%`);
```

## Design Principles

### Durability First

- All writes use atomic temp-file-then-rename pattern
- Backup files created before overwrite
- ACID guarantees through file system operations
- No data loss on crash during write

### Human-Readable JSON

- All data stored as pretty-printed JSON
- Easy to inspect, debug, and manually edit if needed
- Version field for schema migration

### Traceability

- Every record includes timestamps
- Source attribution (order ID, run ID, agent version)
- Audit trail for all mutations

### Performance

- Lazy loading (stores load on first access)
- In-memory caching after load
- Atomic writes minimize I/O
- Indexes and sorted arrays for common queries

## Item Matching

The Item Signals store includes fuzzy matching to recognize the same product across variations:

```typescript
// Find exact match (SKU, barcode, or exact name)
const exact = await items.findExactSignal({ name: 'Leite Mimosa 1L' });

// Find similar items (fuzzy matching)
const similar = await items.findSimilarSignals(
  { name: 'Leite Mimosa Semi-Desnatado 1L' },
  0.7 // 70% similarity threshold
);

for (const match of similar) {
  console.log(`${match.signal.item.name}: ${match.similarity * 100}% match`);
}
```

### Matching Strategy

1. **Exact SKU** (100% confidence)
2. **Exact Barcode** (100% confidence)
3. **Exact Name** (case-insensitive, 100% confidence)
4. **Fuzzy Name** (string similarity, 0-100% confidence)
5. **Category + Price** (heuristic, 0-80% confidence)

## Data Cleanup

```typescript
// Remove old data to keep files manageable
await memory.cleanup({
  keepItemPurchases: 50, // Keep last 50 purchases per item
  keepSubstitutionDays: 365, // Keep 1 year of substitution history
  keepEpisodicDays: 180, // Keep 6 months of run history
});
```

## Statistics & Insights

```typescript
// Overall statistics
const stats = await memory.getOverallStatistics();

console.log(`Items tracked: ${stats.items.totalTracked}`);
console.log(`Recent items (30d): ${stats.items.recentItems}`);
console.log(`High-confidence cadence: ${stats.items.highConfidenceCadence}`);
console.log(`Total substitutions: ${stats.substitutions.total}`);
console.log(`Substitution acceptance rate: ${stats.substitutions.acceptanceRate * 100}%`);
console.log(`Total runs: ${stats.runs.total}`);
console.log(`Run success rate: ${stats.runs.successRate * 100}%`);
console.log(`Avg run duration: ${stats.runs.avgDurationMs}ms`);

// Learning insights from episodic memory
const episodic = await memory.getEpisodicMemory();
const insights = await episodic.getLearningInsights(30);

console.log(`Avg cart size: ${insights.avgCartSize} items`);
console.log(`Avg cart total: €${insights.avgCartTotal.toFixed(2)}`);
console.log(`Most common time slots: ${insights.mostCommonSlotTimes.join(', ')}`);
console.log(`User approval rate: ${insights.userApprovalRate * 100}%`);
```

## Error Handling

All stores throw descriptive errors:

```typescript
try {
  const prefs = await memory.getHouseholdPreferences();
  await prefs.load();
} catch (error) {
  if (error.message.includes('Invalid store data')) {
    // Schema validation failed
    console.error('Data corruption detected:', error);
  } else if (error.message.includes('ENOENT')) {
    // File doesn't exist (normal for first run)
    console.log('Creating new store');
  } else {
    // Other error
    throw error;
  }
}
```

## Schema Evolution

Stores include version fields for migration:

```typescript
// Current schema version
import { MEMORY_SCHEMA_VERSION } from './memory';

// Custom migration logic (override in BaseStore subclass)
protected async migrate(data: MyStoreType): Promise<MyStoreType> {
  if (data.version === '1.0.0') {
    // Migrate from 1.0.0 to 1.1.0
    data = migrateV1ToV2(data);
  }

  data.version = MEMORY_SCHEMA_VERSION;
  return data;
}
```

## Integration with Agents

### CartBuilder

```typescript
const context = await memory.loadHouseholdContext();

// Use frequent items to seed cart
for (const item of context.frequentItems) {
  if (shouldReorder(item)) {
    await cartBuilder.addItem(item.item, item.averageQuantity);
  }
}
```

### StockPruner

```typescript
const cadence = await memory.getCadenceSignals();

for (const cartItem of cart) {
  const daysSincePurchase = getDaysSinceLastPurchase(cartItem);
  const isDue = await cadence.isDueForRestock(cartItem, daysSincePurchase);

  if (!isDue) {
    await pruner.removeItem(cartItem, 'recently-purchased');
  }
}
```

### Substitution Agent

```typescript
const subs = await memory.getSubstitutionHistory();

const patterns = await subs.getSubstitutionPatterns();
const priceTolerance = await subs.getPriceDeltaTolerance();

// Check if substitution was accepted before
const wasAccepted = await subs.hasBeenAcceptedBefore(originalItem, substituteItem);

if (wasAccepted) {
  // Auto-approve this substitution
  await substitutor.autoApprove(substituteItem);
}
```

### Coordinator

```typescript
const runId = generateRunId();

// Start run
await memory.startRun(runId, AGENT_VERSION);

try {
  // Execute phases...

  // Complete run
  await memory.completeRun(runId, 'success', 'complete');
} catch (error) {
  await memory.completeRun(runId, 'error', currentPhase);

  const episodic = await memory.getEpisodicMemory();
  await episodic.addError(runId, currentPhase, error.message);
}
```

## Testing

```typescript
import { MemoryManager } from './memory';
import path from 'path';
import os from 'os';

// Use temp directory for tests
const testDir = path.join(os.tmpdir(), 'memory-test');

const memory = new MemoryManager({
  householdId: 'test-household',
  dataDir: testDir,
  autoLoad: true,
});

// Clean up after tests
await memory.cleanup();
```

## File Format Examples

### household-preferences.json

```json
{
  "version": "1.0.0",
  "householdId": "household-123",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-12T00:00:00Z",
  "dietaryRestrictions": ["vegan"],
  "allergies": [
    {
      "allergen": "peanuts",
      "severity": "severe",
      "notes": "Anaphylaxis risk"
    }
  ],
  "brandPreferences": [
    {
      "brand": "Continente",
      "preference": "preferred",
      "reason": "Good quality",
      "updatedAt": "2025-01-10T00:00:00Z"
    }
  ]
}
```

### item-signals.json

```json
{
  "version": "1.0.0",
  "householdId": "household-123",
  "updatedAt": "2025-01-12T00:00:00Z",
  "signals": [
    {
      "item": {
        "sku": "SKU-123",
        "name": "Leite Mimosa 1L",
        "barcode": "1234567890123",
        "category": "Laticínios"
      },
      "purchaseHistory": [
        {
          "date": "2025-01-10T00:00:00Z",
          "quantity": 2,
          "price": 0.89,
          "orderId": "ORD-001"
        }
      ],
      "averageQuantity": 2,
      "typicalPrice": 0.89,
      "purchaseFrequency": 4.5,
      "lastPurchasedAt": "2025-01-10T00:00:00Z",
      "updatedAt": "2025-01-10T00:00:00Z"
    }
  ]
}
```

## License

Part of AI Shopping Copilot - Internal use only.
