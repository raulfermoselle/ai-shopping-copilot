# Design Checklist: BrowserMCP Stock Pruning

**Feature**: 003-browsermcp-stock-pruning
**Date**: 2026-01-19
**Status**: Planning Phase

---

## Purpose

This checklist validates the design phase before implementation begins. All items must be checked off before moving to task generation (`/speckit-tasks`).

---

## Constitution Compliance

- [ ] **Article I (Sprint-First)**: Feature work organized within sprint structure
  - Sprint mapping allocates 26 points across 2 sprints (13 points each)
  - Tasks fit within context window (12 tasks total, 5-7 per sprint)

- [ ] **Article II (Spec-Driven)**: Implementation follows specification
  - Specification complete (spec.md) with 3 user stories (US1, US2, US3)
  - Plan derived from specification (this plan.md)
  - Tasks will be generated via `/speckit-tasks` (next step)

- [ ] **Article III (Test-First)**: Test strategy defined and prioritized
  - Unit tests: Heuristics (already tested), report generation, product matching
  - Integration tests: Sync, orchestration, error handling
  - E2E tests: Live Auchan.pt workflow (auth → sync → scan → decide → remove → report)
  - Test tasks ordered before implementation tasks in phase structure

- [ ] **Article IV (Autonomous Execution)**: All context documented
  - Research complete (research.md) - 5 technical questions resolved
  - Data model complete (data-model.md) - 5 entities defined
  - API contracts complete (contracts/api.yaml) - 4 function interfaces specified
  - Quickstart guide complete (quickstart.md)
  - No open questions in specification

- [ ] **Article VI (Simplicity)**: No premature abstraction
  - Reuses existing components (scanCartTool, processCartItems, LLMEnhancer)
  - Adds only necessary new functions (4: syncPurchaseHistory, pruneCart, removeCartItems, generatePruningReport)
  - No new abstractions for single use cases

- [ ] **Article X (Deadlock Handling)**: Blockers identified with fallbacks
  - Sync failure → fall back to cached purchase history
  - LLM unavailable → fall back to heuristics-only decisions
  - Item removal failure → continue with other items (continueOnError=true)
  - Auth failure → stop and report (manual intervention required)

---

## Data Model Validation

- [ ] **Entity Definitions Complete**
  - CartItem (from cart-builder) - reused as-is
  - PurchaseRecord (from stock-pruner) - reused as-is
  - PruneDecision (from stock-pruner) - reused as-is
  - PurchaseHistorySyncStatus - NEW entity, fields defined
  - PruningReport - NEW entity, fields defined

- [ ] **Relationships Mapped**
  - One-to-many: Order → PurchaseRecord[] (via orderId)
  - One-to-many: PruningReport → PruneDecision[] (embedded arrays)
  - One-to-one: purchase-history.json ↔ PurchaseHistorySyncStatus

- [ ] **State Transitions Documented**
  - PruneDecision state machine: Heuristic → LLM Enhanced → Classification → KEEP/REVIEW/AUTO_REMOVE → Execution
  - Transition rules defined (confidence thresholds, LLM validation criteria)
  - Terminal states identified (KEEP, Executed)

- [ ] **Business Rules Captured**
  - Confidence range validation (0-1)
  - Decision enum mapping (conf <0.6 = KEEP, 0.6-0.8 = REVIEW, >0.8 = AUTO_REMOVE)
  - Unique order records (orderId + productName)
  - Non-negative quantities
  - Valid ISO 8601 dates

- [ ] **Storage Strategy Defined**
  - Primary storage: File system JSON (purchase-history.json, pruning-report.json)
  - In-memory caching: Map<productName, Record[]>, LLMEnhancer analytics
  - No database indexes needed (file-based, acceptable for 2000-5000 records)

---

## API Contracts Validation

- [ ] **Function Signatures Defined**
  - `syncPurchaseHistory(page, lastSyncDate?, options?)` → SyncPurchaseHistoryResult
  - `pruneCart(context, config?)` → PruneCartResult
  - `removeCartItems(page, itemsToRemove[], options?)` → RemoveItemsResult
  - `generatePruningReport(input)` → PruningReport

- [ ] **Request/Response Schemas Specified**
  - All input parameters documented with types and validation rules
  - All return types documented with field definitions
  - Optional parameters identified (lastSyncDate, options, config)

- [ ] **Error Handling Defined**
  - Error types enumerated per function (AuthenticationError, OrderHistoryNotFound, ParsingError, etc.)
  - Recovery strategies documented for each error type
  - Error propagation vs. graceful degradation decisions made

- [ ] **Side Effects Documented**
  - File system writes: purchase-history.json, pruning-report.json, backups
  - Browser state changes: Navigation, clicks, cart modifications
  - Network requests: LLM API calls (if enabled)
  - No order placement or payment actions (safety constraint verified)

- [ ] **Examples Provided**
  - Usage examples for each function (standard case, dry-run, error handling)
  - Integration patterns documented (full session, manual orchestration, dry-run)

---

## Testing Strategy Validation

- [ ] **Unit Test Coverage Defined**
  - Target: 80%+ for new code
  - Pure functions prioritized: generatePruningReport(), normalizeProductName()
  - Existing heuristics already tested (1,223 lines) - reuse tests

- [ ] **Integration Test Scope Defined**
  - Target: 70%+ for integration paths
  - Mock BrowserMCP responses for cart scan/removal
  - Test JSON merge, deduplication, orchestration flow
  - Error path testing (sync failure, removal failure, LLM unavailable)

- [ ] **E2E Test Scenarios Identified**
  - Full workflow: auth → sync → scan → decide → remove → report
  - Error scenarios: auth failure, network timeout, item not found
  - BrowserMCP integration with real Auchan.pt
  - Manual execution only (requires credentials)

- [ ] **Test Data Prepared**
  - Mock cart snapshot (77 items from real Auchan.pt structure)
  - Mock purchase history (2000+ records with known cadences)
  - Expected decisions (pre-calculated for test cart + history)
  - Selector fixtures (from selector registry)

- [ ] **Test-First Ordering**
  - Phase 0 includes test data setup (T001, T002 - selector discovery)
  - Phase 1 includes unit tests alongside foundation (T003, T004)
  - Phase 2 includes integration tests (T006)
  - Phase 3 includes E2E tests (T009) and unit tests (T008)

---

## Technical Constraints Verification

- [ ] **BrowserMCP Patterns Applied**
  - `page.evaluate()` with string templates for bulk extraction (avoids Playwright locator timeouts)
  - Token optimization: skip intermediate snapshots, grep extraction, direct URLs
  - State capture only for auth check + final verification

- [ ] **Selector Registry Compliance**
  - Never hardcode selectors (all via selector registry)
  - Discovery tasks in Phase 0 (T001: order history, T002: cart removal)
  - Fallback chains defined (primary + 2+ fallbacks)
  - Stability scoring (data-testid > aria > role > id > class > text > positional)

- [ ] **Existing Code Reuse**
  - scanCartTool from cart-builder (cart extraction)
  - processCartItems from stock-pruner/heuristics.ts (pruning logic)
  - LLMEnhancer from stock-pruner/llm-enhancer.ts (LLM validation)
  - No modification to existing heuristics (spec requirement FR004)

- [ ] **Token Budget Awareness**
  - Target: 30k-70k tokens per run
  - BrowserMCP snapshots minimized (skip intermediate states)
  - LLM batching (max 20 items enhanced)
  - Measurement strategy: log token counts during E2E tests

- [ ] **Performance Targets Set**
  - Full workflow: < 3 minutes for 77-item cart (2-5 minutes acceptable)
  - Purchase history sync: ~500ms per order
  - Cart scan: < 2 seconds
  - Heuristics: < 100ms
  - LLM validation: ~2-3 seconds per batch
  - Item removal: ~500ms per item

---

## Error Handling & Recovery

- [ ] **Error Types Enumerated**
  - Authentication errors (session lost)
  - Network errors (timeout, connection failure)
  - Parsing errors (unexpected HTML structure)
  - File I/O errors (corrupt file, no disk space)
  - BrowserMCP errors (selector not found, click failed)
  - LLM errors (API unavailable, rate limited)

- [ ] **Recovery Strategies Defined**
  - Sync failure → fall back to cached data (log warning)
  - LLM unavailable → fall back to heuristics only
  - Item removal failure → continue with other items (continueOnError=true)
  - Auth failure → stop workflow, report to user
  - Network timeout → retry with exponential backoff (3 attempts)

- [ ] **Graceful Degradation Implemented**
  - Heuristics work without LLM (core pruning still functions)
  - Cached purchase history used if sync fails
  - Partial removals succeed (some items removed, some failed)
  - Report generated even if errors occurred (includes warnings array)

- [ ] **Logging & Observability**
  - Structured logging for all operations (sync, scan, decide, remove, report)
  - Error context captured (item name, error code, stack trace)
  - Screenshots for debugging (BrowserMCP state capture)
  - Performance metrics logged (execution time, token counts)

---

## Security & Safety

- [ ] **Safety Constraint Verified**
  - Agent NEVER places orders (stops at cart modification)
  - No interaction with checkout or payment flow
  - Removals are reversible via `/merge-orders`

- [ ] **Data Privacy**
  - All data local (no cloud sync)
  - Purchase history stays on user's machine
  - No PII in logs (product names only)
  - No credential logging (email domain only)

- [ ] **Error Messages Safe**
  - No API keys in error messages
  - No session tokens in logs
  - Cart contents safe to log (product names, prices)

---

## Documentation Completeness

- [ ] **Specification (spec.md)**
  - Executive summary clear
  - 3 user stories with acceptance scenarios
  - 13 functional requirements
  - 7 business rules
  - 5 key entities
  - Responsibility boundaries defined
  - Success criteria measurable
  - Known constraints documented
  - Out of scope items listed

- [ ] **Research (research.md)**
  - 5 research questions answered
  - Technical decisions documented with rationale
  - Alternatives considered and rejected
  - References to codebase files
  - Assumptions documented with risk assessment

- [ ] **Data Model (data-model.md)**
  - 5 entities defined with fields
  - Relationships mapped
  - State transitions documented
  - Business rules captured
  - Storage strategy defined
  - Example usage provided

- [ ] **API Contracts (contracts/api.yaml)**
  - 4 function interfaces defined
  - Request/response schemas complete
  - Error cases enumerated
  - Side effects documented
  - Integration patterns provided

- [ ] **Quickstart (quickstart.md)**
  - Architecture overview diagram
  - Technical decisions summary table
  - Key files to read first
  - Running locally instructions
  - Running tests commands
  - Implementation phases outlined

- [ ] **Plan (plan.md - this file)**
  - Summary (2 paragraphs)
  - Technical context (9 specifications)
  - Constitution check
  - Project structure
  - Research outcomes
  - Data model summary
  - API contracts summary
  - Complexity tracking
  - Sprint mapping (26 points → 2 sprints)
  - Quickstart summary
  - Risks & mitigations
  - Success criteria

---

## Implementation Readiness

- [ ] **Dependencies Clear**
  - BrowserMCP-I-001 cart merge complete (prerequisite)
  - Existing heuristics.ts tested and stable
  - LLM enhancer implemented and tested
  - scanCartTool available from cart-builder

- [ ] **No Open Questions**
  - All technical unknowns resolved in research phase
  - Spec has zero open questions section
  - All clarifications provided during spec creation

- [ ] **Task Breakdown Ready**
  - 12 tasks estimated (Setup → Foundation → Core → Polish)
  - Story points allocated (26 points total)
  - Sprint mapping complete (2 sprints, 13 points each)
  - Dependency graph identified (Phase 0 → 1 → 2 → 3)

- [ ] **Tooling Available**
  - TypeScript compiler configured
  - Vitest for unit/integration tests
  - Playwright for E2E tests
  - BrowserMCP extension installed
  - Selector registry infrastructure exists

---

## Sign-Off

**Design phase is complete when all checkboxes above are marked.**

**Next Steps:**
1. Review this checklist with stakeholders
2. Run `/speckit-tasks 003-browsermcp-stock-pruning` to generate detailed task breakdown
3. Create first sprint: `/sprint-new StockPruner I 001`
4. Begin implementation with Phase 0 (Selector discovery)

---

**Checklist Completed By**: [AI Agent / User Name]
**Completion Date**: [YYYY-MM-DD]
**Approved By**: [User Name]
**Approval Date**: [YYYY-MM-DD]
