# AI Shopping Copilot

**Project:** Cart Preparation Agent for Auchan.pt grocery shopping
**Status:** Development
**Primary Goal:** Cut recurring ~2-hour grocery sessions to short review + approval

---

## Quick Reference

| What | Where | Command |
|------|-------|---------|
| Docs | `solution-architecture.md` | - |
| Problem | `problem-statement.md` | - |
| Sprints | `Sprints/` | `/sprint-status` |

---

## General Principles

Timeless heuristics that govern this project. Concrete directives throughout this document trace back to these principles.

### Replace Magic Values with Named Constants
Scattered literals create silent mismatches when values change. Use named constants for numbers, strings, and identifiers.
*Source: Clean Code (Martin, 2008) — G25*

### Centralize Cross-Cutting Concerns
Logging, error handling, and configuration should flow through single points of control. Duplication breeds inconsistency.
*Source: Aspect-Oriented Programming; DRY Principle*

### Agentic Assistants Require Autonomous Feedback Loops
Any feedback that requires manual human relay breaks the autonomous iteration cycle. Build, test, lint, and log outputs must be directly accessible to the coding agent.
*Source: Emergent pattern in agentic coding (2025–2026)*

### Bulk Text Replacements Risk Token Boundary Corruption
Pattern-based find-replace can corrupt quote characters, brackets, and delimiters. Prefer semantic-aware transformations or validate output manually after bulk replacements.
*Source: Refactoring safety literature; LST/AST-aware tooling*

### Minimize Context Window Consumption in Agentic Loops
Large tool outputs (DOM snapshots, API responses, logs) can exhaust context windows and trigger compaction. Extract only required data points rather than processing entire outputs. Use filtering tools (grep, jq, head) to isolate relevant content before analysis.
*Source: Emergent pattern in agentic browser automation (2025–2026)*

### Prefer Direct Navigation Over Click Chains
Each UI click introduces latency, failure risk, and context consumption. When identifiers (UUIDs, IDs, slugs) are visible in a page, extract them to construct direct URLs rather than clicking through intermediate pages.
*Source: RPA efficiency patterns; reduced state machine complexity*

---

## Architecture Overview

```
User (Control Panel UI)
         ↓
    Coordinator Agent
         ↓
    ┌────┼────┬────────┬────────────┐
    ↓    ↓    ↓        ↓            ↓
CartBuilder  Substitution  StockPruner  SlotScout
    ↓    ↓    ↓        ↓            ↓
         Playwright (Auchan.pt)
                  ↓
           Review Pack → User Approval → Order
```

**Core Components:**
- **Coordinator**: Orchestrates the run and creates the review checklist
- **CartBuilder**: Loads/merges prior orders, favorites
- **Substitution**: Finds replacements for unavailable items
- **StockPruner**: Removes low-likelihood items (recently bought)
- **SlotScout**: Collects best delivery slot options

---

## Context Documentation Structure

### Systems (`systems/`)
Hardware, deployment, infrastructure
- `systems/browser-automation.md` - Playwright setup for Auchan.pt

### Modules (`modules/`)
Core agent systems
- `modules/coordinator.md` - Coordinator agent
- `modules/cart-builder.md` - Cart building worker
- `modules/substitution.md` - Availability & substitution worker
- `modules/stock-pruner.md` - Household stock pruning worker
- `modules/slot-scout.md` - Delivery slot worker

### Integrations (`integrations/`)
External communication
- `integrations/auchan-api.md` - Auchan.pt website automation

### Automation Procedures (`automation/harness/`)
Documented browser automation workflows
- `automation/harness/CAPTURE-STATE.md` - State capture procedure for debugging
- `automation/harness/MERGE-ORDERS.md` - Order merge workflow with URL patterns

---

## Agent Design Patterns

**Hybrid Agent (Deliberative + Reactive):**
- **Deliberative**: Plans session steps (login → load orders → reconcile cart → substitutions → slots → review pack)
- **Reactive**: Handles dynamic website states (out-of-stock, UI changes, timeouts)

**Coordinator-Worker-Delegator (CWD) Pattern:**
- Coordinator assigns tasks
- Workers execute specialized functions
- Delegator handles retries/fallbacks on UI friction

---

## Memory Architecture

| Type | Purpose | Persistence |
|------|---------|-------------|
| Working | Session changes (out-of-stock, substitutions, slots) | Per session |
| Long-term | Household preferences, usual items, restock cadence | Persistent |
| Episodic | Previous run outcomes (approved/rejected choices) | Persistent |

---

## LLM Integration (Anthropic Claude)

The project integrates Claude for enhanced agent decision-making. The LLM **enhances** but doesn't replace heuristics.

### Architecture

```
src/llm/
  client.ts           # Anthropic SDK wrapper with tool-use
  types.ts            # LLM-specific types
  schemas.ts          # Zod schemas for structured outputs
  tools.ts            # Tool definitions for Claude
  token-manager.ts    # Rate limiting, retry logic
  prompts/
    system.ts         # Base system prompts
    stock-pruner.ts   # StockPruner-specific prompts
  index.ts            # Module exports
```

### Key Principles

**1. Agentic, Not Chatbot**
- Uses tool-use patterns (ReAct loop), NOT conversational
- Structured outputs with Zod schema validation
- Designed for decision-making, not human interaction

**2. Graceful Degradation**
- If LLM unavailable → fall back to heuristics
- If rate limited → queue with exponential backoff
- Never blocks user flow due to LLM failure

**3. LLM Enhances Heuristics**
```
Cart Items
    ↓
[1] Heuristics run FIRST (fast, free)
    ↓
[2] Filter: confidence < 0.6 OR high-consequence items
    ↓
[3] LLM Enhancement (only for filtered items)
    ↓
[4] Merge: LLM insights + heuristic decisions
    ↓
Final decisions with rich explanations
```

### Usage Example

```typescript
import { createLLMEnhancer, processCartItems } from './agents/stock-pruner';

// Run heuristics first
const heuristicDecisions = processCartItems(items, history, config);

// Enhance with LLM (optional)
const enhancer = createLLMEnhancer({
  apiKey: process.env.ANTHROPIC_API_KEY,
  uncertaintyThreshold: 0.6,
  highConsequenceCategories: ['baby-care', 'pet-supplies'],
});

const result = await enhancer.enhance(heuristicDecisions);
// result.decisions now have llmReasoning, safetyFlags, etc.
```

### Configuration

Set in `.env`:
```bash
ANTHROPIC_API_KEY=your-api-key-here
# Optional:
# LLM_MODEL=claude-sonnet-4-20250514
# LLM_MAX_TOKENS=2048
# LLM_TEMPERATURE=0.3
```

### High-Consequence Categories

Items in these categories always get LLM review regardless of heuristic confidence:
- `baby-care` - Baby formula, diapers, wipes
- `pet-supplies` - Pet food, medication

---

## Tool Layer

Playwright-based browser automation:
- `open_site`, `login`, `load_last_orders`
- `merge_cart`, `scan_cart`, `check_item_availability`
- `search_substitute`, `set_quantity`
- `capture_screenshot`, `list_delivery_slots`

**Safety**: Agent NEVER places orders - stops at ready-to-review cart

### Tool Design Principles (CRITICAL)

Tools are **granular RPA utilities** that the orchestration layer composes. Follow these principles:

**1. Single Responsibility**
- Each tool does ONE UI interaction: navigate, extract, click, or scan
- Never combine multiple actions - keep tools atomic
- Example: `navigateToOrderHistory` only navigates, `loadOrderHistory` only extracts

**2. UI Particularities at the Right Layer**
- Modal detection, popup handling, selector fallbacks belong in dedicated utilities
- Tools call these utilities (`auto-popup-dismisser`, `popup-handler`) - don't duplicate logic
- Example: Detecting reorder modal types (replace vs merge) lives in `isReorderModalVisible()`

**3. Orchestration Decides Flow**
- The coordinator/agent decides WHICH tools to call and WHEN
- Tools don't call other tools - orchestration composes them
- Example: CartBuilder orchestration calls `reorderTool` without forcing `loadOrderDetailTool`

**4. Preserve Tool Availability**
- When removing a tool from a flow, keep the tool itself for other use cases
- Only change the orchestration, not the tool's existence
- Example: `loadOrderDetailTool` stays available for Substitution agent even if CartBuilder doesn't use it

**Why This Matters**: Granular tools prevent duplicate UI actions, simplify debugging, and allow flexible composition for different workflows.

### Playwright DOM Extraction (CRITICAL)

**Always use `page.evaluate()` with string templates for bulk DOM extraction.** Never iterate with Playwright locators.

**Why**: Playwright locators make individual browser round-trips for each `.textContent()`, `.getAttribute()` call. When extracting data from 10+ elements, this causes 30+ second timeouts. JavaScript `page.evaluate()` runs entirely in the browser and returns all data in one call.

**Pattern**:
```typescript
// FAST: Single browser call, returns all data
const items = await page.evaluate(`
  (function() {
    var results = [];
    var elements = document.querySelectorAll('.product-tile');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      results.push({
        name: el.querySelector('.name')?.textContent?.trim() || '',
        price: el.querySelector('.price')?.textContent?.trim() || ''
      });
    }
    return results;
  })()
`) as ProductData[];

// SLOW: Multiple browser round-trips (AVOID)
const elements = await page.locator('.product-tile').all();
for (const el of elements) {
  const name = await el.locator('.name').textContent();  // Round-trip
  const price = await el.locator('.price').textContent(); // Round-trip
}
```

**Note**: Use string template (backticks) for `page.evaluate()` to bypass TypeScript DOM type errors (`document`, `HTMLElement` not recognized in Node context). The code runs in browser context where these types exist.

### BrowserMCP Token Optimization (CRITICAL)

BrowserMCP accessibility snapshots can exceed 100k characters for content-heavy pages, rapidly consuming context. Follow these rules:

- **Extract via grep, not parsing**: Use `grep -oE 'pattern'` on snapshot files to isolate specific elements (cart count, auth state, UUIDs) rather than reading full snapshots into context. → *Principle: Minimize Context Window Consumption*

- **Skip intermediate snapshots**: Only capture state when verification is required (auth check, final confirmation). Skip snapshots between sequential actions. → *Principle: Minimize Context Window Consumption*

- **Extract identifiers for direct navigation**: List pages often embed IDs in element attributes (e.g., `button "View Order Number: {uuid}"`). Extract these to construct direct URLs instead of clicking rows. → *Principle: Prefer Direct Navigation Over Click Chains*

- **Document discovered patterns**: When automating a new workflow, record URL patterns, element selectors, and modal behaviors in `automation/harness/{WORKFLOW}.md` for reuse.

---

## Selector Registry (CRITICAL)

**Never hardcode selectors.** Use the Selector Registry system for all Auchan.pt page automation.

### Directory Structure

```
data/selectors/
  registry.json           # Master index
  pages/
    login/v1.json         # Login page selectors
    cart/v1.json          # Cart page selectors
    ...
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `SelectorRegistry` | Store/version selector definitions | `src/selectors/registry.ts` |
| `SelectorResolver` | Resolve keys to selectors with fallbacks | `src/selectors/resolver.ts` |
| `DiscoveryTool` | Capture page structure, find candidates | `src/tools/discovery.ts` |

### Agent Protocol: Discovery Before Coding

**When automating a new page or element:**

1. **Check registry first** - Does the selector already exist?
   ```typescript
   const resolver = new SelectorResolver();
   if (resolver.hasPage('login')) {
     const selector = resolver.resolve('login', 'emailInput');
   }
   ```

2. **Discover if missing** - Capture page, analyze structure
   - Take HTML snapshot and screenshot
   - Identify candidate selectors
   - Score by stability (data-testid > aria > id > class > text)

3. **Validate candidates** - Test selectors work
   - Primary selector must be unique
   - Include 2+ fallbacks

4. **Commit to registry** - Register validated selectors
   - Create versioned JSON file
   - Update registry.json index

5. **Use resolver in tools** - Never hardcode
   ```typescript
   const result = await resolver.tryResolve(page, 'login', 'submitButton');
   if (result) {
     await result.element.click();
   }
   ```

### Stability Scoring (Higher = Better)

| Strategy | Score | Example |
|----------|-------|---------|
| data-testid | 95 | `[data-testid="login-btn"]` |
| aria-label | 85 | `[aria-label="Submit"]` |
| role | 80 | `button[role="submit"]` |
| css-id | 75 | `#username` |
| css-class (semantic) | 60 | `.login-button` |
| text-content | 50 | `button:has-text("Login")` |
| positional | 20 | `div:nth-child(3)` |

---

## Implementation Phases

| Phase | Goal | Features |
|-------|------|----------|
| 1 | Fast Win | Login, load/merge orders, cart diff report |
| 2 | Time Saver | Substitution search, restock pruning, simple UI |
| 3 | Polish | Long-term memory, preference learning, resilience |

---

## Sprint Management

This project uses **Sprint Management Framework v2.1.0** with multi-module mode.

**Modules:**
- CartBuilder, Substitution, StockPruner, SlotScout, Coordinator

**Commands:**
- `/sprint-start` - Begin work on active sprint
- `/sprint-status` - Show current status
- `/sprint-new` - Create new sprint
- `/speckit-specify` - Create feature specification

---

## Speckit Templates

The project uses standardized templates for feature development artifacts, restored from GitHub's Spec-Kit framework and integrated with Sprint Management.

### Available Templates

| Template | Purpose | Command | Output |
|----------|---------|---------|--------|
| `plan-template.md` | Implementation plan | `/speckit-plan` | `Sprints/Specs/{id}/plan.md` |
| `research-template.md` | Technical decisions | `/speckit-plan` | `Sprints/Specs/{id}/research.md` |
| `data-model-template.md` | Entity definitions | `/speckit-plan` | `Sprints/Specs/{id}/data-model.md` |
| `contracts-template.yaml` | API contracts | `/speckit-plan` | `Sprints/Specs/{id}/contracts/api.yaml` |

**Location**: `.claude/templates/`

### When to Use Templates

**During planning phase** (`/speckit-plan`):
1. **Research**: Document technical unknowns, alternatives considered, decisions made
2. **Data Model**: Define entities, relationships, state transitions, business rules
3. **Contracts**: Specify API endpoints, request/response schemas, error handling
4. **Plan**: Create complete implementation plan with all 9 technical specifications

### Template Structure

Templates use `{PLACEHOLDER}` format for values to be filled:
- `{FEATURE_NAME}` → Feature ID and title
- `{BRANCH_NAME}` → Git branch name
- `{DATE}` → Current date
- `{SPEC_PATH}` → Path to specification

**Agent responsibilities**:
1. Read template to understand structure
2. Copy template to target location
3. Replace ALL placeholders with actual content
4. Fill every section (use "N/A" if not applicable)
5. Validate no `{PLACEHOLDER}` markers remain

### Key Enhancements from Original Spec-Kit

**Research phase** (Phase 0 in `/speckit-plan`):
- Extract `[NEEDS CLARIFICATION]` items from spec
- Investigate each unknown systematically
- Document decision, rationale, alternatives considered
- Reference sources (documentation, codebase files)

**Design phase** (Phase 1 in `/speckit-plan`):
- **Data Modeling**: Extract entities, define fields/relationships, document state transitions
- **Contract Generation**: Map user actions to endpoints, define schemas, document errors
- **Quickstart**: Create developer setup guide with architecture overview

**Task generation** (`/speckit-tasks`):
- **Detailed task format**: `- [ ] [TaskID] [P] [Story] Description | file/path`
- **Phase structure**: Setup → Foundation → User Stories (priority order) → Polish
- **MVP identification**: Suggest User Story 1 as minimum viable product
- **Dependency graph**: Visualize task dependencies and parallelization opportunities

**Quality gates** (`/speckit-specify`):
- **Max 3 clarifications**: Prioritize by impact (architectural > feature > UI)
- **Success criteria requirements**: Must be measurable, technology-agnostic, user-focused
- **Re-validation cycle**: Max 3 iterations after clarifications provided

### Integration with Sprint Management

Templates include Sprint Management-specific elements:
- **Constitution Check**: Validates compliance with project constitution
- **Sprint Mapping**: Allocates tasks across sprints based on story points
- **Task Traceability**: Links tasks to speckit (`Source: speckit:T###`)
- **Test-First Ordering**: Ensures tests before implementation (Article III)
- **AI Discoverability**: Conditional sections when enabled

### Documentation

Full template usage guide: `.claude/templates/README.md`

---

## Subagent Usage (IMPORTANT)

**Always use specialized subagents** to accelerate work and reduce context usage. Launch them in parallel when tasks are independent.

### When to Use Subagents

| Situation | Agent | Why |
|-----------|-------|-----|
| Implementing tool abstractions | `agent-runtime-engineer` | Tool-calling patterns, state management |
| Error handling, retry logic | `agent-runtime-engineer` | Error classification, recovery strategies |
| API/service layer work | `backend-api-engineer` | Endpoint design, session handling |
| Config, database, persistence | `memory-data-engineer` | Schema design, data sync |
| Browser automation (Playwright) | `playwright-rpa-engineer` | Selectors, retry, state recovery |
| UI components | `frontend-engineer` | React, state, accessibility |
| Decision heuristics (scoring, ranking) | `decisioning-heuristics-engineer` | Pure functions, testable logic |
| Tests and QA | `test-qa-engineer` | Unit, integration, E2E tests |
| Logging, tracing, debugging | `observability-engineer` | Structured logs, screenshots |
| Security review | `security-safety-engineer` | Auth, secrets, purchase guardrails |
| CI/CD pipelines | `cicd-engineer` | GitHub Actions, build automation |
| Architecture decisions | `system-architect` | ADRs, module maps, interfaces |
| Codebase exploration | `Explore` | Find files, understand patterns |

### Parallel Execution Rules

1. **Launch in parallel** when tasks don't depend on each other's output
2. **Use `run_in_background: true`** to continue working while agents run
3. **Check agent output files** when they complete to integrate their work
4. **Fix any TypeScript/lint issues** agents may introduce (strict mode catches edge cases)

### Example: Sprint Task Parallelization

```
Tasks T004, T005, T007 are independent → Launch 3 agents in parallel
Task T006 I can do while waiting → Work on it directly
When agents complete → Verify build, integrate, commit
```

---

## Multi-Instance Coordination

If running multiple Claude Code instances:

1. **Set instance ID:**
   ```bash
   export CLAUDE_INSTANCE=A  # Or B, C, D, etc.
   ```

2. **Signal when completing work:**
   ```pool
   INSTANCE: A
   ACTION: completed
   TOPIC: [Brief description]
   SUMMARY: [What changed]
   AFFECTS: [Files/systems touched]
   BLOCKS: [What this unblocks]
   ```

---

## Development Commands

```bash
npm run build        # TypeScript compilation
npm run dev          # Watch mode
npm run test:run     # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run lint         # ESLint
npm run check        # typecheck + lint + test
npm run dev:browser  # Interactive browser session
```

### Chrome Extension

```bash
cd extension
node build.mjs       # Build extension to package/
node build.mjs --watch  # Watch mode
```

**Load in Chrome:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/package/`

**Debug Extension Logs:**

1. **Via Debug Page**: Click "Debug Logs" link in popup footer, or navigate to `chrome-extension://[ID]/popup/debug.html`

2. **Via Service Worker Console**:
   - Go to `chrome://extensions/`
   - Click "Service worker" link under AI Shopping Copilot
   - Paste contents of `extension/scripts/dump-logs.js` into Console

3. **Quick Console Snippet** (paste in Service Worker console):
   ```javascript
   chrome.storage.local.get('aisc_debug_logs').then(r => console.log(JSON.stringify(r.aisc_debug_logs, null, 2)))
   ```

**Extension Development Rules:**

- **Autonomous log access**: When debugging extension issues, start the debug server (`cd extension && npm run logs`) and read `extension/logs/debug.log` directly. Never rely solely on Chrome DevTools for logs that require analysis. → *Principle: Agentic Assistants Require Autonomous Feedback Loops*

- **Centralized logger**: All extension components (service worker, content scripts, popup) must use the logger from `src/utils/logger.ts`. When migrating logging calls via bulk replacement, verify string literal boundaries remain intact. → *Principles: Centralize Cross-Cutting Concerns; Bulk Text Replacements Risk Token Boundary Corruption*

- **Message action constants**: Never hardcode message action strings. Import all action names from `src/types/messages.ts`. → *Principle: Replace Magic Values with Named Constants*

---

**Last Updated:** 2026-01-18
**Project:** AI Shopping Copilot (AISC)
**Current Sprint:** BrowserMCP-I-001 Complete
