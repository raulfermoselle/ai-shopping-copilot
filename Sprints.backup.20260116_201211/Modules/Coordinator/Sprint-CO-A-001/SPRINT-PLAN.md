# Sprint-CO-A-001: Design Coordinator Orchestration Flow (Phase 1)

**Module:** Coordinator
**Type:** Architecture (A)
**Status:** Active
**Started:** 2026-01-11
**Target Completion:** 2026-01-12
**Dependencies:** Sprint-CB-A-001 (CartBuilder Architecture) ✅

---

## Objective

Design the Coordinator orchestration flow for Phase 1 (fast-win MVP). The Coordinator is the orchestrator that:
1. Manages the session lifecycle
2. Delegates to worker agents (CartBuilder, Substitution, StockPruner, SlotScout)
3. Collects results into a unified Review Pack
4. Generates the final cart status for user approval

Phase 1 focuses on the minimal path: login → load/merge cart → diff report → ready for review.

---

## Key Inputs from Dependencies

### From Sprint-CB-A-001 (CartBuilder Architecture)
| Artifact | Implication |
|----------|------------|
| CartDiffReport type | Coordinator must consume CartDiffReport from CartBuilder |
| CartBuilderConfig | Coordinator must configure and pass to CartBuilder |
| CartDiffItem, CartDiffQuantityChange | Coordinator must understand cart changes to build Review Pack |
| MergeStrategy enum | Coordinator passes merge strategy to CartBuilder |

### From SPRINT-PLANNING.md (Phase 1 Roadmap)
| Constraint | Implication |
|-----------|------------|
| Phase 1 includes only CartBuilder | Substitution/StockPruner/SlotScout are Phase 2 - design for extensibility |
| Safety: Agent NEVER places orders | Coordinator must stop at cart review state - no order submission |
| Review Pack generation | Coordinator creates final output for user approval |

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| T001 | Design Coordinator agent interface and types | Complete |
| T002 | Define Phase 1 orchestration flow (minimal path) | Complete |
| T003 | Design Review Pack format and generation logic | Complete |
| T004 | Design worker delegation and result aggregation | Complete |
| T005 | Document Coordinator architecture in module docs | Pending |

---

## T001: Coordinator Agent Interface & Types

**Status:** Complete
**Implementation:** `src/agents/coordinator/types.ts`, `src/agents/coordinator/coordinator.ts`

Create `src/agents/coordinator/types.ts` and `src/agents/coordinator/coordinator.ts`:

### Core Types

```typescript
// Phase 1 Minimal Session State
interface CoordinatorSession {
  sessionId: string;
  startTime: Date;
  username: string;
  householdId: string;
  cart: CartSnapshot;
  workers: {
    cartBuilder: CartBuilderResult | null;
    substitution: null; // Phase 2
    stockPruner: null;  // Phase 2
    slotScout: null;    // Phase 2
  };
  reviewPack: ReviewPack | null;
  status: 'initializing' | 'loading' | 'processing' | 'review_ready' | 'cancelled';
  errors: CoordinatorError[];
}

// Review Pack - final output for user approval
interface ReviewPack {
  sessionId: string;
  generatedAt: Date;
  cart: {
    summary: CartSnapshot;
    diff: CartDiff;
    before: CartItem[];
    after: CartItem[];
  };
  warnings: ReviewWarning[];
  actions: UserAction[];
  confidence: {
    cartAccuracy: number;
    dataQuality: number;
  };
}

// Worker result aggregation
interface CoordinatorResult extends AgentResult {
  data: {
    sessionId: string;
    reviewPack: ReviewPack;
    screenshots: string[];
    duration: number;
  }
}

// Configuration for Phase 1
interface CoordinatorConfig {
  maxOrdersToLoad: number;
  includeFavorites: boolean;
  mergeStrategy: 'latest' | 'combined';
  captureScreenshots: boolean;
  // Phase 2 additions deferred
}

// Error handling
interface CoordinatorError {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'fatal';
  workerName?: string;
  recoveryAttempted?: boolean;
}
```

### Coordinator Class Structure

```typescript
class Coordinator extends Agent {
  session: CoordinatorSession;
  config: CoordinatorConfig;

  async run(
    config: CoordinatorConfig,
    sessionData?: Partial<CoordinatorSession>
  ): Promise<CoordinatorResult> {
    // 1. Initialize session
    // 2. Login to Auchan.pt
    // 3. Delegate to CartBuilder
    // 4. Generate Review Pack
    // 5. Return ready-to-review cart
  }

  private async initializeSession(): Promise<void>
  private async loginToAuchan(): Promise<void>
  private async delegateToCartBuilder(): Promise<CartBuilderResult>
  private async generateReviewPack(): Promise<ReviewPack>
  private async captureScreenshots(): Promise<string[]>
}
```

---

## T002: Phase 1 Orchestration Flow

**Status:** Complete
**Implementation:** `src/agents/coordinator/coordinator.ts`

### High-Level Flow Diagram

```
User starts session
        ↓
  ┌─────────────────────────────────────┐
  │  1. Initialize Session              │
  │     - createSession(sessionId,      │
  │       username, householdId)        │
  │     - status: 'initializing'        │
  └─────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────┐
  │  2. Authentication Check            │
  │     - status: 'authenticating'      │
  │     - Phase 1: Assumed logged in    │
  │     - TODO: Login delegation later  │
  └─────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────┐
  │  3. delegateToCartBuilder()         │
  │     - status: 'loading_cart'        │
  │     - createCartBuilderConfig()     │
  │     - new CartBuilder(config)       │
  │     - cartBuilder.run(context)      │
  │     - Store result in session       │
  └─────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────┐
  │  4. generateReviewPack()            │
  │     - status: 'generating_review'   │
  │     - Transform CartDiffReport      │
  │     - Map warnings to ReviewWarning │
  │     - Calculate confidence scores   │
  │     - Create default user actions   │
  └─────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────┐
  │  5. Return Cart Ready for Review    │
  │     - status: 'review_ready'        │
  │     - STOP (no order submission)    │
  │     - Wait for user approval        │
  └─────────────────────────────────────┘
```

### State Machine (Implemented)

**States defined in `SessionStatusSchema`:**

```
initializing → authenticating → loading_cart → generating_review → review_ready
      ↓              ↓               ↓                ↓                  ↓
    error          error           error            error             success
      ↓              ↓               ↓                ↓                  ↓
   cancelled     cancelled       cancelled        cancelled         completed
                                                                   (after user
                                                                    approval)
```

**State transitions in `run()` method:**
1. `createSession()` initializes with status `'initializing'`
2. `updateStatus('authenticating')` - login check
3. `updateStatus('loading_cart')` - before CartBuilder delegation
4. `updateStatus('generating_review')` - after CartBuilder completes
5. `updateStatus('review_ready')` - final state for user
6. On error: `updateStatus('cancelled')` with error recorded

### Orchestration Steps (Implemented)

| Step | Method | Description |
|------|--------|-------------|
| 1 | `createSession()` | Factory function creates session with `initializing` status |
| 2 | `updateStatus('authenticating')` | Phase 1: No actual login - assumed logged in |
| 3 | `delegateToCartBuilder()` | Creates CartBuilder with config, runs it, stores result |
| 4 | `generateReviewPack()` | Transforms CartDiffReport to ReviewPack format |
| 5 | `updateStatus('review_ready')` | Session ready for user approval |

### Key Decision Points (Phase 1 Scope)

| Decision | Phase 1 Approach | Phase 2/3 Extension |
|----------|-----------------|-------------------|
| Worker delegation | Only CartBuilder | Substitution, StockPruner, SlotScout |
| Authentication | Assumed logged in | Login delegation to login tools |
| Multiple orders merge | `'latest'` or `'combined'` | Phase 3: `'most_frequent'` learning |
| Out-of-stock items | Document in warnings | Phase 2: Substitution worker |
| Delivery slots | Not included | Phase 2: SlotScout worker |
| Household stock | Not checked | Phase 2: StockPruner worker |
| User feedback | Not captured | Phase 3: Feedback loop |

### Configuration Flags (Phase 2 Reserved)

The following flags are defined in `CoordinatorConfigSchema` but default to `false`:

```typescript
enableSubstitution: z.boolean().default(false),  // Phase 2
enableStockPruning: z.boolean().default(false),  // Phase 2
enableSlotScouting: z.boolean().default(false),  // Phase 2
```

These flags enable Phase 2 workers when implemented.

---

## T003: Review Pack Format & Generation

**Status:** Complete
**Implementation:** `src/agents/coordinator/types.ts` (schemas), `src/agents/coordinator/coordinator.ts` (generation)

### Review Pack Structure

```typescript
interface ReviewPack {
  // Metadata
  sessionId: string;
  generatedAt: Date;
  householdId: string;

  // Cart State
  cart: {
    summary: {
      itemCount: number;
      totalPrice: number;
      currency: string;
    };
    diff: CartDiff;
    before: CartItem[];
    after: CartItem[];
  };

  // Warnings & Actions
  warnings: ReviewWarning[];
  actions: UserAction[];

  // Confidence & Quality
  confidence: {
    cartAccuracy: number;     // 0-1
    dataQuality: number;      // 0-1
    sourceOrders: string[];   // order IDs used
  };

  // Phase 2+ Extensions (reserved)
  substitutions?: ReviewSubstitution[];
  pruning?: ReviewPruning[];
  slots?: ReviewSlot[];
}

interface ReviewWarning {
  type: 'out_of_stock' | 'price_change' | 'data_quality' | 'missing_item';
  itemName: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

interface UserAction {
  id: string;
  type: 'review_item' | 'approve_cart' | 'reject_item' | 'modify_quantity';
  description: string;
  targetItem?: string;
}
```

### Generation Algorithm

1. **Collect worker results**: CartBuilderResult from CartBuilder worker
2. **Extract cart diff**: From CartBuilderResult.data.diff
3. **Generate warnings**: Based on data quality, missing items, etc.
4. **Compute confidence scores**: Based on source reliability and data completeness
5. **Format for display**: Create structured ReviewPack JSON

---

## T004: Worker Delegation & Result Aggregation

**Status:** Complete
**Implementation:** `src/agents/coordinator/coordinator.ts` (delegation methods)

### Delegation Pattern

```typescript
interface CoordinatorContext {
  session: CoordinatorSession;
  page: Page;  // Playwright page
  tools: ToolRegistry;
}

class Coordinator extends Agent {
  private async delegateToCartBuilder(
    context: CoordinatorContext,
    config: CartBuilderConfig
  ): Promise<CartBuilderResult> {
    const cartBuilder = new CartBuilder(config);
    // Pass browser page and tools to CartBuilder
    const result = await cartBuilder.run(context.page, context.tools);
    // Store result in session
    this.session.workers.cartBuilder = result;
    return result;
  }

  // Phase 2: Add delegates for other workers
  // private async delegateToSubstitution()
  // private async delegateToStockPruner()
  // private async delegateToSlotScout()
}
```

### Result Aggregation

```typescript
private async aggregateResults(): Promise<void> {
  // 1. Validate each worker result
  // 2. Check for conflicts (should be none in Phase 1)
  // 3. Merge into unified session state
  // 4. Prepare for Review Pack generation

  if (!this.session.workers.cartBuilder?.success) {
    throw new CoordinatorError('CartBuilder failed');
  }

  // Phase 2: Add validation for other workers
}
```

### Actual Implementation (Phase 1)

The implemented `delegateToCartBuilder()` method in `coordinator.ts`:

1. **Config Mapping**: Uses `createCartBuilderConfig()` factory to map CoordinatorConfig to CartBuilderConfig
2. **Worker Instantiation**: Creates `new CartBuilder(config)` with the mapped config
3. **Execution**: Calls `cartBuilder.run(context)` passing AgentContext
4. **Result Capture**: Stores `CartBuilderWorkerResult` in `session.workers.cartBuilder`
5. **Screenshot Collection**: Collects screenshots from CartBuilder report into session
6. **Error Recording**: On failure, records error via `createError()` factory

**Key Types Used:**
- `CartBuilderWorkerResult` - Standardized worker result with success, durationMs, report/errorMessage
- `createCartBuilderConfig()` - Factory function for config translation
- `createError()` - Factory function for consistent error creation

---

## T005: Module Documentation

Create `docs/modules/coordinator.md`:

### Sections to Include

1. **Architecture Overview**
   - Role in the system (orchestrator)
   - Phase 1 scope (minimal MVP)
   - Future extensibility (Phase 2/3 workers)

2. **Session Lifecycle**
   - State machine diagram
   - Key decision points
   - Error handling strategy

3. **Worker Delegation**
   - CartBuilder delegation (Phase 1)
   - Placeholder for future workers

4. **Review Pack Generation**
   - Data flow from workers to Review Pack
   - Confidence scoring

5. **Integration Points**
   - How Control Panel invokes Coordinator
   - How users approve/reject Review Pack
   - How feedback flows back (Phase 3)

---

## Expected Outputs

1. `src/agents/coordinator/types.ts` - Type definitions with Zod schemas
2. `src/agents/coordinator/coordinator.ts` - Orchestrator implementation skeleton
3. `src/agents/coordinator/delegation/index.ts` - Worker delegation logic
4. `docs/modules/coordinator.md` - Architecture documentation
5. Updated `SPRINT-LOG.md` with decisions and design rationale

---

## Success Criteria

- [x] Coordinator types and interfaces defined with Zod validation
- [x] Phase 1 orchestration flow documented and diagrammed
- [x] Review Pack format designed for user approval workflow
- [x] Worker delegation pattern established (extensible for Phase 2)
- [ ] Module documentation complete and linked in main docs

---

## Dependencies & Blockers

### Unblocked
- Sprint-CB-A-001 complete with CartBuilder types ✅
- Sprint-G-002 complete with Auchan.pt login tools ✅

### Blocking CO-I-001
- This sprint (CO-A-001) must complete before implementation can start

---

## Notes

- Phase 1 is deliberately minimal - focus on MVP cart loading and review
- Design must be extensible for Phase 2 worker addition (substitution, pruning, slots)
- Safety constraint: Agent NEVER places orders - always stops at review stage
- Review Pack is the final output handed to user for approval/modification

---

*Created: 2026-01-11*
