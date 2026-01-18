# Sprint Planning - AI Shopping Copilot

> **Master Roadmap**: Complete task breakdown for the Cart Preparation Agent project.

<!-- FRAMEWORK_VERSION: 2.1.0 -->

---

## Project Vision

**Goal**: Cut recurring ~2-hour grocery sessions to short review + approval
**Target**: ≥80% cart correctness before human review
**Platform**: Auchan.pt (browser automation via Playwright)

---

## Module Definitions

| Module | Prefix | Path | Purpose |
|--------|--------|------|---------|
| Global | G | `Sprints/Global/` | Shared infrastructure, Playwright setup, config, types |
| Coordinator | CO | `Sprints/Modules/Coordinator/` | Orchestration agent, Review Pack generation |
| CartBuilder | CB | `Sprints/Modules/CartBuilder/` | Load/merge past orders, favorites |
| Substitution | SU | `Sprints/Modules/Substitution/` | Availability checks, replacement proposals |
| StockPruner | SP | `Sprints/Modules/StockPruner/` | Restock cadence, remove unneeded items |
| SlotScout | SS | `Sprints/Modules/SlotScout/` | Delivery slot scouting |
| ControlPanel | CP | `Sprints/Modules/ControlPanel/` | User interface for agent runs |

---

## Implementation Phases

### Phase 1: Fast Win (Foundation)

**Objective**: Login → Load/merge past orders → Produce cart diff report + screenshots
**Outcome**: Working MVP that loads cart and shows what changed

| Sprint ID | Module | Type | Description | Dependencies | Status |
|-----------|--------|------|-------------|--------------|--------|
| Sprint-G-001 | Global | I | Project scaffolding, Playwright setup, TypeScript config | - | Planned |
| Sprint-G-002 | Global | I | Auchan.pt login automation (credential handling, session) | G-001 | Planned |
| Sprint-CB-R-001 | CartBuilder | R | Research Auchan.pt order history UI, selectors, data structure | G-002 | Planned |
| Sprint-CB-A-001 | CartBuilder | A | Design CartBuilder worker interface & data models | CB-R-001 | Planned |
| Sprint-CB-I-001 | CartBuilder | I | Implement load last orders, merge cart, cart diff report | CB-A-001 | Planned |
| Sprint-CO-A-001 | Coordinator | A | Design Coordinator orchestration flow (Phase 1 minimal) | CB-A-001 | Planned |
| Sprint-CO-I-001 | Coordinator | I | Implement Phase 1 Coordinator (login → cart → diff report) | CO-A-001, CB-I-001 | Planned |

**Phase 1 Deliverables**:
- [ ] Playwright automation framework
- [ ] Auchan.pt login with session persistence
- [ ] Load last 3 orders
- [ ] Merge orders into cart
- [ ] Cart diff report (added/removed/changed)
- [ ] Screenshot capture at key steps

---

### Phase 2: Time Saver (Core Intelligence)

**Objective**: Substitution search + Restock pruning + Quantity suggestions + Simple UI
**Outcome**: Intelligent cart preparation with substitutions and pruning

| Sprint ID | Module | Type | Description | Dependencies | Status |
|-----------|--------|------|-------------|--------------|--------|
| Sprint-SU-R-001 | Substitution | R | Research Auchan.pt product search, availability indicators | G-002 | Planned |
| Sprint-SU-A-001 | Substitution | A | Design substitution ranking heuristics, worker interface | SU-R-001 | Planned |
| Sprint-SU-I-001 | Substitution | I | Implement availability check, search substitute, propose replacements | SU-A-001 | Planned |
| Sprint-SP-R-001 | StockPruner | R | Research restock patterns, cadence detection approaches | CO-I-001 | Planned |
| Sprint-SP-A-001 | StockPruner | A | Design household stock model, pruning heuristics | SP-R-001 | Planned |
| Sprint-SP-I-001 | StockPruner | I | Implement restock cadence tracking, item pruning logic | SP-A-001 | Planned |
| Sprint-SS-R-001 | SlotScout | R | Research Auchan.pt delivery slot UI, constraints | G-002 | Planned |
| Sprint-SS-A-001 | SlotScout | A | Design slot preference model, selection strategy | SS-R-001 | Planned |
| Sprint-SS-I-001 | SlotScout | I | Implement slot scouting, preference matching | SS-A-001 | Planned |
| Sprint-CP-A-001 | ControlPanel | A | Design Control Panel UI (run input, progress, review) | CO-I-001 | Planned |
| Sprint-CP-I-001 | ControlPanel | I | Implement basic Control Panel for joint review | CP-A-001 | Planned |
| Sprint-CO-I-002 | Coordinator | I | Integrate all workers, full Review Pack generation | SU-I-001, SP-I-001, SS-I-001 | Planned |

**Phase 2 Deliverables**:
- [ ] Availability detection for cart items
- [ ] Substitution search and ranking
- [ ] Restock cadence model
- [ ] Automatic pruning of recently-purchased items
- [ ] Delivery slot scouting
- [ ] Agent Control Panel UI
- [ ] Complete Review Pack output

---

### Phase 3: Polish (Learning & Resilience)

**Objective**: Long-term memory + Preference learning + Faster runs + UI resilience
**Outcome**: Production-ready system that learns and improves

| Sprint ID | Module | Type | Description | Dependencies | Status |
|-----------|--------|------|-------------|--------------|--------|
| Sprint-G-003 | Global | I | Persistent memory layer (SQLite/JSON), episodic storage | CO-I-002 | Planned |
| Sprint-CB-I-002 | CartBuilder | I | Learn from approved/rejected items, preference scoring | G-003 | Planned |
| Sprint-SU-I-002 | Substitution | I | Learn acceptable substitutes from user choices | G-003 | Planned |
| Sprint-SP-I-002 | StockPruner | I | Adaptive cadence learning from order history | G-003 | Planned |
| Sprint-G-004 | Global | I | UI resilience: retry strategies, selector fallbacks, screenshots | CO-I-002 | Planned |
| Sprint-CO-I-003 | Coordinator | I | Post-run feedback capture ("What did we get wrong?") | G-003 | Planned |
| Sprint-CP-I-002 | ControlPanel | I | Enhanced UI: progress indicators, confidence display | CO-I-003 | Planned |
| Sprint-G-D-001 | Global | D | User documentation, setup guide, troubleshooting | CP-I-002 | Planned |

**Phase 3 Deliverables**:
- [ ] Persistent household preference storage
- [ ] Learning from approved/rejected decisions
- [ ] Adaptive substitution preferences
- [ ] Adaptive restock cadence
- [ ] Retry and fallback strategies
- [ ] Post-run feedback loop
- [ ] Enhanced UI with confidence scores
- [ ] Complete documentation

---

## Sprint Summary

| Phase | Sprint Count | Primary Focus |
|-------|--------------|---------------|
| Phase 1 - Fast Win | 7 | MVP cart loading |
| Phase 2 - Time Saver | 12 | Intelligence & UI |
| Phase 3 - Polish | 8 | Learning & resilience |
| **Total** | **27** | |

---

## Dependency Graph

```
Phase 1:
G-001 → G-002 → CB-R-001 → CB-A-001 → CB-I-001
                                    ↘
                              CO-A-001 → CO-I-001

Phase 2:
G-002 → SU-R-001 → SU-A-001 → SU-I-001 ↘
G-002 → SS-R-001 → SS-A-001 → SS-I-001 → CO-I-002
CO-I-001 → SP-R-001 → SP-A-001 → SP-I-001 ↗
CO-I-001 → CP-A-001 → CP-I-001

Phase 3:
CO-I-002 → G-003 → CB-I-002
                 → SU-I-002
                 → SP-I-002
                 → CO-I-003 → CP-I-002 → G-D-001
CO-I-002 → G-004
```

---

## Key Technical Decisions

### Architecture Pattern
- **Coordinator-Worker-Delegator (CWD)**: Coordinator orchestrates, workers execute, delegator handles retries

### Memory Model
| Type | Purpose | Storage |
|------|---------|---------|
| Working | Session state (current cart, changes) | In-memory |
| Long-term | Preferences, usual items, cadences | SQLite/JSON |
| Episodic | Run outcomes, user feedback | SQLite/JSON |

### Tool Layer
Playwright-based browser automation tools:
- `open_site`, `login`, `load_last_orders`
- `merge_cart`, `scan_cart`, `check_item_availability`
- `search_substitute`, `set_quantity`
- `capture_screenshot`, `list_delivery_slots`

### Safety Constraint
**Critical**: Agent NEVER places orders - stops at ready-to-review cart

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cart correctness | ≥80% | Items approved vs. total |
| Time to review | <15 min | From run start to approval |
| Substitution acceptance | ≥70% | Proposed subs accepted |
| False removals | <5% | Items incorrectly pruned |

---

## Feature Backlog

> Features specified via `/speckit-specify`, ready for implementation planning.

| Feature | Points | Priority | Status | Spec | Plan | Tasks |
|---------|--------|----------|--------|------|------|-------|
| 001-extension-merge-orders | 15 | P3 | **Abandoned** | [spec.md](Specs/001-extension-merge-orders/spec.md) | - | - |
| 002-browsermcp-cart-merge | 21 | P1 | **Tasks Ready** | [spec.md](Specs/002-browsermcp-cart-merge/spec.md) | [plan.md](Specs/002-browsermcp-cart-merge/plan.md) | [tasks.md](Specs/002-browsermcp-cart-merge/tasks.md) |

### 001-extension-merge-orders (ABANDONED)

**Status**: Abandoned on 2026-01-18. Chrome extension content script approach proved unworkable - content scripts cannot maintain state across page reloads during automation.

---

### 002-browsermcp-cart-merge: BrowserMCP Agentic Cart Merge

**Description**: First minimal end-to-end user story validating the BrowserMCP-based agentic architecture. Claude Code acts as the autonomous operator, directly driving and observing browser sessions.

**Architectural Pivot**:
- **Away from**: Playwright-only closed automation, Chrome extension-driven models
- **Toward**: BrowserMCP-based setup where Claude Code is the primary consumer and operator
- **Purpose**: Validate agent-led exploration and autonomous operation on auchan.pt

**User Stories**:
- US1: Load past 3 orders into cart (P1) - 8 points
- US2: Full observability for Claude Code (P1) - 5 points
- US3: Autonomous operation during human absence (P1) - 5 points
- Integration Testing - 3 points

**Total**: 21 points

**Sprint Allocation**: Single sprint (phases tightly coupled)
- Phase 0: Setup (BrowserMCP config, Chrome profile)
- Phase 1: Exploration Harness (capture_state, artifacts)
- Phase 2: Cart Merge Workflow (order history → merge → verify)
- Phase 3: Safety Guardrails (checkout blocker, Review Pack)

**Key Principles**:
- Claude Code must directly drive, observe, inspect, and manipulate browser sessions
- All automation must be transparent and explorable (DOM, URLs, screenshots, state)
- Agent can perform trial-and-error exploration with minimal human input
- Interface should be pluggable for future agent/UI replacement

**Success Criteria**:
- Agent can explore auchan.pt without hardcoded paths
- Agent can observe and verify page state independently
- Agent can complete cart merge with confidence reporting
- Human intervention rate <20% of runs

**Next Steps**:
1. ~~Review spec.md for accuracy~~ Complete
2. ~~Run `/speckit-plan 002-browsermcp-cart-merge`~~ Complete
3. ~~Run `/speckit-tasks 002-browsermcp-cart-merge`~~ Complete (15 tasks generated)
4. Run `/sprint-new BrowserMCP I 001` to create sprint for implementation

---

## Notes & Considerations

### Platform Constraints
- Auchan.pt has no public API (browser automation required)
- UI may change over time (selector resilience needed)
- Session/cart locks for ~2 hours when slot selected

### User Experience
- Joint review with spouse is required workflow
- Keep low-end pricing preference
- Show "why" for each decision

---

*Last Updated: 2026-01-18*
