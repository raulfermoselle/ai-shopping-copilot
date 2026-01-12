# Architecture Overview

This document provides a comprehensive view of the AI Shopping Copilot system architecture.

## System Goals

**Primary Goal:** Cut recurring ~2-hour grocery sessions to a short review + approval

**Design Principles:**
- User maintains full control (assistant mode, never autonomous)
- Transparency in all actions and suggestions
- Safety-first (never auto-purchase)
- Learn from user behavior to improve over time

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  Control Panel UI                             │   │
│  │  - Start session                                              │   │
│  │  - Provide inputs (slot preference, special needs)            │   │
│  │  - Review "Review Pack"                                       │   │
│  │  - Approve/Reject suggestions                                 │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      COORDINATOR AGENT                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Session Orchestration                                        │   │
│  │  - Manages lifecycle: init → login → cart → review            │   │
│  │  - Delegates to worker agents                                 │   │
│  │  - Aggregates results into Review Pack                        │   │
│  │  - NEVER submits orders (safety boundary)                     │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┬────────────────┐
           │                   │                   │                │
           ▼                   ▼                   ▼                ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│   CartBuilder    │ │   Substitution   │ │  StockPruner │ │   SlotScout  │
│                  │ │                  │ │              │ │              │
│ - Load orders    │ │ - Check avail.   │ │ - Analyze    │ │ - Find slots │
│ - Merge cart     │ │ - Find subs      │ │   cadences   │ │ - Rank opts  │
│ - Track diff     │ │ - Rank options   │ │ - Suggest    │ │ - Score      │
│                  │ │                  │ │   removals   │ │              │
└────────┬─────────┘ └────────┬─────────┘ └──────┬───────┘ └──────┬───────┘
         │                    │                  │                │
         └────────────────────┴─────────┬────────┴────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         TOOL LAYER                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐    │
│  │   Login    │ │   Scan     │ │   Search   │ │   Extract      │    │
│  │   Tool     │ │   Cart     │ │   Products │ │   Slots        │    │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └───────┬────────┘    │
└────────┼──────────────┼──────────────┼────────────────┼─────────────┘
         │              │              │                │
         └──────────────┴───────┬──────┴────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PLAYWRIGHT AUTOMATION                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Browser Control                                              │   │
│  │  - Navigation                                                 │   │
│  │  - Element interaction                                        │   │
│  │  - Screenshot capture                                         │   │
│  │  - Session management                                         │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
                      ┌──────────────────┐
                      │   Auchan.pt      │
                      │   Website        │
                      └──────────────────┘
```

## Agent Hierarchy

### Coordinator Agent (Orchestrator)

The Coordinator is the top-level agent responsible for:
- Session lifecycle management
- Worker delegation and coordination
- Error handling and recovery
- Review Pack generation

```typescript
class Coordinator {
  // Session states
  status: 'initializing' | 'authenticating' | 'loading_cart'
        | 'generating_review' | 'review_ready' | 'cancelled';

  // Worker results
  workers: {
    cartBuilder: CartBuilderResult | null;
    substitution: SubstitutionResult | null;
    stockPruner: StockPrunerResult | null;
    slotScout: SlotScoutResult | null;
  };

  async run(context: AgentContext): Promise<CoordinatorResult> {
    // 1. Initialize session
    // 2. Login
    // 3. Delegate to CartBuilder (blocking)
    // 4. Delegate to Substitution (non-blocking)
    // 5. Delegate to StockPruner (non-blocking)
    // 6. Delegate to SlotScout (non-blocking)
    // 7. Generate Review Pack
    // 8. Return result
  }
}
```

### CartBuilder Agent (Worker)

Builds the shopping cart from order history:

```typescript
class CartBuilder {
  async run(context: AgentContext): Promise<CartBuilderResult> {
    // 1. Navigate to order history
    // 2. Load recent orders
    // 3. Extract order items
    // 4. Reorder items to cart
    // 5. Scan final cart state
    // 6. Calculate diff
    // 7. Return report
  }
}
```

**Outputs:**
- Cart snapshot (before/after)
- Items diff (added, removed, changed)
- Warnings (unavailable items, price changes)
- Confidence score

### Substitution Agent (Worker)

Checks availability and finds substitutes:

```typescript
class Substitution {
  async run(context: AgentContext, items: CartItem[]): Promise<SubstitutionResult> {
    // 1. Check availability for each item
    // 2. For unavailable items, search substitutes
    // 3. Score and rank substitutes
    // 4. Return results
  }
}
```

**Outputs:**
- Availability status per item
- Ranked substitutes for unavailable items
- Scoring breakdown

### StockPruner Agent (Worker)

Suggests items to remove based on purchase history:

```typescript
class StockPruner {
  async run(context: AgentContext, input: StockPrunerInput): Promise<StockPrunerResult> {
    // 1. Load purchase history
    // 2. Calculate restock cadences
    // 3. Compare cart items to cadences
    // 4. Identify items likely still in stock
    // 5. Return prune suggestions
  }
}
```

**Outputs:**
- Prune decisions per item
- Confidence scores
- Reasoning for each decision

### SlotScout Agent (Worker)

Finds and ranks delivery slots:

```typescript
class SlotScout {
  async run(context: AgentContext, input: SlotScoutInput): Promise<SlotScoutResult> {
    // 1. Navigate to delivery selection
    // 2. Extract available slots
    // 3. Score slots based on preferences
    // 4. Return ranked options
  }
}
```

**Outputs:**
- Slots grouped by day
- Ranked slot recommendations
- Delivery cost information

## Data Flow

```
                    User Session Request
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     Coordinator                               │
│                                                              │
│  ┌─────────────┐                                            │
│  │ LoginTool   │──► Auchan.pt Authentication                │
│  └─────────────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐      ┌──────────────┐                     │
│  │ CartBuilder │──────│ Order        │                     │
│  │             │◄─────│ History Data │                     │
│  └─────────────┘      └──────────────┘                     │
│         │                                                   │
│         │ Cart Snapshot                                     │
│         ▼                                                   │
│  ┌─────────────────────────────────────┐                   │
│  │ Parallel Workers                     │                   │
│  │ ┌─────────────┐ ┌─────────────────┐ │                   │
│  │ │Substitution │ │ StockPruner     │ │                   │
│  │ └─────────────┘ └─────────────────┘ │                   │
│  │ ┌─────────────────────────────────┐ │                   │
│  │ │ SlotScout                       │ │                   │
│  │ └─────────────────────────────────┘ │                   │
│  └───────────────┬─────────────────────┘                   │
│                  │                                          │
│                  ▼                                          │
│         ┌──────────────┐                                   │
│         │ Review Pack  │                                   │
│         │ Generator    │                                   │
│         └──────────────┘                                   │
│                  │                                          │
└──────────────────┼──────────────────────────────────────────┘
                   │
                   ▼
              Review Pack
                   │
                   ▼
           User Review & Approval
                   │
                   ▼
         Manual Order Placement
           (on Auchan.pt)
```

## Component Responsibilities

### Core Components

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| Coordinator | Session orchestration, worker delegation | `src/agents/coordinator/` |
| CartBuilder | Cart loading, merging, diff tracking | `src/agents/cart-builder/` |
| Substitution | Availability checks, substitute search | `src/agents/substitution/` |
| StockPruner | Cadence learning, prune suggestions | `src/agents/stock-pruner/` |
| SlotScout | Slot discovery, ranking | `src/agents/slot-scout/` |

### Support Components

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| SelectorRegistry | Versioned selector management | `src/selectors/registry.ts` |
| SelectorResolver | Selector resolution with fallbacks | `src/selectors/resolver.ts` |
| Config | Configuration loading, validation | `src/config/index.ts` |
| Logger | Structured logging | `src/utils/logger.ts` |
| Errors | Error classification, retry logic | `src/utils/errors.ts` |

### Tool Components

| Tool | Purpose | Key Files |
|------|---------|-----------|
| LoginTool | Authentication | `src/tools/login.ts` |
| LoadOrderHistory | Order list extraction | `src/agents/cart-builder/tools/` |
| LoadOrderDetail | Order item extraction | `src/agents/cart-builder/tools/` |
| ScanCart | Cart state capture | `src/agents/cart-builder/tools/` |
| Reorder | Add items to cart | `src/agents/cart-builder/tools/` |
| CheckAvailability | Product availability | `src/agents/substitution/tools/` |
| SearchProducts | Product search | `src/agents/substitution/tools/` |
| ExtractSlots | Slot discovery | `src/agents/slot-scout/tools/` |

## Integration Points

### Auchan.pt Integration

The system interacts with Auchan.pt through Playwright automation:

```
┌─────────────────────────────────────────────────────────────┐
│                    Auchan.pt Pages                          │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Login    │  │ Order        │  │ Order Detail        │   │
│  │ Page     │  │ History      │  │ Page                │   │
│  │          │  │ List         │  │                     │   │
│  │ OAuth    │  │ /historico-  │  │ /detalhes-          │   │
│  │ Flow     │  │ encomendas   │  │ encomenda           │   │
│  └────┬─────┘  └──────┬───────┘  └──────────┬──────────┘   │
│       │               │                      │              │
│  ┌────┴─────┐  ┌──────┴───────┐  ┌──────────┴──────────┐   │
│  │ Cart     │  │ Search       │  │ Product Detail      │   │
│  │ Page     │  │ Results      │  │ Page                │   │
│  │          │  │              │  │                     │   │
│  │ /carrinho│  │ /pesquisa    │  │ /*.html             │   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Selector Registry Integration

```
┌─────────────────────────────────────────────────────────────┐
│                  Selector System                            │
│                                                             │
│  ┌─────────────┐       ┌──────────────┐                    │
│  │ registry.   │       │ pages/       │                    │
│  │ json        │──────►│ {page}/      │                    │
│  │             │       │ v{n}.json    │                    │
│  │ Master      │       │              │                    │
│  │ Index       │       │ Versioned    │                    │
│  │             │       │ Definitions  │                    │
│  └──────┬──────┘       └──────────────┘                    │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────┐                   │
│  │ SelectorRegistry                     │                   │
│  │                                      │                   │
│  │ - loadIndex()                        │                   │
│  │ - getActiveVersion(pageId)           │                   │
│  │ - createVersion(pageId, def)         │                   │
│  └──────────────┬──────────────────────┘                   │
│                 │                                           │
│                 ▼                                           │
│  ┌─────────────────────────────────────┐                   │
│  │ SelectorResolver                     │                   │
│  │                                      │                   │
│  │ - resolve(pageId, key)               │                   │
│  │ - resolveWithFallbacks(pageId, key)  │                   │
│  │ - tryResolve(page, pageId, key)      │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Memory Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory System                            │
│                                                             │
│  Working Memory                Long-term Memory             │
│  (Per Session)                 (Persistent)                 │
│  ┌───────────────┐            ┌───────────────────────┐    │
│  │ Session State │            │ Purchase History      │    │
│  │ - Status      │            │ - Past orders         │    │
│  │ - Cart diff   │            │ - Item purchases      │    │
│  │ - Worker      │            │                       │    │
│  │   results     │            │ Restock Profiles      │    │
│  │ - Errors      │            │ - Learned cadences    │    │
│  └───────────────┘            │ - Category defaults   │    │
│                               │                       │    │
│  Episodic Memory              │ User Overrides        │    │
│  (Persistent)                 │ - Custom rules        │    │
│  ┌───────────────┐            │ - Preferences         │    │
│  │ Session       │            └───────────────────────┘    │
│  │ Feedback      │                                         │
│  │ - Approved    │                                         │
│  │   items       │                                         │
│  │ - Rejected    │                                         │
│  │   subs        │                                         │
│  └───────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Error Handling                             │
│                                                             │
│  Error Classification                                       │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Recoverable (can retry)    │ Non-Recoverable       │    │
│  │ ──────────────────────────│──────────────────────  │    │
│  │ NetworkError              │ SelectorError          │    │
│  │ TimeoutError              │ AuthError              │    │
│  │                           │ ValidationError        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  Retry Strategy                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ withRetry(operation, {                             │    │
│  │   maxRetries: 3,                                   │    │
│  │   baseDelayMs: 1000,     // Exponential backoff   │    │
│  │   maxDelayMs: 30000,     // Cap delay             │    │
│  │   onRetry: (err, attempt) => log(...)             │    │
│  │ })                                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  Worker Isolation                                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │ CartBuilder ──► BLOCKING (failure stops session)   │    │
│  │ Substitution ► NON-BLOCKING (failure = empty data) │    │
│  │ StockPruner ─► NON-BLOCKING (failure = empty data) │    │
│  │ SlotScout ───► NON-BLOCKING (failure = empty data) │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Phase Implementation

### Phase 1 (Fast Win) - Completed

- Login automation
- Order history loading
- Cart diff report
- Basic Review Pack

### Phase 2 (Time Saver) - Current

- Substitution search
- StockPruner with cadence learning
- SlotScout for delivery slots
- Coordinator orchestration
- Control Panel UI (planned)

### Phase 3 (Polish) - Planned

- Long-term memory persistence
- Preference learning from feedback
- UI improvements
- Resilience to website changes

## Directory Structure

```
ai-shopping-copilot/
├── src/
│   ├── agents/
│   │   ├── coordinator/      # Coordinator agent
│   │   ├── cart-builder/     # CartBuilder agent
│   │   ├── substitution/     # Substitution agent
│   │   ├── stock-pruner/     # StockPruner agent
│   │   └── slot-scout/       # SlotScout agent
│   ├── tools/                # Shared tools (login, browser)
│   ├── selectors/            # Selector registry/resolver
│   ├── memory/               # Memory layer
│   ├── config/               # Configuration
│   ├── utils/                # Utilities
│   ├── types/                # Type definitions
│   ├── api/                  # API layer
│   └── control-panel/        # UI components
├── data/
│   ├── selectors/            # Selector definitions
│   ├── sessions/             # Browser sessions
│   └── households/           # Per-household data
├── config/
│   └── default.json          # Default configuration
├── docs/                     # Documentation
├── tests/                    # Test files
└── scripts/                  # Utility scripts
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js v20+ |
| Language | TypeScript 5.x |
| Browser Automation | Playwright |
| Schema Validation | Zod |
| Testing | Vitest (unit), Playwright Test (E2E) |
| Build | TypeScript Compiler (tsc) |
| Linting | ESLint |
| Formatting | Prettier |
