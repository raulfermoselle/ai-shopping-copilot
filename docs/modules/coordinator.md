# Coordinator Module

**Module ID:** COORD
**Type:** Orchestrator Agent
**Status:** Implementation Complete (Sprint-CB-I-001)

---

## Overview

The Coordinator agent is the central orchestrator for shopping cart preparation sessions. It manages the complete session lifecycle, delegates work to specialized worker agents, aggregates results, and generates a Review Pack for user approval.

### Safety Constraint

**CRITICAL:** The Coordinator NEVER auto-purchases or submits orders. It stops at the `review_ready` state and waits for explicit user approval via the Control Panel UI.

### Phase 1 Scope

- Session lifecycle management
- CartBuilder worker delegation
- Review Pack generation
- Error handling and session cancellation

### Phase 2+ Extensions (Reserved)

- Substitution worker delegation (find replacements for unavailable items)
- StockPruner worker delegation (remove recently-purchased items)
- SlotScout worker delegation (collect delivery slot options)

---

## Architecture Overview

```
Control Panel UI
       |
       v
+------------------+
|   Coordinator    |  <-- Central orchestrator
+------------------+
       |
       v
+------------------+     Phase 2+
|   CartBuilder    |     +---------------+
|    (Worker)      |     | Substitution  |
+------------------+     | StockPruner   |
       |                 | SlotScout     |
       v                 +---------------+
+------------------+
|   Review Pack    |  --> User Approval
+------------------+
```

### Component Roles

| Component | Role | Phase |
|-----------|------|-------|
| **Coordinator** | Orchestrates session lifecycle, delegates to workers, generates Review Pack | 1 |
| **CartBuilder** | Loads/merges orders, populates cart | 1 |
| **Substitution** | Finds replacements for unavailable items | 2 |
| **StockPruner** | Removes recently-purchased items | 2 |
| **SlotScout** | Collects delivery slot options | 2 |

---

## Session Lifecycle

### State Machine

```
                                HAPPY PATH
  +---------------+     +----------------+     +--------------+
  | initializing  | --> | authenticating | --> | loading_cart |
  +---------------+     +----------------+     +--------------+
         |                     |                      |
         |                     |                      v
         |                     |              +------------------+
         |                     |              | generating_review|
         |                     |              +------------------+
         |                     |                      |
         v                     v                      v
  +---------------+     +---------------+     +--------------+
  |   cancelled   | <-- |   cancelled   | <-- | review_ready |
  +---------------+     +---------------+     +--------------+
                                                     |
         ERROR FLOWS (any state can transition      |
         to cancelled on fatal error)               v
                                              +-----------+
                                              | completed |
                                              +-----------+
```

### State Descriptions

| State | Description | Next States |
|-------|-------------|-------------|
| `initializing` | Loading config, creating session, setting up context | `authenticating`, `cancelled` |
| `authenticating` | Verifying/performing login (Phase 1: assumes logged in) | `loading_cart`, `cancelled` |
| `loading_cart` | Delegating to CartBuilder, waiting for cart population | `generating_review`, `cancelled` |
| `generating_review` | Transforming CartDiffReport into ReviewPack | `review_ready`, `cancelled` |
| `review_ready` | ReviewPack ready for user inspection | `completed`, `cancelled` |
| `completed` | User approved/rejected cart | (terminal) |
| `cancelled` | Session cancelled due to error or user request | (terminal) |

### Key Types

```typescript
// Session state enum
type SessionStatus =
  | 'initializing'
  | 'authenticating'
  | 'loading_cart'
  | 'generating_review'
  | 'review_ready'
  | 'cancelled'
  | 'completed';

// Full session object
interface CoordinatorSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  username: string;
  householdId: string;
  status: SessionStatus;
  workers: WorkerResults;
  reviewPack: ReviewPack | null;
  errors: CoordinatorError[];
  screenshots: string[];
}
```

---

## Worker Delegation Pattern

### CoordinatorContext

The Coordinator passes context to workers containing shared resources and session state:

```typescript
interface CoordinatorContext {
  session: CoordinatorSession;  // Current session state
  config: CoordinatorConfig;    // Session configuration
}
```

Workers receive an `AgentContext` with:
- `page`: Playwright Page instance
- `logger`: Structured logger
- `sessionId`: Session identifier

### CartBuilder Delegation (Phase 1)

The delegation flow:

```
1. Create CartBuilder config
   └── createCartBuilderConfig(coordinatorConfig)

2. Instantiate CartBuilder
   └── new CartBuilder(cartBuilderConfig)

3. Execute worker
   └── cartBuilder.run(agentContext)

4. Aggregate result
   └── session.workers.cartBuilder = workerResult

5. Collect artifacts
   └── session.screenshots.push(...report.screenshots)
```

#### Configuration Mapping

```typescript
function createCartBuilderConfig(config: CoordinatorConfig): CartBuilderConfig {
  return {
    maxOrdersToLoad: config.maxOrdersToLoad,
    includeFavorites: config.includeFavorites,
    mergeStrategy: config.mergeStrategy === 'most_frequent'
      ? 'most-frequent'
      : config.mergeStrategy,
    clearExistingCart: config.clearExistingCart,
  };
}
```

### Worker Result Storage

```typescript
interface WorkerResults {
  cartBuilder: CartBuilderWorkerResult | null;
  substitution: SubstitutionWorkerResult | null;  // Phase 2
  stockPruner: StockPrunerWorkerResult | null;    // Phase 2
  slotScout: SlotScoutWorkerResult | null;        // Phase 2
}

interface CartBuilderWorkerResult {
  success: boolean;
  durationMs: number;
  report?: CartDiffReport;       // Present if success
  errorMessage?: string;         // Present if failure
}
```

### Phase 2 Extension Points

The type system reserves extension points for future workers:

| Worker | Config Flag | Result Type |
|--------|-------------|-------------|
| Substitution | `enableSubstitution` | `SubstitutionWorkerResult` |
| StockPruner | `enableStockPruning` | `StockPrunerWorkerResult` |
| SlotScout | `enableSlotScouting` | `SlotScoutWorkerResult` |

---

## Review Pack Generation

### Data Flow

```
CartBuilder
     |
     v
CartDiffReport
     |
     +--> cart.before/after     --> ReviewCartItem[]
     |
     +--> diff.added/removed    --> ReviewDiffItem[]
     |
     +--> diff.quantityChanged  --> ReviewQuantityChange[]
     |
     +--> warnings              --> ReviewWarning[]
     |
     +--> confidence            --> ReviewConfidence
     |
     v
ReviewPack (for Control Panel UI)
```

### Key Transformations

#### toReviewCartItem()

Converts CartBuilder `CartItem` to UI-friendly `ReviewCartItem`:

```typescript
function toReviewCartItem(item: CBCartItem): ReviewCartItem {
  return {
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
    available: item.available,
  };
}
```

#### mapWarningType()

Maps CartBuilder warning types to Review warning types:

| CartBuilder Type | Review Type |
|------------------|-------------|
| `item_unavailable` | `out_of_stock` |
| `price_changed` | `price_change` |
| `quantity_adjusted` | `data_quality` |
| `order_load_partial` | `partial_order_load` |
| `reorder_failed` | `missing_item` |

### Confidence Scoring

The Review Pack includes confidence scores for UI display:

```typescript
interface ReviewConfidence {
  cartAccuracy: number;   // From CartBuilder report (0-1)
  dataQuality: number;    // Derived from warning count (0-1)
  sourceOrders: string[]; // Order IDs used
}
```

**Data Quality Calculation:**

```typescript
const dataQuality = warnings.length === 0
  ? 1.0
  : Math.max(0.5, 1 - warnings.length * 0.1);
```

### Default User Actions

```typescript
function createDefaultActions(): UserAction[] {
  return [
    {
      id: 'approve',
      type: 'approve_cart',
      description: 'Approve cart and proceed to checkout review',
      enabled: true,
    },
    {
      id: 'reject',
      type: 'reject_cart',
      description: 'Reject cart and start over',
      enabled: true,
    },
  ];
}
```

---

## Integration Points

### Invocation (from Control Panel)

```typescript
// Create coordinator with configuration
const coordinator = new Coordinator({
  maxOrdersToLoad: 3,
  mergeStrategy: 'latest',
  captureScreenshots: true,
});

// Run session
const result = await coordinator.run(
  agentContext,   // { page, logger, sessionId }
  username,       // Auchan email
  householdId     // Household ID for preferences
);
```

### Result Structure

```typescript
interface CoordinatorResult {
  success: boolean;
  error?: Error;
  logs: string[];
  data?: {
    sessionId: string;
    reviewPack: ReviewPack;
    screenshots: string[];
    durationMs: number;
    status: SessionStatus;  // 'review_ready' on success
  };
}
```

### Phase 3: Feedback Loop

Future integration for learning from user decisions:

```
ReviewPack
     |
     v
User Decision (approve/reject/modify)
     |
     v
Feedback to Memory System
     |
     v
Improved Preferences for Next Session
```

---

## Configuration

### CoordinatorConfig Options

```typescript
interface CoordinatorConfig {
  // Cart Building
  maxOrdersToLoad: number;      // Max orders to load (default: 3)
  includeFavorites: boolean;    // Include favorites (default: false)
  mergeStrategy: MergeStrategy; // Order merge strategy (default: 'latest')
  clearExistingCart: boolean;   // Clear cart first (default: false)

  // Session Behavior
  captureScreenshots: boolean;  // Capture screenshots (default: true)
  sessionTimeout: number;       // Timeout in ms (default: 300000 = 5 min)
  maxRetries: number;           // Max retries for failures (default: 2)

  // Phase 2 Feature Flags
  enableSubstitution: boolean;  // Enable substitution (default: false)
  enableStockPruning: boolean;  // Enable stock pruning (default: false)
  enableSlotScouting: boolean;  // Enable slot scouting (default: false)
}
```

### Default Values

| Option | Default | Notes |
|--------|---------|-------|
| `maxOrdersToLoad` | 3 | Typical household needs |
| `includeFavorites` | false | Phase 3 feature |
| `mergeStrategy` | `'latest'` | Most predictable behavior |
| `clearExistingCart` | false | Preserve existing items |
| `captureScreenshots` | true | For debugging |
| `sessionTimeout` | 300000 | 5 minutes |
| `maxRetries` | 2 | Balance reliability vs. time |

### Merge Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `latest` | Use most recent order only | Simple, predictable |
| `combined` | Combine items from all orders, sum quantities | Stock up |
| `most_frequent` | Use most frequently ordered items (Phase 3) | Regular shopping |

---

## Error Handling

### Error Types

```typescript
interface CoordinatorError {
  code: string;           // Error code for categorization
  message: string;        // Human-readable message
  severity: ErrorSeverity;
  source: ErrorSource;
  recoveryAttempted: boolean;
  recoveryOutcome?: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';
type ErrorSource = 'coordinator' | 'cart_builder' | 'substitution'
                 | 'stock_pruner' | 'slot_scout' | 'login';
```

### Error Codes

| Code | Source | Severity | Description |
|------|--------|----------|-------------|
| `COORDINATOR_FAILED` | coordinator | fatal | Unrecoverable coordinator error |
| `CART_BUILDER_FAILED` | cart_builder | error | CartBuilder returned failure |
| `CART_BUILDER_EXCEPTION` | cart_builder | error | CartBuilder threw exception |

### Recovery Behavior

| Scenario | Recovery |
|----------|----------|
| CartBuilder fails | Record error, cancel session |
| Network timeout | Retry up to `maxRetries` |
| Session timeout | Cancel session |

---

## Review Pack Structure

### Full Schema

```typescript
interface ReviewPack {
  // Metadata
  sessionId: string;
  generatedAt: Date;
  householdId: string;

  // Cart State
  cart: {
    summary: CartSummary;
    diff: ReviewCartDiff;
    before: ReviewCartItem[];
    after: ReviewCartItem[];
  };

  // Warnings & Actions
  warnings: ReviewWarning[];
  actions: UserAction[];

  // Quality & Confidence
  confidence: ReviewConfidence;

  // Phase 2+ Extensions (reserved)
  substitutions?: unknown[];
  pruning?: unknown[];
  slots?: unknown[];
}
```

### Warning Types

| Type | Description |
|------|-------------|
| `out_of_stock` | Item is unavailable |
| `price_change` | Price changed since last order |
| `data_quality` | Data extraction issue |
| `missing_item` | Item not found in cart |
| `partial_order_load` | Order loading was incomplete |

### User Action Types

| Type | Description |
|------|-------------|
| `approve_cart` | Approve cart for checkout |
| `reject_cart` | Reject and start over |
| `review_item` | Review specific item |
| `remove_item` | Remove item from cart |
| `modify_quantity` | Change item quantity |
| `request_substitution` | Request substitute (Phase 2) |

---

## Implementation Status

| Component | Status | Sprint |
|-----------|--------|--------|
| Type definitions | Complete | CB-I-001 |
| Session management | Complete | CB-I-001 |
| CartBuilder delegation | Complete | CB-I-001 |
| Review Pack generation | Complete | CB-I-001 |
| Error handling | Complete | CB-I-001 |
| Documentation | Complete | CB-I-001 |
| Substitution worker | Planned | Phase 2 |
| StockPruner worker | Planned | Phase 2 |
| SlotScout worker | Planned | Phase 2 |

---

## Usage Example

```typescript
import { Coordinator } from './agents/coordinator/coordinator';
import type { AgentContext } from './types/agent';

// Create context (typically from browser session)
const context: AgentContext = {
  page: playwrightPage,
  logger: structuredLogger,
  sessionId: 'session-123',
};

// Create coordinator with custom config
const coordinator = new Coordinator({
  maxOrdersToLoad: 2,
  mergeStrategy: 'latest',
  captureScreenshots: true,
});

// Run session
const result = await coordinator.run(
  context,
  'user@email.com',
  'household-001'
);

if (result.success && result.data) {
  console.log('Review Pack ready:', result.data.reviewPack);
  console.log('Items in cart:', result.data.reviewPack.cart.summary.itemCount);
  console.log('Total price:', result.data.reviewPack.cart.summary.totalPrice);
} else {
  console.error('Session failed:', result.error?.message);
}
```

---

## Related Modules

- [CartBuilder](./cart-builder.md) - Worker agent for cart population
- Substitution (Phase 2) - Worker agent for item substitution
- StockPruner (Phase 2) - Worker agent for stock pruning
- SlotScout (Phase 2) - Worker agent for delivery slots

---

*Last Updated: 2026-01-11*
