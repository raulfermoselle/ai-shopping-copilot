# Agent Migration Plan

**Sprint**: Sprint-EXT-A-001
**Module**: Extension
**Date**: 2026-01-16

---

## 1. Overview

This document maps existing agents to their extension equivalents and identifies shared code that can be reused.

### Migration Goals

1. **Preserve functionality** - All agent capabilities migrate to extension
2. **Maximize reuse** - Extract pure logic to shared library
3. **No duplication** - Single source of truth for business logic
4. **Clean boundaries** - Clear separation between shared and platform-specific code

---

## 2. Current Agent Inventory

| Agent | Location | Primary Responsibility | Playwright Dependency |
|-------|----------|----------------------|----------------------|
| **Coordinator** | `src/agents/coordinator/` | Orchestrate run lifecycle | Minimal (delegates) |
| **CartBuilder** | `src/agents/cart-builder/` | Load orders, build cart | Heavy (DOM) |
| **Substitution** | `src/agents/substitution/` | Find replacements | Heavy (search DOM) |
| **StockPruner** | `src/agents/stock-pruner/` | Remove unlikely items | None (pure logic) |
| **SlotScout** | `src/agents/slot-scout/` | Find delivery slots | Heavy (DOM) |

---

## 3. Migration Matrix

### 3.1 What Moves to Extension

| Component | Source | Destination | Notes |
|-----------|--------|-------------|-------|
| Run orchestration | `coordinator/` | `extension/src/core/orchestrator/` | State machine |
| Cart diff logic | `cart-builder/` | `extension/src/core/cart/` | Pure functions |
| Substitution scoring | `substitution/scoring.ts` | `extension/src/core/substitution/` | Pure functions |
| Slot scoring | `slot-scout/scoring.ts` | `extension/src/core/slots/` | Pure functions |
| Restock heuristics | `stock-pruner/` | `extension/src/core/pruner/` | Pure functions |
| LLM enhancer | `src/llm/` | `extension/src/core/llm-enhancer/` | Adapter-independent |

### 3.2 What Stays as Shared Library

These modules can be imported by both the extension and the original project:

| Module | Location | Consumers |
|--------|----------|-----------|
| Zod schemas | `src/shared/schemas/` | Extension, Original |
| Price utilities | `src/shared/utils/price.ts` | Extension, Original |
| Date utilities | `src/shared/utils/date.ts` | Extension, Original |
| Scoring algorithms | `src/shared/scoring/` | Extension, Original |
| LLM prompts | `src/shared/prompts/` | Extension, Original |

### 3.3 What Is Replaced (Platform-Specific)

| Original | Extension Replacement |
|----------|----------------------|
| Playwright page | Content script messaging |
| `page.evaluate()` | `document.querySelector()` in content script |
| `page.goto()` | `chrome.tabs.update()` |
| `page.click()` | Content script click handlers |
| File-based session | `chrome.storage.session` |
| Node.js Anthropic SDK | `fetch()` in service worker |

---

## 4. Agent-by-Agent Migration

### 4.1 Coordinator Agent

**Current Structure:**
```
src/agents/coordinator/
├── coordinator.ts      # Run orchestration
├── types.ts            # State types
├── index.ts
└── feedback/           # Post-run feedback
```

**Migration:**

| Component | Action | Target |
|-----------|--------|--------|
| State types | Move | `extension/src/types/state.ts` |
| State machine | Rewrite | `extension/src/core/orchestrator/state-machine.ts` |
| Phase execution | Rewrite | `extension/src/core/orchestrator/phases.ts` |
| Feedback system | Defer | Phase 2 (not MVP) |

**Key Changes:**
- Replace direct Playwright calls with message-based communication
- State persistence via `chrome.storage.session` instead of memory
- Event-driven architecture (service worker lifecycle)

---

### 4.2 CartBuilder Agent

**Current Structure:**
```
src/agents/cart-builder/
├── cart-builder.ts     # Main orchestration
├── types.ts            # Cart types
├── tools/              # Playwright tools
│   ├── load-order-history.ts
│   ├── load-order-detail.ts
│   ├── reorder.ts
│   ├── scan-cart.ts
│   └── navigate-to-order-history.ts
└── learning/           # Preference learning
```

**Migration:**

| Component | Action | Target |
|-----------|--------|--------|
| Cart types | Move | `extension/src/types/cart.ts` |
| Order types | Move | `extension/src/types/orders.ts` |
| Diff algorithms | Move | `extension/src/core/cart/diff.ts` |
| Merge logic | Move | `extension/src/core/cart/merge.ts` |
| Tools | Rewrite | Content script extractors |
| Learning | Defer | Phase 2 |

**Tool Migration:**

| Playwright Tool | Content Script Equivalent |
|----------------|--------------------------|
| `loadOrderHistory` | `order.extractHistory` message |
| `loadOrderDetail` | `order.extractDetail` message |
| `reorder` | `order.reorder` message |
| `scanCart` | `cart.scan` message |
| `navigateToOrderHistory` | `page.navigate` message |

---

### 4.3 Substitution Agent

**Current Structure:**
```
src/agents/substitution/
├── substitution.ts     # Main logic
├── types.ts            # Substitution types
├── tools/
│   ├── search-products.ts
│   ├── check-availability.ts
│   └── add-to-cart.ts
├── learning/
│   ├── ranking-adjuster.ts
│   └── tolerance-calculator.ts
└── analytics/
```

**Migration:**

| Component | Action | Target |
|-----------|--------|--------|
| Scoring algorithms | Move | `extension/src/core/substitution/scoring.ts` |
| Ranking logic | Move | `extension/src/core/substitution/ranking.ts` |
| Types | Move | `extension/src/types/cart.ts` (SubstitutionProposal) |
| Search tool | Rewrite | `search.products` message |
| Learning | Defer | Phase 2 |

**Pure Functions to Preserve:**
```typescript
// These are already pure and can be directly reused:
- calculatePriceScore(original: number, substitute: number): number
- calculateBrandScore(originalBrand: string, substituteBrand: string): number
- calculateCategoryScore(originalCat: string[], substituteCat: string[]): number
- rankSubstitutes(candidates: ProductInfo[], original: CartItem): ScoredSubstitute[]
```

---

### 4.4 StockPruner Agent

**Current Structure:**
```
src/agents/stock-pruner/
├── stock-pruner.ts     # Main logic
├── types.ts            # Pruning types
├── heuristics.ts       # Restock cadence
├── llm-enhancer.ts     # LLM integration
├── learning/
└── analytics/
```

**Migration:**

| Component | Action | Target |
|-----------|--------|--------|
| Heuristics | Move | `extension/src/core/pruner/heuristics.ts` |
| Types | Move | `extension/src/types/` |
| LLM enhancer | Move | `extension/src/core/llm-enhancer/` |
| Learning | Defer | Phase 2 |

**Key Insight:** StockPruner has the least Playwright dependency. Most logic is pure and can be directly reused.

---

### 4.5 SlotScout Agent

**Current Structure:**
```
src/agents/slot-scout/
├── slot-scout.ts       # Main logic
├── types.ts            # Slot types
├── scoring.ts          # Slot scoring
└── tools/
    ├── navigate-to-slots.ts
    └── extract-slots.ts
```

**Migration:**

| Component | Action | Target |
|-----------|--------|--------|
| Slot types | Move | `extension/src/types/slots.ts` |
| Scoring | Move | `extension/src/core/slots/scoring.ts` |
| Tools | Rewrite | `slots.extract` message |

---

## 5. Shared Library Structure

### 5.1 Proposed Structure

```
src/shared/                    # Shared by extension and original
├── schemas/
│   ├── cart.schema.ts        # Zod schemas for cart validation
│   ├── order.schema.ts
│   └── slot.schema.ts
│
├── utils/
│   ├── price.ts              # Price parsing, formatting
│   ├── date.ts               # Date handling
│   └── text.ts               # Text normalization
│
├── scoring/
│   ├── substitution.ts       # Substitute scoring algorithms
│   ├── slots.ts              # Slot scoring algorithms
│   └── restock.ts            # Restock cadence algorithms
│
├── prompts/
│   ├── system.ts             # System prompts
│   ├── substitution.ts       # Substitution prompts
│   └── stock-pruner.ts       # Stock pruner prompts
│
└── index.ts                  # Exports
```

### 5.2 Build Configuration

```jsonc
// tsconfig.shared.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist/shared",
    "declaration": true
  },
  "include": ["src/shared/**/*"]
}
```

The shared library can be:
1. Bundled directly into extension
2. Published as internal package
3. Symlinked for development

---

## 6. Migration Phases

### Phase 1: Core MVP (Sprint-EXT-I-001)

| Week | Tasks |
|------|-------|
| 1 | Set up extension structure, adapters |
| 1 | Migrate CartBuilder (extract orders, reorder, scan) |
| 2 | Migrate SlotScout (extract slots, scoring) |
| 2 | Basic orchestrator with state machine |

**MVP Deliverable:** Extension can load orders, reorder, scan cart, show slots.

### Phase 2: Substitution & Pruning (Sprint-EXT-I-002)

| Week | Tasks |
|------|-------|
| 3 | Migrate Substitution (search, scoring) |
| 3 | Migrate StockPruner heuristics |
| 4 | Integrate LLM enhancer |
| 4 | Review pack UI |

**Deliverable:** Full shopping flow with substitutions and pruning.

### Phase 3: Learning & Polish (Sprint-EXT-I-003)

| Week | Tasks |
|------|-------|
| 5-6 | Learning subsystems |
| 5-6 | Feedback integration |
| 5-6 | Error recovery refinement |

**Deliverable:** Production-ready extension.

---

## 7. Code Reuse Summary

### Direct Reuse (No Changes)

| Module | Lines | Effort |
|--------|-------|--------|
| Price utilities | ~100 | Copy |
| Date utilities | ~50 | Copy |
| Zod schemas | ~200 | Copy |
| LLM prompts | ~150 | Copy |
| **Total** | **~500** | **Low** |

### Adapt (Minor Changes)

| Module | Lines | Changes |
|--------|-------|---------|
| Substitution scoring | ~150 | Remove Playwright imports |
| Slot scoring | ~100 | Remove Playwright imports |
| Cart diff | ~200 | Type updates |
| **Total** | **~450** | **Low-Medium** |

### Rewrite (New Implementation)

| Module | Lines | Reason |
|--------|-------|--------|
| Coordinator | ~300 | Different event model |
| Content script extractors | ~400 | DOM-direct instead of Playwright |
| Storage adapter | ~100 | Chrome storage API |
| Messaging adapter | ~150 | Chrome messaging API |
| **Total** | **~950** | **Medium** |

### Estimated Total Effort

- **Reusable code:** ~950 lines (50%)
- **New code:** ~950 lines (50%)
- **Total extension code:** ~1,900 lines

---

## 8. Risk Mitigation

### Risk 1: Selector Drift

Selectors may need updates for extension context.

**Mitigation:** Use selector registry with fallbacks; content scripts use same selectors as Playwright.

### Risk 2: State Synchronization

Service worker restarts can lose state.

**Mitigation:** Persist to `chrome.storage.session` after every state change.

### Risk 3: Timing Differences

Extension timing differs from Playwright (no explicit waits).

**Mitigation:** Use MutationObserver for DOM changes; implement retry patterns.

---

*Migration plan created: 2026-01-16*
*Sprint: Sprint-EXT-A-001, Task: T005*
