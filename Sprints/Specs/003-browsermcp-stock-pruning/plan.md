# Implementation Plan: BrowserMCP Stock Pruning

**Branch**: feature/003-browsermcp-stock-pruning
**Date**: 2026-01-19
**Specification**: Sprints/Specs/003-browsermcp-stock-pruning/spec.md

---

## Summary

This feature connects existing StockPruner heuristics to the BrowserMCP workflow, enabling intelligent cart refinement by removing recently-purchased items that don't need reordering yet. After a user merges 77 items from past orders into their cart via BrowserMCP-I-001, the pruning workflow syncs purchase history from Auchan.pt, scans the current cart, applies cadence-based heuristics, validates all prune decisions with LLM (to catch seasonality, bundles, and trend edge cases that deterministic logic misses), removes high-confidence items automatically, and generates a JSON report showing removed/reviewed/kept items with dual reasoning (heuristic + LLM).

The implementation reuses proven patterns from BrowserMCP-I-001 (token-optimized cart extraction, direct navigation over click chains) and existing StockPruner components (1,223 lines of heuristics, 506 lines of LLM enhancement). Key value: reduces merged cart from 77 to ~45 items by removing shower gel bought 8 days ago, vitamins bought 12 days ago, toothpicks bought 25 days ago, etc., while preserving items that are actually needed based on historical purchase cadence. LLM validation of all prune decisions ensures heuristics don't make confidently-wrong decisions when context matters (e.g., summer vs winter consumption shifts, new baby/pet items with sparse history).

---

## Technical Context

### Language & Framework
- **Primary Language**: TypeScript 5.3+
- **Framework**: Node.js 18+, Playwright for browser automation
- **Version**: Node 18.x LTS, TypeScript strict mode enabled
- **Build Tool**: esbuild via npm run build

### Dependencies
- **New Dependencies**: None (reuses all existing packages)
- **Existing Dependencies**:
  - `@playwright/test` - Browser automation (from BrowserMCP-I-001)
  - `zod` - Runtime schema validation
  - `@anthropic-ai/sdk` - LLM API (optional, for prod mode)
  - BrowserMCP extension - Browser control via MCP protocol
- **Peer Dependencies**: None

### Storage & Persistence
- **Data Storage**: Local filesystem (JSON files)
- **Schema Changes**: None to existing schemas, adds new PurchaseHistorySyncStatus wrapper
- **File Structure**:
  - `data/memory/household-demo/purchase-history.json` - PurchaseRecord[] with syncStatus metadata
  - `runs/{ISO-timestamp}/pruning-report.json` - PruningReport output
- **Cache Strategy**: In-memory cache during workflow execution (LLMEnhancer analytics, product name index)

### Testing Strategy
- **Unit Tests**: Vitest for pure functions
  - `processCartItems()` heuristics (already tested - 1,223 lines)
  - `generatePruningReport()` - report generation logic
  - `normalizeProductName()` - product matching
  - Coverage target: 80%+ for new code
- **Integration Tests**: Vitest with real file I/O
  - `syncPurchaseHistory()` - JSON merge, deduplication
  - `pruneCart()` orchestration - full workflow without browser
  - Mock BrowserMCP responses for cart scan/removal
  - Coverage target: 70%+ for integration paths
- **E2E Tests**: Playwright with real Auchan.pt
  - Full pruning workflow (sync → scan → decide → remove → report)
  - Error scenarios (auth failure, network timeout, item not found)
  - BrowserMCP integration (live browser automation)
  - Manual execution only (requires Auchan credentials)

### Platform Requirements
- **Runtime**: Node.js 18+ (ES modules, top-level await)
- **Environment**: Development (Windows/macOS/Linux), production (server or local)
- **OS Compatibility**: Cross-platform (Node.js file paths normalized)
- **Browser**: Chrome/Chromium 120+ (for BrowserMCP extension)

### Type Safety
- **Type System**: TypeScript strict mode (noImplicitAny, strictNullChecks, strictFunctionTypes)
- **Validation**: Zod schemas for runtime validation at system boundaries
  - CartItem, PurchaseRecord, PruneDecision, PruningReport validated
- **Error Handling**: Custom error types with structured context
  - `AuthenticationError`, `OrderHistoryNotFound`, `ParsingError`, `FileIOError`, `BackupError`, `TimeoutError`
  - All async functions return Result<T, E> or throw typed errors

### Performance Requirements
- **Response Times**:
  - Full workflow: < 3 minutes for 77-item cart (target: 2-5 minutes acceptable)
  - Purchase history sync: ~500ms per order (25 seconds for 50 orders)
  - Cart scan: < 2 seconds (single browser call via page.evaluate)
  - Heuristics: < 100ms (pure functions, in-memory)
  - LLM validation: ~2-3 seconds per batch (rate-limited API calls)
  - Item removal: ~500ms per item (click + verification)
- **Throughput**: Single-user sequential workflow (not multi-tenant)
- **Resource Limits**:
  - Memory: < 500MB for typical workflow (2000 records, 77 cart items)
  - Token budget: 30k-70k tokens per run (BrowserMCP snapshots + LLM API)

### Technical Constraints
- **Must Use**:
  - `page.evaluate()` with string templates for bulk DOM extraction (avoids Playwright locator timeouts)
  - Selector registry pattern (never hardcode selectors)
  - BrowserMCP for all browser interactions (transparency requirement)
  - Existing StockPruner heuristics without modification (spec requirement FR004)
- **Must Avoid**:
  - Playwright locators for iteration (causes 30+ second timeouts on 10+ elements)
  - Full BrowserMCP snapshot parsing (100k+ characters per page)
  - Hardcoded selectors (selector registry enforces fallback chains)
  - Modifying heuristics.ts (spec forbids changes)
- **Must Comply With**:
  - CLAUDE.md principles (Replace Magic Values, Centralize Cross-Cutting Concerns, Minimize Context Window Consumption, Prefer Direct Navigation)
  - Security constraint: Agent NEVER places orders (stops at cart modification)
  - Article III (Test-First): Tests before implementation

### Scale Considerations
- **Current Scale**: Single household, 2000+ purchase records, 77-item carts
- **Expected Growth**: Up to 5000 records (3 years of weekly shopping), 100-item carts
- **Scaling Strategy**:
  - File-based storage sufficient (< 2MB JSON files)
  - In-memory indexing (Map<productName, Record[]>) scales to 10k records
  - Incremental sync keeps extraction time constant (~5 new orders per week)
  - LLM validation batching limits API cost (max 20 items enhanced per run)

---

## Constitution Check

Before proceeding, verify compliance with project constitution:

- [x] **Article III (Test-First)**: Tests are ordered before implementation tasks
  - Mitigation: Phase structure ensures tests written before implementation (Setup → Foundation includes test setup, each user story has test tasks before impl tasks)

- [x] **Article IV (Autonomous Execution)**: Plan includes all context for autonomous execution
  - Mitigation: All technical decisions documented in research.md, data-model.md, contracts/api.yaml. No clarifications needed during execution.

- [x] **Article X (Deadlock Handling)**: Plan identifies potential blockers and workarounds
  - Mitigation: Error handling section documents recovery strategies for all known failure modes (auth, network, selectors, LLM API). Fallback to cached data if sync fails, heuristics-only if LLM unavailable.

- [x] **No User Questions**: Plan assumes all clarifications resolved in specification phase
  - Mitigation: All unknowns resolved during research phase (cart extraction method, purchase history structure, heuristics interface, LLM integration, removal workflow). Spec has zero open questions.

- [x] **Clear Dependencies**: Task dependencies explicitly mapped
  - Mitigation: Dependency graph included in task breakdown (Phase 0 → Phase 1 → Phase 2 → Phase 3, with parallel opportunities identified)

---

## Project Structure

```
src/
├── agents/
│   └── stock-pruner/
│       ├── orchestrator.ts           # NEW: Main pruneCart() function (Phase 2)
│       ├── heuristics.ts             # EXISTING: Reuse processCartItems()
│       ├── llm-enhancer.ts           # EXISTING: Reuse LLMEnhancer class
│       ├── report-generator.ts       # NEW: generatePruningReport() (Phase 3)
│       ├── types.ts                  # UPDATE: Add PurchaseHistorySyncStatus, PruningReport
│       └── tools/
│           ├── sync-purchase-history.ts  # NEW: BrowserMCP order extraction (Phase 1)
│           └── remove-cart-items.ts      # NEW: BrowserMCP cart removal (Phase 1)
├── tools/
│   └── cart/
│       └── scan-cart.ts              # EXISTING: Reuse from cart-builder
└── types/
    └── common.ts                     # UPDATE: Add shared types if needed

data/
├── memory/
│   └── household-demo/
│       └── purchase-history.json     # UPDATED: Add syncStatus wrapper (Phase 1)
└── selectors/
    └── pages/
        ├── order-history/            # NEW: Selectors for order extraction (Phase 0)
        │   └── v1.json
        └── cart/                     # UPDATE: Add removal selectors (Phase 0)
            └── v1.json

runs/
└── {ISO-timestamp}/
    └── pruning-report.json           # NEW: Output reports (Phase 3)

Sprints/
└── Specs/
    └── 003-browsermcp-stock-pruning/
        ├── spec.md                   # COMPLETE
        ├── research.md               # COMPLETE
        ├── data-model.md             # COMPLETE
        ├── contracts/
        │   └── api.yaml              # COMPLETE
        ├── quickstart.md             # COMPLETE
        ├── plan.md                   # THIS FILE
        └── checklists/
            └── design.md             # NEW: Design validation checklist
```

---

## Research Outcomes

See [research.md](./research.md) for detailed investigation. Key decisions:

### Key Technical Decisions

1. **Cart Extraction**: Reuse `scanCartTool` from cart-builder module
   - Rationale: Proven pattern from BrowserMCP-I-001, token-optimized (single browser call via page.evaluate), compatible schemas (CartSnapshot → CartItemForPruning direct mapping)
   - Alternatives considered: Direct BrowserMCP snapshot parsing (rejected: 100k+ token cost), Playwright locators (rejected: timeouts on 10+ elements)

2. **Purchase History Sync**: Incremental BrowserMCP extraction
   - Rationale: Spec requirement (US2), efficient (only new orders), avoids manual maintenance, follows BrowserMCP patterns from MERGE-ORDERS workflow
   - Alternatives considered: Full re-extraction (rejected: slow, high token cost), manual CSV import (rejected: spec forbids), scheduled background sync (rejected: deferred to future spec)

3. **Heuristics Integration**: Use `processCartItems()` from heuristics.ts without modification
   - Rationale: Spec requirement (FR004 forbids modification), well-tested (1,223 lines), compatible input/output types
   - Alternatives considered: Refactor for BrowserMCP (rejected: violates spec), wrapper adapter (rejected: unnecessary abstraction)

4. **LLM Validation**: Use existing `LLMEnhancer` class (validates ALL prune decisions)
   - Rationale: Already implements spec requirement (US3), existing filtering logic validates REVIEW + AUTO_REMOVE items (skips only high-confidence KEEP), pluggable design supports dev (Claude Code) and prod (API) modes
   - Alternatives considered: Validate ALL items including KEEP (rejected: unnecessary cost), skip LLM entirely (rejected: misses edge cases), build new integration (rejected: duplicates 506 lines)

5. **Item Removal**: Batch removal with final verification only
   - Rationale: Token-optimized (skip intermediate snapshots), follows BrowserMCP patterns, handles Auchan modals (learned from merge-orders)
   - Alternatives considered: Per-item verification (rejected: high token cost), Playwright instead of BrowserMCP (rejected: contradicts architecture), clear + re-add (rejected: loses user adjustments)

6. **Dev vs Prod LLM**: Pluggable design
   - Rationale: Existing architecture, dev mode uses Claude Code directly (no API calls), prod mode uses llm-enhancer API
   - Alternatives considered: N/A (already implemented)

### Alternatives Considered

- **Full snapshot parsing for cart extraction**: Rejected due to 100k+ character snapshots, high token consumption
- **Playwright locators for DOM extraction**: Rejected due to 30+ second timeouts on iteration
- **Manual purchase history maintenance**: Rejected per spec requirement (must stay current without manual CSV imports)
- **Heuristics modification**: Rejected per spec requirement FR004 (use existing without modification)

---

## Data Model

See [data-model.md](./data-model.md) for complete definitions. Key entities:

### Entities

- **CartItem**: Product in cart (from cart-builder module)
  - Fields: name, quantity, unitPrice, productId, productUrl, available
  - Relationships: N/A (ephemeral workflow data)

- **PurchaseRecord**: Historical purchase (from stock-pruner module)
  - Fields: productName, purchaseDate, quantity, orderId, unitPrice, productId, category
  - Relationships: Many records per order (orderId foreign key)

- **PruneDecision**: Agent's keep/remove determination
  - Fields: productName, prune, confidence, reason, decision (KEEP/REVIEW/AUTO_REMOVE), context, llmReasoning, llmConfidenceAdjustment, wasLLMEnhanced
  - Relationships: One decision per cart item

- **PurchaseHistorySyncStatus**: Sync metadata (NEW entity)
  - Fields: lastSyncTimestamp, ordersCaptured, recordCount, lastOrderDate
  - Relationships: One per purchase-history.json file

- **PruningReport**: Workflow output (NEW entity)
  - Fields: timestamp, initialCartCount, finalCartCount, autoRemoved[], reviewRequired[], kept[], syncStatus
  - Relationships: Embeds PruneDecision[] arrays

### State Transitions

**PruneDecision State Machine**:
```
[Heuristic Baseline] --LLM Validation--> [LLM Enhanced]
        |                                      |
        +-------(confidence-based)-------------+
        |                                      |
        v                                      v
    [Classification]                    [Classification]
        |                                      |
        +---------> KEEP (<0.6)                |
        +---------> REVIEW (0.6-0.8) <---------+
        +---------> AUTO_REMOVE (>0.8)

AUTO_REMOVE --> [Executed] --> Removed from cart
REVIEW --> [User Decision] --> Removed or Kept (future)
KEEP --> [No Action] --> Remains in cart
```

---

## API Contracts

See [contracts/api.yaml](./contracts/api.yaml) for complete interfaces. Key functions:

### Endpoints

- `syncPurchaseHistory(page, lastSyncDate?, options?)`: Extract new orders from Auchan.pt
  - Request: Playwright Page, optional lastSyncDate (Date), SyncOptions (maxOrders, createBackup, maxRetries, pageLoadTimeout)
  - Response: SyncPurchaseHistoryResult (success, newOrdersFound, newRecordsAdded, dateRange, syncStatus, newRecords, warnings, error)
  - Errors: AuthenticationError, OrderHistoryNotFound, ParsingError, FileIOError, BackupError, TimeoutError

- `pruneCart(context, config?)`: Main orchestration function
  - Request: PruneCartContext (page, logger, sessionId, householdPath, captureScreenshots), PruneCartConfig (shouldSyncHistory, maxOrdersToSync, minRemoveConfidence, useLLMEnhancement, maxLLMEnhancements, autoRemoveEnabled, reportReviewThresholds)
  - Response: PruneCartResult (success, report, summary, reportPath, warnings, error)
  - Errors: NotAuthenticatedError, CartNotFoundError, SyncFailedError, EmptyCartError, RemovalFailedError, FileIOError, LLMError

- `removeCartItems(page, itemsToRemove[], options?)`: Remove items via BrowserMCP
  - Request: Playwright Page, RemoveItemsInput[] (productName, productId, quantityToRemove), RemoveItemsOptions (removalTimeoutMs, captureScreenshots, continueOnError, delayBetweenRemovals)
  - Response: RemoveItemsResult (success, successCount, results[], finalCartCount, screenshots, warnings, error)
  - Errors: NOT_FOUND, CLICK_FAILED, VERIFICATION_FAILED, TIMEOUT, UNKNOWN, AuthenticationError

- `generatePruningReport(input)`: Create JSON report (pure function)
  - Request: GenerateReportInput (timestamp, initialCartCount, finalCartCount, decisions[], syncStatus, preClassified?)
  - Response: PruningReport (timestamp, initialCartCount, finalCartCount, autoRemoved[], reviewRequired[], kept[], syncStatus)
  - Errors: None (pure function, throws on validation failure)

---

## Complexity Tracking

| Component | Complexity | Reasoning |
|-----------|------------|-----------|
| syncPurchaseHistory() | **Medium** | BrowserMCP navigation + DOM extraction + JSON merge logic. Handles pagination, parsing variations, deduplication. 150-200 lines estimated. |
| pruneCart() | **Medium** | Orchestration glue - calls 5 functions in sequence, error handling, state management. 100-150 lines estimated. |
| removeCartItems() | **Medium** | BrowserMCP interaction with retry logic, modal handling, verification polling. 120-180 lines estimated. |
| generatePruningReport() | **Low** | Pure function - bucket decisions by classification, add metadata. 40-60 lines estimated. |
| Selector discovery | **Low** | Manual page inspection, JSON file creation. 1-2 hours per page. |
| Test setup | **Low** | Mock data files (cart snapshot, purchase history, expected decisions). 30-50 lines per test. |
| Integration tests | **Medium** | Test orchestration flow with mocked BrowserMCP responses. 100-150 lines total. |
| E2E tests | **High** | Live Auchan.pt session, requires credentials, network stability, manual verification. 80-120 lines but high maintenance. |

**Overall Complexity**: **Medium**

**Estimated Story Points**: 26 points total (US1=11, US2=8, US3=7 already implemented)
- US1 (Cart pruning): 11 points (sync + scan + decide + remove + report)
- US2 (History sync): 8 points (extraction + merge + deduplication)
- US3 (LLM validation): 7 points (ALREADY IMPLEMENTED in llm-enhancer.ts - no new work)

**Adjusted Total**: 26 points (19 points new work + 7 points existing LLM validation reuse)

---

## Sprint Mapping

### Sprint Allocation Strategy
- **Points per Sprint**: 13 points (default from sprint config)
- **Total Feature Points**: 26 points (US1=11, US2=8, US3=7)
- **Estimated Sprints**: 2 sprints (26 / 13 = 2.0)

### Sprint Breakdown

**Sprint 1: Foundation + Core Workflow (13 points)**
- Phase 0: Setup (2 points)
  - T001: Selector discovery for order history page (1 point)
  - T002: Selector discovery for cart removal buttons (1 point)
- Phase 1: Foundation (6 points)
  - T003: Implement syncPurchaseHistory() (3 points) - includes BrowserMCP extraction, JSON merge, deduplication
  - T004: Implement removeCartItems() (3 points) - includes BrowserMCP click workflow, modal handling, verification
- Phase 2: Core Workflow (5 points)
  - T005: Implement pruneCart() orchestration (3 points) - glue sync → scan → decide → remove
  - T006: Integration tests for full workflow (2 points) - mock BrowserMCP, test error paths

**Sprint 2: Polish + E2E (13 points)**
- Phase 3: Reporting + Validation (7 points)
  - T007: Implement generatePruningReport() (2 points) - pure function, bucket decisions
  - T008: Unit tests for report generation (1 point)
  - T009: E2E tests with real Auchan.pt (4 points) - live browser, credentials, manual verification
- Phase 4: Documentation + Refinement (6 points)
  - T010: Update CLAUDE.md with pruning workflow (1 point)
  - T011: Create automation/harness/PRUNE-CART.md (2 points) - document workflow, selectors, token optimization
  - T012: Performance testing + optimization (3 points) - measure token consumption, execution time, optimize if needed

**Sprint Allocation Notes**:
- US3 (LLM validation) is already implemented in existing llm-enhancer.ts (506 lines) - no sprint allocation needed
- Tests are distributed across sprints (Article III compliance: test-first)
- E2E tests in Sprint 2 (requires foundation complete, manual execution)
- Documentation tasks in Sprint 2 (after implementation stabilizes)

---

## Quickstart for Developers

See [quickstart.md](./quickstart.md) for detailed guide.

### Prerequisites
1. Node.js 18+ with TypeScript 5.3+
2. BrowserMCP extension installed and connected
3. Auchan.pt account with order history (for E2E tests)
4. Purchase history file exists: `data/memory/household-demo/purchase-history.json` (created on first run if missing)

### Setup Steps
1. Checkout feature branch: `git checkout feature/003-browsermcp-stock-pruning`
2. Install dependencies: `npm install` (if package.json changed)
3. Build TypeScript: `npm run build`
4. Run via Claude Code (dev mode):
   - Open browser to Auchan.pt, log in manually
   - In Claude Code session: `/prune-cart`
5. Review output: `cat runs/{timestamp}/pruning-report.json`

### Key Files to Read First
1. **Sprints/Specs/003-browsermcp-stock-pruning/spec.md** - Understand user stories, functional requirements, business rules
2. **Sprints/Specs/003-browsermcp-stock-pruning/research.md** - Understand technical decisions (why we reuse scanCartTool, why incremental sync, why existing heuristics)
3. **src/agents/stock-pruner/heuristics.ts** (lines 781-822) - `processCartItems()` interface (input/output types)
4. **src/agents/stock-pruner/llm-enhancer.ts** (lines 146-524) - `LLMEnhancer` class interface
5. **src/agents/cart-builder/tools/scan-cart.ts** (lines 227-371) - Cart extraction pattern to follow
6. **automation/harness/MERGE-ORDERS.md** - Token optimization strategies to apply

### Running Tests
```bash
# Unit tests (heuristics already tested)
npm run test src/agents/stock-pruner/heuristics.test.ts

# Integration tests (create during implementation)
npm run test src/agents/stock-pruner/orchestrator.test.ts
npm run test src/agents/stock-pruner/tools/sync-purchase-history.test.ts

# E2E tests (requires Auchan credentials)
npm run test:e2e src/agents/stock-pruner/e2e/prune-cart.e2e.test.ts
```

### Local Development
```bash
# Watch mode during development
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Full check (typecheck + lint + test)
npm run check
```

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Auchan.pt selector changes** | High (breaks extraction/removal) | Medium | Use selector registry with fallback chains, discovery tool to capture new selectors, automated E2E tests detect breaks early |
| **Purchase history grows too large** | Medium (slow parsing, high memory) | Low | Incremental sync keeps extraction time constant, in-memory Map indexing scales to 10k records, pagination in extraction if needed |
| **LLM API cost exceeds budget** | Medium (expensive per run) | Medium | Batch LLM validation (max 20 items), skip high-confidence KEEP decisions (safe), fallback to heuristics-only on error |
| **BrowserMCP token consumption** | High (context window exhaustion) | Medium | Follow token optimization patterns (skip intermediate snapshots, grep extraction, direct URLs), measure actual consumption in E2E tests |
| **Item removal fails silently** | High (cart corruption) | Low | Verify cart count decreases, capture screenshots before/after, continueOnError=false for critical removals, reversible via /merge-orders |
| **Network timeouts during sync** | Medium (stale history) | Medium | Fall back to cached data with warning, retry with exponential backoff (3 attempts), increase pageLoadTimeout for slow connections |
| **Product name matching fails** | Medium (false negatives) | Medium | Fuzzy matching with normalizeProductName(), fallback to productId when available, log match failures for manual review |
| **Heuristics confidently wrong** | High (remove needed items) | Low | LLM validates ALL prune decisions (catches seasonality, bundles, trends), user review of REVIEW bucket, reversible via /merge-orders |

---

## Success Criteria

From [spec.md § 5](./spec.md#5-success-criteria):

### Primary (Infrastructure & Correctness)

| Criterion | Target | Acceptable Range | Measurement |
|-----------|--------|------------------|-------------|
| Cart extraction accuracy | 100% of visible items extracted | 95-100% | Manual verification against cart page in E2E tests |
| History sync completeness | All new orders captured | 100% | Compare JSON records to order history page (count orders, count products) |
| Item matching accuracy | 90% of items matched to history | 85-100% | Review match results for sample cart in integration tests |
| Heuristic accuracy | 85% of removals validated as correct | 80-90% | User feedback on whether removed items were actually needed (manual review) |
| LLM reasoning quality | 80% of uncertain items have helpful explanations | 70-90% | User subjective rating of llmReasoning clarity |

### Secondary (Operational Quality)

| Criterion | Target | Acceptable Range | Measurement |
|-----------|--------|------------------|-------------|
| Execution time | < 3 minutes for typical 77-item cart | 2-5 minutes | Time from command start to JSON report output (logged) |
| Token consumption | < 50k tokens per run | 30k-70k | BrowserMCP snapshot sizes + LLM API token counts (logged) |
| JSON report generation | Report written to file within 5 seconds | 2-10 seconds | Time from pruning complete to JSON file ready (logged) |
| Cart reduction rate | ~40% of merged items removed | 30-50% | finalCartSize / initialCartSize (measured in E2E tests) |

### Acceptance Criteria

**The feature is successful when:**
1. User can run `/prune-cart` on a merged cart and see intelligent removals (verified in E2E test)
2. All removals have clear, auditable reasoning in JSON report (verified by checking llmReasoning and reason fields)
3. Purchase history stays current without manual CSV imports (verified by sync incrementing recordCount)
4. Works in both interactive (Claude Code) and autonomous modes (verified by testing pluggable LLM design)
5. Uncertain items are documented in JSON with heuristic + LLM reasoning (verified by checking reviewRequired array)
6. User can handle uncertain items via browser session or future chat interface (design supports both - chat interface deferred to future spec)

---

## Notes

**Token Optimization Critical**: BrowserMCP snapshots for 77-item cart can exceed 100k characters. Must follow patterns from automation/harness/MERGE-ORDERS.md:
- Skip intermediate snapshots (only auth check + final verification)
- Use grep for element extraction (not full snapshot parsing)
- Extract UUIDs for direct URLs (order history pagination)

**LLM Validation Architecture**: Existing llm-enhancer.ts already validates ALL prune decisions per spec requirement US3. High-confidence KEEP decisions are the only items that skip validation (safe - worst case we order something unnecessary, caught in user review). This catches seasonality, bundle relationships, trend shifts that deterministic heuristics miss.

**Purchase History Freshness**: Spec requires incremental sync before each prune run (BR002), but first run must extract all available history. Implementation should check lastSyncTimestamp and extract accordingly. Backup created before each write (purchase-history.{timestamp}.backup.json).

**Reversibility**: All removals are reversible by re-running `/merge-orders` to restore cart from order history. This is a safety feature, not a bug - users can recover from mistakes.

**Test-First Compliance**: Article III requires tests before implementation. Phase structure ensures this: Setup phase includes test data preparation, each user story has test tasks (T006, T008, T009) before or alongside implementation tasks. Integration and E2E tests validate end-to-end behavior.

**Selector Registry**: Never hardcode selectors. Use selector registry pattern from BrowserMCP-I-001. Phase 0 includes discovery tasks (T001, T002) to capture selectors before implementation begins.

**Error Handling**: All async functions implement graceful degradation:
- Sync fails → fall back to cached purchase history (log warning)
- LLM unavailable → fall back to heuristics-only decisions
- Item removal fails → log error, continue with other items (continueOnError=true)
- Auth lost → stop workflow, report to user (manual re-login required)
