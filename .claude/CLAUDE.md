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

---

**Last Updated:** 2026-01-13
**Project:** AI Shopping Copilot (AISC)
**Current Sprint:** LLM Integration Complete
