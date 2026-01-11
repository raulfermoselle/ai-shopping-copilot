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

## Tool Layer

Playwright-based browser automation:
- `open_site`, `login`, `load_last_orders`
- `merge_cart`, `scan_cart`, `check_item_availability`
- `search_substitute`, `set_quantity`
- `capture_screenshot`, `list_delivery_slots`

**Safety**: Agent NEVER places orders - stops at ready-to-review cart

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

**Last Updated:** 2026-01-11
**Project:** AI Shopping Copilot (AISC)
**Current Sprint:** Sprint-G-002 (Completed)
