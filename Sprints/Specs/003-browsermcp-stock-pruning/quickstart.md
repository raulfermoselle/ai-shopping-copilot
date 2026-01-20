# Quickstart: BrowserMCP Stock Pruning

**Feature**: 003-browsermcp-stock-pruning
**Status**: Planning complete, ready for implementation
**Prerequisites**: BrowserMCP-I-001 cart merge workflow complete

---

## What This Feature Does

Connects existing StockPruner heuristics (1,223 lines) to the BrowserMCP workflow to intelligently prune recently-purchased items from merged carts.

**User Journey**:
1. User runs `/prune-cart` command
2. Agent syncs purchase history from Auchan.pt (incremental)
3. Agent scans current cart via BrowserMCP
4. Heuristics calculate restock cadence for each item
5. LLM validates ALL prune decisions (catches seasonality, bundles, trends)
6. Agent removes high-confidence prune items automatically
7. Agent generates JSON report with removed/reviewed/kept items

**Value**: Reduces 77-item merged cart to ~45 items by removing items bought recently (shower gel 8 days ago, vitamins 12 days ago, etc.)

---

## Architecture Overview

```
┌─────────────────┐
│ /prune-cart     │ (User command)
└────────┬────────┘
         │
    ┌────▼────┐
    │ pruneCart() │ (Orchestration)
    └────┬────┘
         │
         ├─► syncPurchaseHistory() ──► BrowserMCP ──► Auchan.pt Order History
         │                                                │
         │                                                ▼
         │                                      purchase-history.json
         │
         ├─► scanCartTool ──► BrowserMCP ──► Auchan.pt Cart Page
         │                          │
         │                          ▼
         │                     CartSnapshot
         │
         ├─► processCartItems(cart, history)
         │         │
         │         ▼
         │   PruneDecision[] (heuristics)
         │
         ├─► LLMEnhancer.enhance(decisions)
         │         │
         │         ▼
         │   EnhancedPruneDecision[] (validated)
         │
         ├─► removeCartItems() ──► BrowserMCP ──► Auchan.pt Cart (remove buttons)
         │
         └─► generatePruningReport() ──► runs/{timestamp}/pruning-report.json
```

---

## Technical Decisions Summary

For detailed research, see [research.md](./research.md)

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| Cart extraction | Reuse `scanCartTool` from cart-builder | Proven, token-optimized, compatible schemas |
| Purchase history sync | Incremental BrowserMCP extraction | Spec requirement (US2), efficient |
| Heuristics | Use `processCartItems()` unchanged | Spec forbids modification (FR004) |
| LLM validation | Use existing `LLMEnhancer` class | Already validates ALL prune decisions per spec |
| Item removal | Batch removal with final verification only | Token-optimized, follows BrowserMCP patterns |
| Dev vs Prod LLM | Pluggable: Claude Code (dev) vs API (prod) | Existing design |

---

## Key Files to Read

### Implementation Entry Points

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/agents/stock-pruner/orchestrator.ts` | **(Create)** Main `pruneCart()` function | `pruneCart()` |
| `src/agents/stock-pruner/tools/sync-purchase-history.ts` | **(Create)** Extract orders via BrowserMCP | `syncPurchaseHistory()` |
| `src/agents/stock-pruner/tools/remove-cart-items.ts` | **(Create)** Remove items via BrowserMCP | `removeCartItems()` |
| `src/agents/stock-pruner/report-generator.ts` | **(Create)** Generate JSON report | `generatePruningReport()` |

### Existing Dependencies (Reuse)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/agents/cart-builder/tools/scan-cart.ts` | Cart extraction | `scanCartTool` |
| `src/agents/stock-pruner/heuristics.ts` | Pruning logic (1,223 lines) | `processCartItems()`, `detectCategory()` |
| `src/agents/stock-pruner/llm-enhancer.ts` | LLM validation (506 lines) | `LLMEnhancer`, `createLLMEnhancer()` |
| `src/agents/stock-pruner/types.ts` | Type definitions | `PruneDecision`, `PurchaseRecord`, `StockPrunerConfig` |

### Documentation

| File | Purpose |
|------|---------|
| [spec.md](./spec.md) | Feature specification (US1-US3, FRs, BRs, entities) |
| [research.md](./research.md) | Technical research findings (5 questions resolved) |
| [data-model.md](./data-model.md) | Entity definitions (CartItem, PurchaseRecord, PruneDecision, PruningReport) |
| [contracts/api.yaml](./contracts/api.yaml) | Function interfaces (syncPurchaseHistory, pruneCart, removeCartItems, generatePruningReport) |

---

## Running Locally

### Prerequisites

- Node.js 18+ with TypeScript
- BrowserMCP extension installed and connected
- Auchan.pt account with order history
- Purchase history file: `data/memory/household-demo/purchase-history.json` (or will be created on first run)

### Development Workflow

```bash
# 1. Checkout feature branch
git checkout feature/003-browsermcp-stock-pruning

# 2. Install dependencies (if changed)
npm install

# 3. Build TypeScript
npm run build

# 4. Run via Claude Code (dev mode)
# Open browser to Auchan.pt, log in manually
# In Claude Code session:
/prune-cart

# Claude Code will:
# - Sync purchase history via BrowserMCP
# - Scan cart
# - Run heuristics + LLM validation (Claude Code reasons directly)
# - Remove items
# - Generate report

# 5. Review output
cat runs/2026-01-19T12:00:00.000Z/pruning-report.json
```

### Production Mode

```bash
# Set API key for LLM enhancer
export ANTHROPIC_API_KEY=your-key-here

# Run orchestrator (example - actual CLI TBD)
node dist/agents/stock-pruner/orchestrator.js

# Or integrate into shopping copilot workflow
```

---

## Running Tests

### Unit Tests (Heuristics - Already Exist)

```bash
npm run test src/agents/stock-pruner/heuristics.test.ts
```

### Integration Tests (Need to Create)

```bash
# Test purchase history sync
npm run test src/agents/stock-pruner/tools/sync-purchase-history.test.ts

# Test cart item removal
npm run test src/agents/stock-pruner/tools/remove-cart-items.test.ts

# Test full workflow
npm run test src/agents/stock-pruner/orchestrator.test.ts
```

### E2E Tests (BrowserMCP)

```bash
# Requires live Auchan.pt session
npm run test:e2e src/agents/stock-pruner/e2e/prune-cart.e2e.test.ts
```

---

## Implementation Phases

See [plan.md](./plan.md) for detailed task breakdown. High-level phases:

### Phase 0: Setup (2 tasks, 2 points)
- BrowserMCP tool discovery for removal buttons
- Test data preparation (mock cart + purchase history)

### Phase 1: Foundation (4 tasks, 6 points)
- `syncPurchaseHistory()` implementation
- `removeCartItems()` implementation
- JSON merge logic (deduplicate by orderId)
- State capture integration

### Phase 2: Core Workflow (3 tasks, 7 points)
- `pruneCart()` orchestration
- Heuristics + LLM integration
- Error handling and fallbacks

### Phase 3: Polish (3 tasks, 5 points)
- `generatePruningReport()` implementation
- Test coverage (unit, integration, E2E)
- Documentation updates

**Total**: 12 tasks, 20 story points (excluding US3 LLM which is already implemented)

---

## Data Storage

| Data | Location | Format | Persistence |
|------|----------|--------|-------------|
| Purchase history | `data/memory/household-demo/purchase-history.json` | JSON | Durable (disk) |
| Pruning reports | `runs/{ISO-timestamp}/pruning-report.json` | JSON | Durable (disk) |
| Cart snapshots | In-memory during workflow | TypeScript object | Ephemeral |
| LLM analytics cache | In-memory (LLMEnhancer instance) | Map | Ephemeral (process lifetime) |

---

## Key Patterns & Conventions

### Token Optimization

From `automation/harness/MERGE-ORDERS.md`:
- **Skip intermediate snapshots**: Only capture state for auth check + final verification
- **Use grep for extraction**: Don't parse full 100k character snapshots
- **Direct URLs when possible**: Extract UUIDs, navigate directly

### State Capture

From `automation/harness/CAPTURE-STATE.md`:
```typescript
// After each significant action:
await captureState(page, {
  phase: 'pruning',
  task: 'remove-items',
  step: 'final-verification'
});

// Captures 5 artifacts:
// - screenshot-notes.md (visual description)
// - snapshot.txt (accessibility tree)
// - url.txt (current page URL)
// - console.json (JS errors)
// - notes.md (agent observations)
```

### Error Classification

| Error Type | Recovery Strategy |
|------------|-------------------|
| Network timeout | Retry with exponential backoff (3 attempts) |
| Auth failure | Stop, report to user (manual login required) |
| Selector not found | Try fallback selectors, escalate if all fail |
| LLM unavailable | Fall back to heuristics only, log warning |
| File I/O error | Stop, report (corrupt purchase history) |

---

## Gotchas & Important Notes

### Purchase History Merge

- **Deduplication**: By `(orderId + productName)` - same product in same order = 1 record
- **Date format**: Must be ISO 8601 (`2026-01-19T10:00:00.000Z`)
- **Backup**: Always create `.bak` file before writing new history
- **Validation**: Use Zod schema to catch corrupt records before merge

### LLM Validation

- **ALL prune decisions validated**: Not just uncertain items (catches seasonality edge cases)
- **High-confidence KEEP skipped**: Safe to skip (worst case: we order something unnecessary)
- **Dev mode**: Claude Code reasons directly (no API calls)
- **Prod mode**: Uses llm-enhancer.ts with Anthropic API

### Cart Item Removal

- **Product name matching**: Use `normalizeProductName()` from analytics/engine.ts
- **Confirmation modals**: May appear for each removal - handle with `browser_click`
- **Batch verification**: Check cart count ONCE after all removals (not per-item)
- **Irreversible**: Once removed, only way to restore is re-run `/merge-orders`

### Selector Registry

From BrowserMCP-I-001 patterns:
- **Never hardcode selectors**: Use selector registry at `data/selectors/registry.json`
- **Discovery first**: Capture page, analyze structure, score candidates before implementing
- **Fallback chains**: Primary → 2+ fallbacks for resilience
- **Score by stability**: data-testid (95) > aria-label (85) > role (80) > css-id (75) > css-class (60) > text-content (50) > positional (20)

---

## Success Criteria

From [spec.md § 5](./spec.md#5-success-criteria):

**Primary**:
- ✅ 95-100% cart extraction accuracy
- ✅ 100% purchase history sync completeness
- ✅ 85-100% item matching accuracy
- ✅ 80-90% heuristic accuracy (user validation)
- ✅ 70-90% LLM reasoning quality (user rating)

**Secondary**:
- ✅ < 3 minutes execution time for 77-item cart
- ✅ 30k-70k tokens per run
- ✅ < 10 seconds JSON report generation
- ✅ 30-50% cart reduction rate

---

## Debugging Tips

### Cart Extraction Issues

```bash
# Check BrowserMCP snapshot manually
cat runs/latest/scan-cart-final/snapshot.txt | grep -i "cart\|item"

# Verify cart scanner output
node -e "import('./src/agents/cart-builder/tools/scan-cart.js').then(m => console.log(m.scanCartTool))"
```

### Purchase History Sync

```bash
# Check sync status
cat data/memory/household-demo/purchase-history.json | jq '.syncStatus'

# Validate records
cat data/memory/household-demo/purchase-history.json | jq '.records | length'
cat data/memory/household-demo/purchase-history.json | jq '.records[0]'
```

### LLM Enhancement

```bash
# Check if LLM is available
node -e "import('./src/llm/index.js').then(m => console.log(m.isLLMAvailable(process.env.ANTHROPIC_API_KEY)))"

# Review LLM reasoning from report
cat runs/latest/pruning-report.json | jq '.autoRemoved[] | {name: .productName, llm: .llmReasoning}'
```

### Selector Issues

```bash
# Check selector registry
cat data/selectors/registry.json | jq '.pages.cart'

# Test selector resolution
node -e "import('./src/selectors/resolver.js').then(m => {
  const r = new m.SelectorResolver();
  console.log(r.resolve('cart', 'removeButton'));
})"
```

---

## Related Work

- **Sprint BrowserMCP-I-001** (`Sprints/Modules/BrowserMCP/BrowserMCP-I-001/`): Completed cart merge implementation
- **StockPruner Heuristics** (`src/agents/stock-pruner/heuristics.ts`): 1,223 lines of pruning logic
- **LLM Enhancer** (`src/agents/stock-pruner/llm-enhancer.ts`): 506 lines of validation logic
- **automation/harness/MERGE-ORDERS.md**: Token optimization patterns
- **automation/harness/CAPTURE-STATE.md**: State verification procedure

---

## Next Steps

1. **Review planning artifacts**:
   - ✅ [spec.md](./spec.md) - Feature specification
   - ✅ [research.md](./research.md) - Technical research
   - ✅ [data-model.md](./data-model.md) - Entity definitions
   - ✅ [contracts/api.yaml](./contracts/api.yaml) - Function interfaces
   - ⏳ [plan.md](./plan.md) - Implementation plan (next)

2. **Run `/speckit-tasks 003-browsermcp-stock-pruning`** to generate detailed task breakdown

3. **Create sprint**: `/sprint-new StockPruner I 001` for first implementation sprint

4. **Begin implementation**: Phase 0 (Setup) → Phase 1 (Foundation) → Phase 2 (Core) → Phase 3 (Polish)
