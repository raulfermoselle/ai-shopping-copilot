# Requirements Checklist: 003-browsermcp-stock-pruning

Generated from spec.md - Use this to validate implementation completeness.

## Functional Requirements

### Core Capabilities

- [ ] **FR001**: Agent can extract all items from current cart via BrowserMCP
  - Test: Navigate to cart page, extract items, verify all visible items captured
  - Data: name, quantity, price, productId

- [ ] **FR002**: Agent handles paginated carts
  - Test: Create cart with 100+ items (multi-page), verify all pages extracted
  - Verify: No items missed, page navigation works

- [ ] **FR003**: Agent matches cart items to purchase history by productId or name
  - Test: Sample cart with 20 items, verify 90%+ match rate
  - Handle: productId exact match, name fuzzy matching, no-match fallback

- [ ] **FR004**: Agent applies existing StockPruner heuristics without modification
  - Test: Run heuristics on sample cart, verify cadence/urgency/confidence calculations
  - Verify: No changes to heuristics.ts logic

- [ ] **FR005**: Agent classifies items into AUTO-REMOVE (>0.8), REVIEW (0.6-0.8), KEEP (<0.6)
  - Test: Sample cart with known confidence scores, verify bucket assignment
  - Verify: Configurable thresholds work

- [ ] **FR006**: Agent removes items from cart via BrowserMCP
  - Test: Remove 5 items, verify they disappear from cart
  - Verify: Cart total updates correctly, no phantom items

- [ ] **FR007**: Agent incrementally syncs order history before pruning
  - Test: Run sync with 2 new orders, verify only new orders extracted
  - Verify: Existing records preserved, timestamps updated

- [ ] **FR008**: Agent creates purchase-history.json if missing
  - Test: Delete file, run command, verify fresh file created
  - Verify: All available order data extracted

- [ ] **FR009**: Agent invokes pluggable LLM layer for REVIEW bucket items
  - Test: Dev mode (Claude Code), verify direct reasoning
  - Test: Prod mode (API), verify llm-enhancer called

- [ ] **FR010**: Agent generates summary report with removal reasoning
  - Test: Run full workflow, verify report shows removed/kept items
  - Verify: Confidence scores, reasoning, final cart state present

- [ ] **FR011**: Agent logs all removal decisions
  - Test: Run workflow, verify log file exists with all decisions
  - Verify: Item name, confidence, reasoning, timestamp logged

- [ ] **FR012**: Agent presents batch summary for uncertain items
  - Test: Cart with 5 REVIEW items, verify batch summary displayed
  - Verify: User can approve/reject batch or select individual items

---

## Business Rules

- [ ] **BR001**: Agent never touches checkout or payment flow
  - Test: Verify no navigation to checkout pages
  - Test: Verify no payment button clicks

- [ ] **BR002**: Purchase history sync is incremental (only new orders)
  - Test: Run sync twice, verify second run skips existing orders
  - Exception: First run extracts all history

- [ ] **BR003**: Confidence thresholds are configurable
  - Test: Change threshold config, verify classification buckets update
  - Default: AUTO-REMOVE >0.8, REVIEW 0.6-0.8, KEEP <0.6

- [ ] **BR004**: LLM layer is pluggable (dev vs prod modes)
  - Test: Switch between modes, verify correct LLM invocation
  - Dev: Claude Code direct, Prod: llm-enhancer API

- [ ] **BR005**: Heuristics run first, LLM enhances only uncertain items
  - Test: Verify LLM not called for confidence >0.8 or <0.6
  - Verify: LLM never overrides high-confidence decisions

- [ ] **BR006**: All removals are reversible via `/merge-orders`
  - Test: Run prune, then re-run merge, verify cart restored
  - Document: User can recover removed items

- [ ] **BR007**: Agent stops on unrecoverable errors (network, auth)
  - Test: Simulate network failure during sync, verify fallback to cached data
  - Verify: Warning logged, workflow continues with caveat

---

## User Stories

### US1: Prune Recently-Purchased Items (11 points)

- [ ] Happy path: 77-item cart → ~45 items after pruning
- [ ] Uncertain items: Batch summary presented, user decision awaited
- [ ] No purchase history: Reports insufficient data
- [ ] All items needed: Keeps all items, reports low confidence
- [ ] Mixed quantities: Handles quantity differences correctly

### US2: Keep Purchase History Current (8 points)

- [ ] Happy path: 2 new orders extracted, merged into JSON
- [ ] First sync: Creates file, extracts all history
- [ ] No new orders: Skips extraction, uses cached data
- [ ] Extraction fails: Falls back to cache, logs warning

### US3: LLM-Enhanced Reasoning (7 points)

- [ ] Uncertain item: Provides reasoning for confidence 0.6-0.8
- [ ] Bundle context: Considers item relationships
- [ ] Seasonal pattern: Detects unusual timing
- [ ] Dev mode: Claude Code reasons directly
- [ ] Prod mode: llm-enhancer API called

---

## Success Criteria

### Primary

- [ ] Cart extraction accuracy: 95-100% of visible items
- [ ] History sync completeness: 100% of new orders captured
- [ ] Item matching accuracy: 85-100% match rate
- [ ] Heuristic accuracy: 80-90% of removals correct (user validation)
- [ ] LLM reasoning quality: 70-90% helpful explanations (user rating)

### Secondary

- [ ] Execution time: 2-5 minutes for 77-item cart
- [ ] Token consumption: 30k-70k tokens per run
- [ ] User approval time: 20-60 seconds for batch review
- [ ] Cart reduction rate: 30-50% of items removed

---

## Quality Gates

- [ ] All FR items have passing tests
- [ ] Sample 77-item cart reduces to 40-50 items with clear reasoning
- [ ] Purchase history sync adds new orders without duplicates
- [ ] LLM layer works in both dev and prod modes
- [ ] Batch review UX is usable (<30 sec approval)
- [ ] Removal execution is reliable (cart totals correct)
- [ ] Error handling: graceful degradation on failures
- [ ] Audit trail: all decisions logged

---

## Integration Points Verified

- [ ] Upstream: BrowserMCP-I-001 cart merge output works as input
- [ ] Upstream: StockPruner heuristics.ts integration tested
- [ ] Upstream: LLM enhancer pluggability validated
- [ ] Data: purchase-history.json read/write works
- [ ] Data: Pruning decision log created

---

**Completion**: 0/69 items checked
**Status**: Pending implementation
