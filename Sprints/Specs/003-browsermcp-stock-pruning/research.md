# Research: BrowserMCP Stock Pruning

**Date**: 2026-01-19
**Specification**: `Sprints/Specs/003-browsermcp-stock-pruning/spec.md`
**Researcher**: Claude Code (Sonnet 4.5)

---

## Overview

This document captures research conducted to understand the technical context for implementing BrowserMCP Stock Pruning. The feature connects existing StockPruner heuristics to the BrowserMCP workflow, requiring understanding of cart extraction patterns, purchase history structure, heuristics interfaces, LLM integration, and item removal workflows.

---

## Research Questions

### 1. How does cart extraction work via BrowserMCP?

**Context**: Cart pruning requires extracting all items currently in the cart. Need to understand existing patterns from BrowserMCP-I-001.

**Research Approach**:
- Examined completed Sprint BrowserMCP-I-001 implementation
- Reviewed `src/agents/cart-builder/tools/scan-cart.ts` (cart scanning logic)
- Analyzed `automation/harness/MERGE-ORDERS.md` (token optimization patterns)
- Checked `src/agents/cart-builder/types.ts` (data structures)

**Key Findings**:
- **Primary extraction method**: JavaScript `page.evaluate()` with multi-strategy fallback
- **Strategies**: Auchan selectors → Product links → dataLayer → Header count
- **Token optimization**: Single browser call extracts all data (avoids Playwright locator round-trips that timeout on 10+ elements)
- **CartSnapshot structure**: `{timestamp, items[], itemCount, totalPrice}`
- **CartItem fields**: `{name, quantity, unitPrice, available, productId?, productUrl?}`

**Decision Made**: Reuse existing `scanCartTool` from cart-builder module for consistency.

**Rationale**:
- Proven pattern from BrowserMCP-I-001
- Handles Auchan.pt selector variability with fallbacks
- Optimized for token consumption (single browser call)
- Returns structured data compatible with heuristics input

**Alternatives Considered**:
1. **Direct BrowserMCP snapshot parsing**:
   - Pros: Direct accessibility tree access
   - Cons: 100k+ character snapshots for 77-item cart, high token cost
   - Why rejected: Token consumption too high, slower

2. **Playwright locators**:
   - Pros: Type-safe element access
   - Cons: Timeouts on 10+ elements (30+ seconds), multiple round-trips
   - Why rejected: Performance issues documented in BrowserMCP-I-001

**References/Sources**:
- `src/agents/cart-builder/tools/scan-cart.ts` (lines 227-371)
- `src/agents/cart-builder/types.ts` (lines 128-139)
- `automation/harness/MERGE-ORDERS.md` (token optimization strategies)

**Impact on Design**:
- Import `scanCartTool` from cart-builder module
- Use CartSnapshot as input format for pruning workflow
- Map CartItem to CartItemForPruning (compatible schemas)

---

### 2. What is the purchase history data structure and how is it managed?

**Context**: Pruning decisions require historical purchase data to calculate restock cadence. Need to understand existing schema and access patterns.

**Research Approach**:
- Located purchase history file: `data/memory/household-demo/purchase-history.json`
- Examined schema definition in `src/agents/stock-pruner/types.ts`
- Checked file size and structure (323KB, 2000+ records)
- Reviewed existing Playwright scripts for history extraction patterns

**Key Findings**:
- **Schema**: `PurchaseRecord {productName, purchaseDate, quantity, orderId, unitPrice?, productId?, category?}`
- **File format**: `PurchaseHistoryFile {records[], lastUpdated}`
- **Current size**: 2000+ records (exceeds read tool limit)
- **No existing BrowserMCP sync**: File is manually maintained or uses Playwright scripts

**Decision Made**: Implement incremental BrowserMCP-based sync that extracts only new orders and merges into existing JSON.

**Rationale**:
- Aligns with spec requirement (US2): "incremental sync before each pruning run"
- Avoids full re-extraction on every run (slow, redundant)
- Maintains purchase history without manual intervention
- Follows BrowserMCP patterns from MERGE-ORDERS workflow

**Alternatives Considered**:
1. **Full re-extraction every run**:
   - Pros: Always completely fresh data
   - Cons: Slow (5-10 minutes for 2000+ records), high token cost
   - Why rejected: Poor UX, violates "incremental sync" requirement

2. **Manual CSV import**:
   - Pros: User controls data
   - Cons: Manual maintenance burden, error-prone
   - Why rejected: Spec explicitly states "stays current without manual CSV imports"

3. **Scheduled background sync**:
   - Pros: Data always fresh without user-triggered sync
   - Cons: Out of scope for this feature (marked "Future Specs" in spec.md)
   - Why rejected: Deferred to future specification

**References/Sources**:
- `src/agents/stock-pruner/types.ts` (lines 84-101)
- `data/memory/household-demo/purchase-history.json`
- `Sprints/Specs/003-browsermcp-stock-pruning/spec.md` (US2, lines 67-90)

**Impact on Design**:
- Create `syncPurchaseHistory()` function
- Track `lastSyncTimestamp` to determine which orders are new
- Navigate to order history, extract order UUIDs, fetch detail pages for new orders only
- Merge new records into existing JSON (avoid duplicates by orderId)

---

### 3. How do StockPruner heuristics integrate with cart data?

**Context**: Need to understand heuristics interface to connect cart extraction to pruning logic.

**Research Approach**:
- Examined `src/agents/stock-pruner/heuristics.ts` (1,223 lines)
- Identified core function: `processCartItems()`
- Analyzed input/output types
- Reviewed heuristic algorithms (category detection, cadence calculation, urgency scoring)

**Key Findings**:
- **Main function**: `processCartItems(items, purchaseHistory, config, overrides?, refDate?)`
- **Input**: `CartItemForPruning[] {name, quantity, unitPrice, productId?}`
- **Output**: `PruneDecision[] {productName, prune: boolean, confidence: 0-1, reason, context{}}`
- **Heuristics**:
  - Category detection via keyword matching (14 categories, Portuguese/English)
  - Restock cadence: Median interval from purchase history
  - Urgency ratio: daysSince / cadence (prune if < 0.7, uncertain if 0.7-0.9, keep if >= 1.0)

**Decision Made**: Use existing `processCartItems()` without modification. Map CartSnapshot items to CartItemForPruning format.

**Rationale**:
- Spec requirement (FR004): "applies existing StockPruner heuristics without modification"
- Heuristics are well-tested (1,223 lines of pure functions)
- Input/output types are compatible with cart data and LLM enhancer
- No changes needed to pruning logic, only integration

**Alternatives Considered**:
1. **Refactor heuristics for BrowserMCP-specific data**:
   - Pros: Could optimize for BrowserMCP data structures
   - Cons: Violates spec requirement (no modification), risky, no clear benefit
   - Why rejected: Spec explicitly forbids heuristic changes

2. **Create heuristics wrapper/adapter**:
   - Pros: Decouples cart extraction from heuristics
   - Cons: Unnecessary abstraction (schemas are already compatible)
   - Why rejected: Premature abstraction, YAGNI violation

**References/Sources**:
- `src/agents/stock-pruner/heuristics.ts` (lines 781-822: processCartItems)
- `src/agents/stock-pruner/types.ts` (lines 93-98: CartItemForPruning, lines 248-264: PruneDecision)
- `Sprints/Specs/003-browsermcp-stock-pruning/spec.md` (FR004, line 138)

**Impact on Design**:
- Import `processCartItems` directly from heuristics module
- Map CartSnapshot items: `{name, quantity, unitPrice, productId} → CartItemForPruning`
- No schema adapters needed (direct mapping)

---

### 4. How does LLM validation integrate with heuristic decisions?

**Context**: Spec requires LLM to validate ALL prune decisions to catch edge cases (seasonality, bundles, trends). Need to understand existing LLM enhancer interface.

**Research Approach**:
- Examined `src/agents/stock-pruner/llm-enhancer.ts`
- Analyzed `LLMEnhancer` class interface
- Reviewed pluggable LLM design (dev vs prod modes)
- Checked `prepareItemsForPrompt()` to understand item filtering logic

**Key Findings**:
- **Class**: `LLMEnhancer` with methods `buildAnalytics()` and `enhance()`
- **Flow**: buildAnalytics (once) → enhance (per cart) → returns EnhancedPruneDecision[]
- **Item filtering** (lines 374-383):
  - **Items sent to LLM**: Low confidence (<threshold) + ALL items marked for pruning
  - **Items skipped**: High-confidence KEEP decisions (safe to skip - worst case we order something unnecessary)
- **Pluggable design**: Dev mode uses Claude Code directly, Prod mode uses API
- **Output**: `EnhancedPruneDecision extends PruneDecision {llmReasoning?, llmConfidenceAdjustment?, wasLLMEnhanced}`

**Decision Made**: Use existing `LLMEnhancer` class. For dev mode (Claude Code), pass this conversation as the reasoning engine. For prod mode, use llm-enhancer API.

**Rationale**:
- Already implements spec requirement (US3): "validates ALL prune decisions"
- Existing filtering logic matches spec: REVIEW items + AUTO_REMOVE items → LLM, high-confidence KEEP → skip
- Pluggable design supports both dev (Claude Code) and prod (API) modes
- Returns enriched decisions with dual reasoning (heuristic + LLM)

**Alternatives Considered**:
1. **LLM validates ALL items (including high-confidence KEEP)**:
   - Pros: Maximum validation coverage
   - Cons: Unnecessary cost (high-confidence KEEP is safe - worst case we order something), violates existing implementation
   - Why rejected: Existing implementation already correct per spec

2. **Skip LLM entirely for cost savings**:
   - Pros: Lower API cost
   - Cons: Misses edge cases (seasonality, bundles), violates spec (US3 is P1)
   - Why rejected: Spec explicitly requires LLM validation for accuracy

3. **Build new LLM integration from scratch**:
   - Pros: Could customize for BrowserMCP workflow
   - Cons: Duplicates 506 lines of working code, risky, no clear benefit
   - Why rejected: Existing implementation already meets all spec requirements

**References/Sources**:
- `src/agents/stock-pruner/llm-enhancer.ts` (lines 146-524)
- `src/agents/stock-pruner/analytics/prompt-builder.ts` (lines 356-387: prepareItemsForPrompt)
- `Sprints/Specs/003-browsermcp-stock-pruning/spec.md` (US3, lines 93-125; BR004, line 156)

**Impact on Design**:
- Import `LLMEnhancer` and `createLLMEnhancer()` from llm-enhancer module
- Call `buildAnalytics(purchaseHistory)` once at start
- Call `enhance(heuristicDecisions)` after processCartItems
- For dev mode: Configure with Claude Code as reasoning engine (no separate API calls)
- For prod mode: Use default API configuration

---

### 5. How should cart item removal be implemented via BrowserMCP?

**Context**: After determining which items to prune, need to remove them from the cart via BrowserMCP. No existing implementation found.

**Research Approach**:
- Searched codebase for cart removal patterns
- Reviewed BrowserMCP tools available (from completed sprint)
- Analyzed token optimization principles from MERGE-ORDERS.md
- Considered state capture pattern from CAPTURE-STATE.md

**Key Findings**:
- **No existing removal implementation**: Search for "removeFromCart", "remove.*item" found nothing
- **BrowserMCP tools available**: navigate, click, snapshot, screenshot, wait
- **Token optimization** (from MERGE-ORDERS.md):
  - Skip intermediate snapshots (only verify final state)
  - Use direct URLs when possible
  - Extract via grep, not full snapshot parsing

**Decision Made**: Implement removal workflow: locate item row by name → click remove button → handle confirmation modal → verify cart count decreased.

**Rationale**:
- Follows proven BrowserMCP patterns from cart merge workflow
- Uses state capture for verification only (not per-item)
- Handles Auchan.pt modals (learned from merge-orders experience)
- Token-optimized (batch removals, single final verification)

**Alternatives Considered**:
1. **Remove items one-by-one with full verification each time**:
   - Pros: Maximum verification, easy debugging
   - Cons: High token cost (~10k tokens per item for snapshot), slow
   - Why rejected: Violates token optimization principles

2. **Use Playwright instead of BrowserMCP**:
   - Pros: More direct control
   - Cons: Contradicts project architecture (BrowserMCP-first), loses transparency
   - Why rejected: Spec explicitly requires BrowserMCP integration

3. **Clear entire cart and re-add KEEP items**:
   - Pros: Simpler logic (no per-item removal)
   - Cons: Loses quantities if user manually adjusted, higher risk
   - Why rejected: Doesn't preserve user's manual cart adjustments

**References/Sources**:
- `automation/harness/MERGE-ORDERS.md` (token optimization strategies)
- `automation/harness/CAPTURE-STATE.md` (state verification pattern)
- BrowserMCP tool documentation (from spec.md integration points)

**Impact on Design**:
- Create `removeCartItems()` function
- For each item to remove:
  - Locate row by product name (use BrowserMCP snapshot to find element ref)
  - Click remove button via `browser_click`
  - Handle confirmation modal if present
- Capture state ONCE after all removals (not per-item)
- Verify cart count matches expected (itemCount = original - removedCount)

---

## Summary of Key Technical Decisions

| Decision Area | Chosen Approach | Key Reason |
|---------------|-----------------|------------|
| Cart Extraction | Reuse `scanCartTool` from cart-builder | Proven pattern, token-optimized, compatible schemas |
| Purchase History Sync | Incremental BrowserMCP extraction | Spec requirement, efficient, avoids manual maintenance |
| Heuristics Integration | Use `processCartItems()` unchanged | Spec forbids modification, already well-tested |
| LLM Validation | Use existing `LLMEnhancer` class | Already implements spec (validates ALL prune decisions) |
| Item Removal | Batch removal with final verification | Token-optimized, follows BrowserMCP patterns |
| Dev vs Prod LLM | Pluggable: Claude Code (dev) vs API (prod) | Existing design supports both modes |

---

## Assumptions Made

1. **Auchan.pt cart page structure is stable**: Cart item rows can be located by product name - Risk: **Low** (selector registry provides fallbacks)
2. **Purchase history JSON won't exceed memory limits**: 2000+ records can be loaded/parsed in Node.js - Risk: **Low** (file is 323KB, well within limits)
3. **Order history page pagination works**: Can extract all available orders - Risk: **Medium** (may need pagination handling)
4. **Remove button selectors are discoverable**: Cart page has identifiable remove buttons - Risk: **Low** (manual inspection confirms)
5. **LLM API availability**: Anthropic API is available for prod mode - Risk: **Low** (fallback to heuristics on failure per spec)

---

## Open Questions

- **Order history pagination**: If user has 100+ orders, how many pages exist? (Non-blocking - can implement pagination when discovered)
- **Cart removal confirmation modal**: Does Auchan show "Are you sure?" modal for each removal? (Non-blocking - can handle both cases)
- **Purchase history merge strategy**: Should we deduplicate by (orderId + productName) or just orderId? (Non-blocking - will discover on first sync)

---

## References

### Codebase
- `src/agents/cart-builder/tools/scan-cart.ts` - Cart extraction logic
- `src/agents/cart-builder/types.ts` - CartSnapshot, CartItem schemas
- `src/agents/stock-pruner/heuristics.ts` - Pruning heuristics (1,223 lines)
- `src/agents/stock-pruner/llm-enhancer.ts` - LLM validation (506 lines)
- `src/agents/stock-pruner/types.ts` - Type definitions
- `automation/harness/MERGE-ORDERS.md` - Token optimization patterns
- `automation/harness/CAPTURE-STATE.md` - State verification procedure

### External
- BrowserMCP documentation (MCP server tool definitions)
- Anthropic API documentation (LLM integration)

### Related Work
- Sprint BrowserMCP-I-001 (completed cart merge implementation)
- Existing StockPruner heuristics (proven pruning logic)

---

## Notes

**Key Integration Point**: CartSnapshot from cart-builder maps cleanly to CartItemForPruning (both have name, quantity, unitPrice). No schema adapters needed.

**LLM Validation Architecture**: The existing implementation already validates ALL prune decisions (not just uncertain items), which matches the spec requirement from clarification session. High-confidence KEEP decisions are the only items that skip LLM validation (safe because worst case is we order something unnecessary, caught in user review).

**Token Budget**: BrowserMCP snapshots for 77-item cart can exceed 100k characters. Follow token optimization strategies: skip intermediate snapshots, use grep for extraction, capture state only for auth check and final verification.

**Purchase History Freshness**: Spec requires incremental sync before each prune run, but first run must extract all available history (BR002). Implementation should check lastSyncTimestamp and extract accordingly.
