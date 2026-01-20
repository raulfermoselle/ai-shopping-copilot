# Task Breakdown: BrowserMCP Stock Pruning

**Feature ID**: 003-browsermcp-stock-pruning
**Date**: 2026-01-19
**Specification**: [spec.md](./spec.md)
**Implementation Plan**: [plan.md](./plan.md)

---

## Summary

This task breakdown translates the implementation plan into executable tasks following Test-First principles. The feature connects existing StockPruner heuristics to BrowserMCP, enabling intelligent cart pruning by removing recently-purchased items that don't need reordering yet.

**Key Context**:
- **Total Effort**: 24.5 story points (new work, Sprint 1) + 7 points (Sprint 2) = 31.5 points total
- **Code Reuse**: 90% - scanCartTool, processCartItems, LLMEnhancer all exist
- **New Components**: Orchestration, purchase history sync, cart item removal, report generation
- **Sprints**: 2 sprints recommended (24.5 points Sprint 1, 7 points Sprint 2)

---

## Phase Overview

| Phase | Task Count | Story Points | Parallelizable | Description |
|-------|-----------|--------------|----------------|-------------|
| Setup | 2 | 2 | 2 | Selector discovery for order history and cart removal |
| Foundation | 9 | 13 | 4 | Build sync tool, removal tool, test infrastructure, validate US3 |
| User Story 1 | 6 | 9.5 | 2 | Core pruning workflow (scan → decide → remove → report) |
| User Story 2 | Integrated | 0 | - | History sync (implemented in Foundation phase) |
| Polish | 3 | 7 | 2 | E2E tests, documentation |
| **Total** | **20** | **31.5** | **10** | 4 phases, US3 validated in Foundation |

**Note**: US3 (LLM validation) is already complete in llm-enhancer.ts (506 lines). No new tasks needed.

---

## Task List

### Phase 0: Setup (2 tasks, 2 points)

**Purpose**: Discover and document selectors before implementation begins.

- [ ] T001 [P] Discover selectors for order history page | data/selectors/pages/order-history/v1.json
- [ ] T002 [P] Discover selectors for cart removal buttons | data/selectors/pages/cart/v1.json

---

### Phase 1: Foundation (9 tasks, 9 points)

**Purpose**: Build data sync and cart manipulation infrastructure with full test coverage.

- [ ] T003 Create test data fixtures for purchase history sync | src/agents/stock-pruner/__tests__/fixtures/purchase-history.json
- [ ] T004 [P] Create comprehensive unit tests for syncPurchaseHistory (6+ error scenarios) | src/agents/stock-pruner/__tests__/sync-purchase-history.test.ts
- [ ] T005 [P] Create comprehensive unit tests for removeCartItems (6+ error scenarios) | src/agents/stock-pruner/__tests__/remove-cart-items.test.ts
- [ ] T006 Implement syncPurchaseHistory with BrowserMCP extraction | src/agents/stock-pruner/tools/sync-purchase-history.ts
- [ ] T007 Implement removeCartItems with BrowserMCP interaction | src/agents/stock-pruner/tools/remove-cart-items.ts
- [ ] T008 Add PurchaseHistorySyncStatus type definition | src/agents/stock-pruner/types.ts
- [ ] T009 Create JSON merge logic with deduplication | src/agents/stock-pruner/tools/merge-purchase-records.ts
- [ ] T010 Verify llm-enhancer validates ALL prune decisions per US3 specification | src/agents/stock-pruner/llm-enhancer.ts
- [ ] T011 Verify Foundation tests pass with full coverage | src/agents/stock-pruner/__tests__/

---

### Phase 2: User Story 1 - Core Pruning Workflow (6 tasks, 9.5 points)

**Purpose**: Orchestrate complete pruning workflow from cart scan through removal and reporting.

- [ ] T012 [US1] Create integration test fixtures for full workflow | src/agents/stock-pruner/__tests__/fixtures/cart-snapshot.json
- [ ] T013 [US1] [P] Create unit tests for pruneCart orchestration | src/agents/stock-pruner/__tests__/orchestrator.test.ts
- [ ] T014 [US1] [P] Create unit tests for generatePruningReport | src/agents/stock-pruner/__tests__/report-generator.test.ts
- [ ] T015 [US1] Implement pruneCart orchestration function | src/agents/stock-pruner/orchestrator.ts
- [ ] T016 [US1] Implement generatePruningReport with classification | src/agents/stock-pruner/report-generator.ts
- [ ] T017 [US1] Verify integration tests pass end-to-end | src/agents/stock-pruner/__tests__/orchestrator.test.ts

---

### Phase 3: Polish (3 tasks, 4 points)

**Purpose**: Add E2E validation and documentation.

- [ ] T018 [POLISH] [P] Create E2E test with real Auchan.pt session | src/agents/stock-pruner/__tests__/e2e/prune-cart.e2e.test.ts
- [ ] T019 [POLISH] [P] Update CLAUDE.md with pruning workflow overview | src/agents/stock-pruner/CLAUDE.md
- [ ] T020 [POLISH] Create automation harness documentation | automation/harness/PRUNE-CART.md

---

## Sprint Allocation

### Sprint 1: Foundation + Core Complete (24.5 points)
**Tasks**: T001-T017

**Deliverables**:
- Selector discovery complete
- Purchase history sync working
- Cart item removal working
- US3 llm-enhancer validation complete
- Orchestration implemented
- Report generation implemented
- All unit and integration tests passing
- Cart count balance validation verified

**Critical Path**: T001/T002 → T003 → T004/T005 → T006/T007 → T008/T009 → T010 → T011 → T012 → T013/T014 → T015/T016 → T017

### Sprint 2: Polish & Validation (7 points)
**Tasks**: T018-T020

**Deliverables**:
- E2E tests with real Auchan.pt
- Documentation complete (CLAUDE.md, harness docs)

**Critical Path**: T018 → T019/T020

---

## MVP Scope Recommendation

**Minimum Viable Product**: Setup + Foundation + US1 Complete (T001-T017)

**Includes**:
- Purchase history sync from Auchan.pt
- Cart scanning via existing scanCartTool
- Heuristics + LLM validation (validated compatibility in T010)
- Item removal via BrowserMCP
- Complete report generation with classification
- Full integration test coverage

**Excludes** (deferred to Sprint 2):
- E2E tests with live Auchan.pt
- Documentation (CLAUDE.md, harness docs)

**Value**: Fully functional pruning workflow with comprehensive test coverage. Can deploy to production. Missing only E2E validation and documentation polish.

---

## Dependency Graph

```
[Critical Path - Sequential Execution Required]

T001 (Order History Selectors)
T002 (Cart Removal Selectors)
  ↓
T003 (Test Fixtures)
  ↓
T004 (Sync Tests) ─┐
T005 (Remove Tests)├─► [Parallel: Write tests before implementation]
  ↓                │
T006 (Sync Impl) ──┤
T007 (Remove Impl)─┘
  ↓
T008 (Type Updates)
T009 (JSON Merge)
  ↓
T010 (Foundation Verification)
  ↓
T011 (Integration Fixtures)
  ↓
T012 (Orchestrator Tests) ─┐
T013 (Report Tests)        ├─► [Parallel: Test before implementation]
  ↓                        │
T014 (Orchestrator Impl) ──┤
T015 (Report Impl) ────────┘
  ↓
T017 (Integration Verification)
  ↓
T018 (E2E Tests) ──┐
T019 (CLAUDE.md)   ├─► [Parallel: Polish tasks independent]
T020 (Harness Doc)─┘

[Parallel Opportunities]
- T001 + T002 (different pages)
- T004 + T005 (different functions)
- T013 + T014 (different modules)
- T019 + T020 (independent polish)
```

---

## Execution Strategy

### 1. Test-First Enforcement
**Article III Compliance**: All implementation tasks have corresponding test tasks that MUST complete first.

| Implementation Task | Prerequisite Test Task | Blocker? |
|---------------------|------------------------|----------|
| T006 (Sync Impl) | T004 (Sync Tests) | Yes - cannot implement without tests |
| T007 (Remove Impl) | T005 (Remove Tests) | Yes - cannot implement without tests |
| T014 (Orchestrator) | T012 (Orchestrator Tests) | Yes - cannot implement without tests |
| T015 (Report Gen) | T013 (Report Tests) | Yes - cannot implement without tests |
| T017 (E2E) | All unit/integration tests | Yes - validates complete system |

### 2. Parallel Execution Windows

**Window 1: Selector Discovery (Phase 0)**
- Run T001 and T002 in parallel (different pages, no dependencies)
- Estimated time: 2-3 hours total (1.5 hours each)

**Window 2: Test Writing (Phase 1)**
- After T003 fixtures complete, run T004 and T005 in parallel
- Estimated time: 3-4 hours total (2 hours each)

**Window 3: Unit Test Writing (Phase 2)**
- After T011 fixtures complete, run T012 and T013 in parallel
- Estimated time: 2-3 hours total (1.5 hours each)

**Window 4: Polish (Phase 3)**
- Run T019, T020 in parallel after T018 complete
- Estimated time: 3-4 hours total (varies per task)

### 3. Verification Checkpoints

| Checkpoint | Tasks | Verification |
|------------|-------|--------------|
| Foundation Ready | T001-T011 | npm run test passes, sync + removal work in isolation |
| Core Complete | T012-T017 | Full workflow works (mocked BrowserMCP), integration tests pass |
| Production Ready | T018-T020 | E2E tests pass with live Auchan.pt, docs complete |

### 4. Error Handling Strategy

Each phase includes error recovery patterns:

**Phase 1 (Foundation)**:
- Sync failures → fall back to existing purchase-history.json
- Removal failures → log error, continue with other items (continueOnError=true)
- File I/O errors → create backups, validate before write

**Phase 2 (Core)**:
- Orchestration errors → return partial results with error details
- LLM unavailable → fall back to heuristics-only
- Cart scan failures → retry with screenshot capture

**Phase 3 (Polish)**:
- E2E flakiness → retry logic with exponential backoff
- Documentation gaps → reference existing patterns from BrowserMCP-I-001

---

## Task Execution Details

### T001: Discover selectors for order history page

**Story Points**: 1

**Description**: Manually inspect Auchan.pt order history page, capture screenshots, identify stable selectors for order list, order detail links, pagination controls. Follow selector registry pattern from BrowserMCP-I-001.

**Acceptance Criteria**:
- v1.json file created with primary + 2 fallback selectors for each element
- Screenshots captured in `data/selectors/pages/order-history/screenshots/`
- Selectors scored by stability (data-testid > aria > id > class > text)
- Entry added to `data/selectors/registry.json`

**File**: `data/selectors/pages/order-history/v1.json`

---

### T002: Discover selectors for cart removal buttons

**Story Points**: 1

**Description**: Inspect Auchan.pt cart page, identify remove buttons, quantity controls, cart total. Update existing cart/v1.json with new selectors for removal workflow.

**Acceptance Criteria**:
- Cart removal button selectors added to existing `data/selectors/pages/cart/v1.json`
- Screenshots captured showing remove button states (default, hover, disabled)
- Fallback selectors for button text variations ("Remover", "Eliminar", etc.)
- Selectors tested manually via browser console

**File**: `data/selectors/pages/cart/v1.json`

---

### T003: Create test data fixtures for purchase history sync

**Story Points**: 0.5

**Description**: Create mock purchase history JSON files with known data for testing sync logic. Include edge cases (duplicate orders, missing fields, date formats).

**Acceptance Criteria**:
- `purchase-history-existing.json` with 50 records
- `purchase-history-empty.json` (first sync scenario)
- `order-list-response.json` (mock order list HTML)
- `order-detail-response.json` (mock order detail HTML)
- All fixtures valid per PurchaseRecord schema

**File**: `src/agents/stock-pruner/__tests__/fixtures/purchase-history.json`

---

### T004: Create comprehensive unit tests for syncPurchaseHistory (6+ error scenarios)

**Story Points**: 2

**Description**: Write comprehensive unit tests for purchase history sync covering incremental sync, full sync, deduplication, error handling (6 scenarios), backup creation, and infinite-scroll cart loading ("ver mais" button).

**Acceptance Criteria**:
- Tests for incremental sync (lastSyncDate provided)
- Tests for full sync (lastSyncDate null)
- Tests for deduplication (same orderId + productName)
- Tests for error scenarios (6 cases):
  - AuthenticationError (session lost)
  - OrderHistoryNotFound (page navigation fails)
  - ParsingError (unexpected HTML structure)
  - FileIOError (corrupt file, no disk space)
  - TimeoutError (network timeout)
  - BackupError (backup creation fails)
- Tests for backup creation (success and failure)
- Tests for infinite-scroll handling ("ver mais" button triggers full cart load)
- 80%+ code coverage target

**File**: `src/agents/stock-pruner/__tests__/sync-purchase-history.test.ts`

---

### T005: Create comprehensive unit tests for removeCartItems (6+ error scenarios)

**Story Points**: 2

**Description**: Write comprehensive unit tests for cart item removal covering single item, batch removal, error scenarios (6+ cases), modal handling, cart count verification.

**Acceptance Criteria**:
- Tests for single item removal (happy path)
- Tests for batch removal with continueOnError
- Tests for error scenarios (6 cases):
  - NOT_FOUND (item not in cart)
  - CLICK_FAILED (button click fails)
  - VERIFICATION_FAILED (cart count mismatch)
  - TIMEOUT (removal operation timeout)
  - AuthenticationError (session lost mid-removal)
  - UNKNOWN (unexpected error)
- Tests for confirmation modal handling (if present)
- Tests for cart count balance verification (initial - removed = final)
- Mock BrowserMCP page interactions
- 80%+ code coverage target

**File**: `src/agents/stock-pruner/__tests__/remove-cart-items.test.ts`

---

### T006: Implement syncPurchaseHistory with BrowserMCP extraction

**Story Points**: 3

**Description**: Implement purchase history sync function that navigates to order history, extracts order UUIDs, fetches details for new orders, merges into existing JSON with deduplication.

**Acceptance Criteria**:
- Function signature matches contracts/api.yaml
- Navigates to order history page via BrowserMCP
- Extracts order list with pagination support
- Fetches order details for orders newer than lastSyncDate
- Merges new records with deduplication by (orderId + productName)
- Creates backup before writing
- Returns SyncPurchaseHistoryResult with statistics
- All unit tests pass (T004)

**File**: `src/agents/stock-pruner/tools/sync-purchase-history.ts`

**Dependencies**: T001 (selectors), T003 (fixtures), T004 (tests)

---

### T007: Implement removeCartItems with BrowserMCP interaction

**Story Points**: 3

**Description**: Implement cart item removal function that locates items by name, clicks remove buttons, handles modals, verifies removal.

**Acceptance Criteria**:
- Function signature matches contracts/api.yaml
- Locates item rows by product name (normalized matching)
- Clicks remove button via BrowserMCP
- Handles confirmation modals if present
- Verifies cart count decreased
- Batch removal with delay between clicks
- Returns RemoveItemsResult with success/failure details
- All unit tests pass (T005)

**File**: `src/agents/stock-pruner/tools/remove-cart-items.ts`

**Dependencies**: T002 (selectors), T003 (fixtures), T005 (tests)

---

### T008: Add PurchaseHistorySyncStatus type definition

**Story Points**: 0.5

**Description**: Add new type definitions for purchase history sync status to stock-pruner types file.

**Acceptance Criteria**:
- PurchaseHistorySyncStatus interface added
- PurchaseHistoryFile wrapper type added (wraps records + syncStatus)
- Zod schemas for runtime validation
- JSDoc comments explaining fields
- Exports added to index.ts

**File**: `src/agents/stock-pruner/types.ts`

---

### T009: Create JSON merge logic with deduplication

**Story Points**: 1

**Description**: Implement pure function to merge new purchase records into existing history with deduplication and sorting.

**Acceptance Criteria**:
- Function: mergePurchaseRecords(existing, new) → merged
- Deduplicates by (orderId + productName)
- Sorts by purchaseDate descending
- Updates syncStatus metadata
- Validates records with Zod schema
- Unit tests for edge cases (duplicates, empty arrays)

**File**: `src/agents/stock-pruner/tools/merge-purchase-records.ts`

---

### T010: Verify llm-enhancer validates ALL prune decisions per US3 specification

**Story Points**: 0.5

**Description**: Verify that existing llm-enhancer.ts implementation validates ALL prune decisions (REVIEW + AUTO_REMOVE) per US3 acceptance criteria. If implementation doesn't match spec, document required refactoring in dedicated tasks.

**Acceptance Criteria**:
- Read llm-enhancer.ts lines 374-383 (prepareItemsForPrompt filtering logic)
- Verify: Items with `decision IN [REVIEW, AUTO_REMOVE]` are sent to LLM
- Verify: Items with `decision=KEEP` and `confidence >=0.8` are skipped (safe optimization)
- Confirm interface accepts CartItemForPruning schema
- Confirm output includes llmReasoning, llmConfidenceAdjustment, wasLLMEnhanced fields
- If gaps found: Create follow-up tasks (T010a, T010b, etc.) with detailed refactoring requirements
- If implementation correct: Document validation results, proceed to T011

**File**: `src/agents/stock-pruner/llm-enhancer.ts`

**Dependencies**: T001-T009 complete (understand data models first)

---

### T011: Verify Foundation tests pass with full coverage

**Story Points**: 0.5

**Description**: Run all Foundation phase tests, verify coverage meets targets, fix any failing tests.

**Acceptance Criteria**:
- All tests in T004, T005 pass
- Code coverage >= 80% for sync-purchase-history.ts and remove-cart-items.ts
- No type errors (npm run typecheck)
- No lint errors (npm run lint)
- Integration smoke test passes (sync + remove in isolation)

**File**: `src/agents/stock-pruner/__tests__/`

**Dependencies**: T004-T009 complete

---

### T012: Create integration test fixtures for full workflow

**Story Points**: 0.5

**Description**: Create mock cart snapshots and expected pruning decisions for testing orchestration workflow.

**Acceptance Criteria**:
- Mock CartSnapshot with 77 items (from scanCartTool format)
- Expected PruneDecision[] for each item
- Mock LLM enhancement responses
- Expected PruningReport output
- Fixtures cover edge cases (all KEEP, all REMOVE, mixed)

**File**: `src/agents/stock-pruner/__tests__/fixtures/cart-snapshot.json`

**Dependencies**: T011 (Foundation complete)

---

### T013: Create unit tests for pruneCart orchestration

**Story Points**: 2

**Description**: Write integration tests for full pruning workflow covering sync → scan → decide → remove → report pipeline.

**Acceptance Criteria**:
- Tests for happy path (full workflow)
- Tests for shouldSyncHistory=false (skip sync)
- Tests for autoRemoveEnabled=false (dry run)
- Tests for LLM enhancement enabled/disabled
- Tests for error scenarios (sync failed, cart not found)
- Mock all external dependencies (BrowserMCP, file I/O)
- 70%+ code coverage target

**File**: `src/agents/stock-pruner/__tests__/orchestrator.test.ts`

**Dependencies**: T012 (fixtures)

---

### T014: Create unit tests for generatePruningReport

**Story Points**: 1

**Description**: Write unit tests for report generation covering decision classification, cart count balance, metadata inclusion.

**Acceptance Criteria**:
- Tests for correct classification (KEEP, REVIEW, AUTO_REMOVE)
- Tests for cart count balance validation
- Tests for preClassified optimization path
- Tests for empty cart scenario
- Tests for all fields present in output
- Pure function (no I/O mocking needed)

**File**: `src/agents/stock-pruner/__tests__/report-generator.test.ts`

**Dependencies**: T012 (fixtures)

---

### T015: Implement pruneCart orchestration function

**Story Points**: 3

**Description**: Implement main orchestration function that coordinates sync → scan → decide → remove → report workflow with error handling.

**Acceptance Criteria**:
- Function signature matches contracts/api.yaml
- Phase 1: Sync purchase history (if shouldSyncHistory=true)
- Phase 2: Scan cart via scanCartTool (reuse existing)
- Phase 3: Run heuristics via processCartItems (reuse existing)
- Phase 4: Apply LLM enhancement via LLMEnhancer (reuse existing)
- Phase 5: Remove items if autoRemoveEnabled=true
- Phase 6: Generate and save pruning report
- Returns PruneCartResult with summary statistics
- All integration tests pass (T013)

**File**: `src/agents/stock-pruner/orchestrator.ts`

**Dependencies**: T006, T007, T013 (tests)

---

### T016: Implement generatePruningReport with classification

**Story Points**: 2

**Description**: Implement report generation function that buckets decisions, adds metadata, validates cart count balance.

**Acceptance Criteria**:
- Function signature matches contracts/api.yaml
- Classifies decisions into autoRemoved, reviewRequired, kept
- Adds timestamp, cart counts, sync status
- Validates cart count balance (initial - removed = final)
- Supports preClassified optimization path
- Pure function (no side effects)
- All unit tests pass (T014)

**File**: `src/agents/stock-pruner/report-generator.ts`

**Dependencies**: T014 (tests)

---

### T017: Verify integration tests pass end-to-end

**Story Points**: 1

**Description**: Run full integration test suite, verify all components work together, fix any integration issues.

**Acceptance Criteria**:
- All tests in T013 pass with mocked BrowserMCP
- Workflow executes sync → scan → decide → remove → report
- Error scenarios handled gracefully (sync fail → cached data, LLM unavailable → heuristics)
- Coverage >= 70% for orchestrator.ts and report-generator.ts
- No type errors or lint warnings
- Assert cart count balance: finalCartCount = initialCartCount - autoRemoved.length
- Performance targets met (< 3 minutes for mocked 77-item cart)

**File**: `src/agents/stock-pruner/__tests__/orchestrator.test.ts`

**Dependencies**: T015, T016 complete

---

### T018: Create E2E test with real Auchan.pt session

**Story Points**: 4

**Description**: Write E2E test that runs full pruning workflow against live Auchan.pt with real credentials, validates cart state changes.

**Acceptance Criteria**:
- Test setup: Login to Auchan.pt, merge orders (prerequisite state)
- Test execution: Run pruneCart() with real BrowserMCP
- Test verification: Check cart count decreased, removed items gone, report generated
- Test teardown: Restore cart via /merge-orders (reversibility test)
- Screenshots captured for manual inspection
- Test marked as manual-only (requires credentials)
- Validation: Cart reduction 30-50%, execution time < 3 minutes

**File**: `src/agents/stock-pruner/__tests__/e2e/prune-cart.e2e.test.ts`

**Dependencies**: T017 (integration tests pass)

**Note**: Manual execution only, not part of CI/CD

---

### T019: Update CLAUDE.md with pruning workflow overview

**Story Points**: 1

**Description**: Create or update stock-pruner module CLAUDE.md with workflow overview, key concepts, important files, gotchas.

**Acceptance Criteria**:
- Module purpose (1-2 sentences)
- Key concepts (heuristics, LLM validation, purchase history sync)
- Important files table (orchestrator, tools, types)
- Patterns (token optimization, state capture, error recovery)
- Gotchas (product name matching, LLM modes, cart count balance)
- Links to automation harness and planning artifacts

**File**: `src/agents/stock-pruner/CLAUDE.md`

**Dependencies**: T018 (implementation complete)

---

### T020: Create automation harness documentation

**Story Points**: 2

**Description**: Document pruning workflow in automation/harness/PRUNE-CART.md following MERGE-ORDERS.md pattern. Include URL patterns, selectors, token optimization strategies.

**Acceptance Criteria**:
- Workflow steps documented (sync → scan → decide → remove → report)
- URL patterns for order history, cart
- Selector patterns (removal buttons, cart count)
- Token optimization strategies (skip snapshots, grep extraction)
- Error recovery procedures (auth loss, selector changes)
- Example commands for debugging
- Screenshots showing key UI states

**File**: `automation/harness/PRUNE-CART.md`

**Dependencies**: T018 (E2E test provides real-world workflow)

---

---

## Critical Files for Implementation

Based on this task breakdown, here are the 5 most critical files for implementing this plan:

1. **src/agents/stock-pruner/orchestrator.ts** - Core orchestration logic that coordinates entire workflow (T014, 3 points)
2. **src/agents/stock-pruner/tools/sync-purchase-history.ts** - BrowserMCP extraction of order history, critical for fresh data (T006, 3 points)
3. **src/agents/stock-pruner/tools/remove-cart-items.ts** - BrowserMCP cart manipulation, critical for execution phase (T007, 3 points)
4. **src/agents/cart-builder/tools/scan-cart.ts** - Existing cart scanner to reuse (pattern to follow for BrowserMCP interactions)
5. **src/agents/stock-pruner/heuristics.ts** - Existing heuristics to integrate (processCartItems interface, lines 781-822)

---

## Next Steps

1. ✅ Review tasks.md for accuracy and completeness
2. Run `/speckit-analyze 003-browsermcp-stock-pruning` for consistency check (optional)
3. Run `/sprint-new StockPruner I 001` to create first sprint
4. Copy tasks T001-T014 to Sprint StockPruner-I-001 SPRINT-PLAN.md
5. Run `/sprint-start` to begin execution with Phase 0 (Selector Discovery)
