# Sprint Plan: BrowserMCP-I-001

**Title**: BrowserMCP Cart Merge (Agentic Baseline)
**Module**: BrowserMCP (Integration)
**Sprint ID**: BrowserMCP-I-001
**Status**: COMPLETED
**Started**: 2026-01-18
**Completed**: 2026-01-18
**Branch**: `feature/002-browsermcp-cart-merge`

---

## Sprint Overview

**Objective**: Implement core cart merge workflow using BrowserMCP bridge pattern
**Outcome**: Working agent that loads last 3 orders and merges them into cart
**Story Points**: 21
**Total Tasks**: 15

### Dependencies

- Feature Spec: `Sprints/Specs/002-browsermcp-cart-merge/spec.md`
- Task Source: `Sprints/Specs/002-browsermcp-cart-merge/tasks.md`
- Previous Work: Extension MVP research (Sprint-EXT-I-002, abandoned)
- Architecture: BrowserMCP bridge (extension UI + MCP server automation)

### Phases

| Phase | Tasks | Points | Purpose |
|-------|-------|--------|---------|
| Setup (Phase 0) | T001-T003 | 3 | One-time BrowserMCP configuration |
| Harness (Phase 1) | T004-T006 | 5 | State capture pattern for autonomous debugging |
| Workflow (Phase 2) | T007-T012 | 8 | Core cart merge implementation |
| Guardrails (Phase 3) | T013-T015 | 5 | Safety checks and Review Pack generation |

---

## Task Breakdown

| ID | Task | Phase | Status | Points | Acceptance Criteria |
|----|------|-------|--------|--------|---------------------|
| T001 | Install BrowserMCP extension | Setup | COMPLETED | 1 | Extension installed, configured in Chrome profile |
| T002 | Configure MCP server | Setup | COMPLETED | 1 | mcpServers.browsermcp configured in Claude Code |
| T003 | Verify BrowserMCP connection | Setup | COMPLETED | 1 | Screenshot received via BrowserMCP tools |
| T004 | Discover BrowserMCP capabilities | Harness | COMPLETED | 1 | 12 tools documented, no browser_evaluate |
| T005 | Implement capture_state pattern | Harness | COMPLETED | 2 | Procedure documented in automation/harness/CAPTURE-STATE.md |
| T006 | Create artifact persistence | Harness | COMPLETED | 2 | Artifacts readable in `runs/{timestamp}/{step}/` |
| T007 | Implement auth verification | Workflow | COMPLETED | 1 | Detect logged-in vs logged-out state |
| T008 | Navigate to order history | Workflow | COMPLETED | 1 | Discover URL pattern for orders page |
| T009 | Extract last 3 orders | Workflow | COMPLETED | 1 | Parse order dates, select 3 most recent |
| T010 | Implement order merge loop | Workflow | COMPLETED | 2 | Handle platform prompts, classify errors |
| T011 | Extract cart contents | Workflow | COMPLETED | 1 | Parse cart items and quantities |
| T012 | Generate natural language report | Workflow | COMPLETED | 1 | Report: orders found, merged, items, unavailable |
| T013 | Implement checkout blocker | Guardrails | COMPLETED | 1 | Block clicks on checkout buttons |
| T014 | Generate Review Pack | Guardrails | COMPLETED | 2 | Cart diff + screenshots + action timeline |
| T015 | Full workflow validation | Guardrails | COMPLETED | 2 | End-to-end: auth→orders→merge→report→stop |

**Totals**: 15 tasks, 21 points. Completed: 15 tasks, 21 points. Remaining: 0 tasks, 0 points.

---

## Key Decisions (from Spec)

### BrowserMCP Bridge Architecture

**Why**: Extension-only approach (Sprint-EXT-I-002) failed because content scripts lose state during page reloads.

**Solution**:
- Extension provides thin UI client (popup, manifest, esbuild config)
- MCP server handles all automation logic
- Claude Code uses BrowserMCP tools to control browser
- Reuses popup UI assets from abandoned sprint

### Sequential Phase Execution

**Why**: Phases have tight dependencies. Harness enables debugging for Workflow. Workflow enables validation for Guardrails.

**Strategy**: Complete each phase before starting next. Within phase, tasks are sequential.

### capture_state Pattern (T005)

**What**: Autonomous state capture replaces manual inspection.

**Captures**:
1. Screenshot (visual verification)
2. DOM/accessibility snapshot (element references)
3. Current URL (navigation validation)
4. Console logs (error detection)

**Persistence**: `runs/{ISO-timestamp}/{phase}-{task}/`

**Usage**: Called after each significant action to validate state

### Error Classification (T010)

When merging orders, classify failures as:
- Network (retry-able)
- Selector (update registry)
- Auth (restart)
- Unknown (inspect capture, add to EXCEPTIONS-LOG.md)

---

## Dependency Graph

```
Phase 0: Setup
T001 ─> T002 ─> T003 (COMPLETED)
                  │
                  v
Phase 1: Harness
T004 ─> T005 ─> T006 (COMPLETED: T004, PENDING: T005-T006)
                  │
                  v
Phase 2: Workflow
T007 ─> T008 ─> T009 ─> T010 ─> T011 ─> T012
                                          │
                                          v
Phase 3: Guardrails
T013 ─> T014 ─> T015
```

**Note**: No parallelization possible - each phase builds on previous.

---

## Testing Strategy

Per spec article III: "capture_state pattern serves as continuous validation"

**Test-First Approach**:
1. Define expected state (e.g., "order history page displayed")
2. Execute action (e.g., "click Orders link")
3. Capture state and verify
4. If failed: read artifacts, diagnose, iterate

**Validation Points**:
- T003: BrowserMCP screenshot received
- T006: Artifacts persist and are readable
- T009: Can extract and parse order list
- T010: Platform prompts handled correctly
- T012: Report generated with correct counts
- T013: Checkout button click blocked
- T015: Full workflow completes without placing order

---

## Feature Reference Mapping

| Task | FR Coverage | BR Coverage |
|------|------------|------------|
| T005-T006 | FR003, FR004, FR009 | - |
| T007-T012 | FR001, FR002, FR005, FR006, FR007, FR010 | BR001, BR002, BR005, BR006 |
| T013-T015 | FR008, FR010 | BR001, BR003 |

**Source**: Sprints/Specs/002-browsermcp-cart-merge/spec.md

---

## Artifact Locations

| Artifact | Location | Purpose |
|----------|----------|---------|
| Feature Spec | `Sprints/Specs/002-browsermcp-cart-merge/spec.md` | Requirements, acceptance criteria |
| Task List | `Sprints/Specs/002-browsermcp-cart-merge/tasks.md` | Source of truth for tasks |
| Implementation Plan | `Sprints/Specs/002-browsermcp-cart-merge/plan.md` | Detailed implementation approach |
| Sprint Log | `./SPRINT-LOG.md` | Session notes, blockers, decisions |
| Captured States | `runs/{timestamp}/{phase}-{task}/` | Screenshots, snapshots, logs |

---

## Next Steps

1. **T005**: Implement capture_state function
2. **T006**: Set up artifact persistence
3. **T007**: Start workflow implementation (auth detection)

---

## Notes

- Phase 0 (Setup) completed manually on 2026-01-18
- BrowserMCP tools available: 12 (no browser_evaluate capability)
- Feature branch: `feature/002-browsermcp-cart-merge`
- Related: Extension MVP research (Sprint-EXT-I-002, now abandoned)

