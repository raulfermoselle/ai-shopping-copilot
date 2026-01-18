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
| 001-extension-merge-orders | 15 | P1 | **Tasks Ready** | [spec.md](Specs/001-extension-merge-orders/spec.md) | [plan.md](Specs/001-extension-merge-orders/plan.md) | [tasks.md](Specs/001-extension-merge-orders/tasks.md) |

### 001-extension-merge-orders: Extension Button - Merge Last 3 Orders

**Description**: Add "Merge last 3 orders" button to Chrome extension popup that triggers CartBuilder workflow.

**User Stories** (Revised Effort - 90% infrastructure exists):
- US5: Auto-detect login state (P1) - 2 points
- US1: Trigger order merge from extension popup (P1) - 4 points
- US2: Visual progress feedback during merge (P1) - 3 points
- US3: View merge results (P1) - 2 points
- US4: Handle errors gracefully (P2) - 2 points
- Integration Testing - 2 points

**Dependencies**: Sprint-EXT-I-001 (Chrome extension infrastructure) - **90% complete**

**Sprint Allocation**: Single sprint (15 points - revised down from 21)

**Implementation Phases**:
- Setup: manifest.json, esbuild config (2 tasks)
- Foundation: Login detection, button state (2 tasks)
- Core: Multi-order flow, progress, results (5 tasks)
- Polish: Error handling, cancel, tests (3 tasks)

**Next Steps**:
1. ~~Run `/speckit-plan 001-extension-merge-orders`~~ ✓ Complete
2. ~~Run `/speckit-tasks 001-extension-merge-orders`~~ ✓ Complete (12 tasks generated)
3. Run `/sprint-new Extension I 002` to create Sprint-EXT-I-002
4. Copy tasks to SPRINT-PLAN.md
5. Run `/sprint-start` to begin implementation

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

*Last Updated: 2026-01-17*
