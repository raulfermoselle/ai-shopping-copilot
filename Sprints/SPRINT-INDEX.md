# Sprint Index

> **Quick Reference**: Find any sprint by module, type, or description.

<!-- FRAMEWORK_VERSION: 3.0.0 -->
<!-- LAST_UPDATED: 2026-01-16 -->

---

## Sprint Overview

| Sprint ID | Module | Type | Status | Completed | Summary |
|-----------|--------|------|--------|-----------|---------|
| [Sprint-G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) | Global | Infrastructure | Complete | 2026-01-10 | Project scaffolding, Playwright, TypeScript |
| [Sprint-G-002](./Global/Sprint-G-002/SPRINT-PLAN.md) | Global | Infrastructure | Complete | 2026-01-11 | Auchan.pt login, Selector Registry |
| [Sprint-CB-R-001](./Modules/CartBuilder/Sprint-CB-R-001/SPRINT-PLAN.md) | CartBuilder | Research | Complete | 2026-01-11 | Order history UI, 30 selectors |
| [Sprint-CB-A-001](./Modules/CartBuilder/Sprint-CB-A-001/SPRINT-PLAN.md) | CartBuilder | Architecture | Complete | 2026-01-11 | Data models, worker interface |
| [Sprint-CB-I-001](./Modules/CartBuilder/Sprint-CB-I-001/SPRINT-PLAN.md) | CartBuilder | Implementation | Complete | 2026-01-11 | 5 tools, 137 tests |
| [Sprint-CO-A-001](./Modules/Coordinator/Sprint-CO-A-001/SPRINT-PLAN.md) | Coordinator | Architecture | Complete | 2026-01-11 | Session lifecycle, Review Pack |
| [Sprint-CO-I-001](./Modules/Coordinator/Sprint-CO-I-001/SPRINT-PLAN.md) | Coordinator | Implementation | Complete | 2026-01-11 | 415 tests, persistence, API |
| [Sprint-SU-R-001](./Modules/Substitution/Sprint-SU-R-001/RESEARCH-SUMMARY.md) | Substitution | Research | Complete | 2026-01-11 | Product search, 32 selectors |
| [Sprint-SS-R-001](./Modules/SlotScout/Sprint-SS-R-001/README.md) | SlotScout | Research | Blocked | - | Delivery slots (60%, awaiting user) |
| [Sprint-EXT-R-001](./Modules/Extension/Sprint-EXT-R-001/SPRINT-PLAN.md) | Extension | Research | Active | 2026-01-16 | Chrome Extension architecture research |

---

## Sprints by Module

### Global Infrastructure

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) | Infrastructure | Complete | Project scaffolding, Playwright setup, TypeScript config |
| [G-002](./Global/Sprint-G-002/SPRINT-PLAN.md) | Infrastructure | Complete | Auchan.pt login automation, session persistence, Selector Registry |

### CartBuilder Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [CB-R-001](./Modules/CartBuilder/Sprint-CB-R-001/SPRINT-PLAN.md) | Research | Complete | Order history UI research, 30 selectors, reorder button discovery |
| [CB-A-001](./Modules/CartBuilder/Sprint-CB-A-001/SPRINT-PLAN.md) | Architecture | Complete | Zod schemas, worker interface, tool specifications |
| [CB-I-001](./Modules/CartBuilder/Sprint-CB-I-001/SPRINT-PLAN.md) | Implementation | Complete | 5 tools implemented, 137 tests (113 unit + 24 E2E) |

### Coordinator Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [CO-A-001](./Modules/Coordinator/Sprint-CO-A-001/SPRINT-PLAN.md) | Architecture | Complete | Session lifecycle, Review Pack generation, worker delegation |
| [CO-I-001](./Modules/Coordinator/Sprint-CO-I-001/SPRINT-PLAN.md) | Implementation | Complete | 415 tests, persistence, login integration, API layer, parallel framework |

### Substitution Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [SU-R-001](./Modules/Substitution/Sprint-SU-R-001/RESEARCH-SUMMARY.md) | Research | Complete | Product search UI, availability indicators, 32 selectors |

### SlotScout Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [SS-R-001](./Modules/SlotScout/Sprint-SS-R-001/README.md) | Research | Blocked | Delivery slot UI research (60% complete, awaiting user action) |

### StockPruner Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| - | - | - | No sprints yet |

### Extension Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| [EXT-R-001](./Modules/Extension/Sprint-EXT-R-001/SPRINT-PLAN.md) | Research | Active | Chrome Extension architecture, Manifest V3, content scripts |

### ControlPanel Module

| Sprint | Type | Status | Focus |
|--------|------|--------|-------|
| - | - | - | No sprints yet (unblocked by CO-I-001) |

---

## Sprint Sequence by Phase

### Phase 1: Foundation (Complete)

| Order | Sprint | Status | Dependency |
|-------|--------|--------|------------|
| 1 | G-001 | Complete | - |
| 2 | G-002 | Complete | G-001 |
| 3 | CB-R-001 | Complete | G-002 |
| 4 | CB-A-001 | Complete | CB-R-001 |
| 5 | CB-I-001 | Complete | CB-A-001 |
| 6 | CO-A-001 | Complete | CB-A-001 |
| 7 | CO-I-001 | Complete | CO-A-001, CB-I-001 |

### Phase 2: Features (In Progress)

| Order | Sprint | Status | Dependency |
|-------|--------|--------|------------|
| 8 | SU-R-001 | Complete | G-002 |
| 9 | SS-R-001 | Blocked | G-002 (awaiting user research) |
| 10 | SU-A-001 | Planned | SU-R-001 |
| 11 | SU-I-001 | Planned | SU-A-001, CO-I-001 |
| 12 | SS-A-001 | Planned | SS-R-001 |
| 13 | SS-I-001 | Planned | SS-A-001 |
| 14 | CP-I-001 | Planned | CO-I-001 |

### Phase 3: Polish

See [SPRINT-PLANNING.md](./SPRINT-PLANNING.md) for complete roadmap.

---

## Sprint Statistics

| Metric | Value |
|--------|-------|
| Total Sprints Created | 10 |
| Completed | 8 |
| Blocked | 1 |
| In Progress | 1 |
| Total Tests | 415+ |

---

## Quick Search by Topic

### Infrastructure & Setup
- [G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) - Monorepo, TypeScript, Playwright
- [G-002](./Global/Sprint-G-002/SPRINT-PLAN.md) - Login, sessions, Selector Registry

### Research & Discovery
- [CB-R-001](./Modules/CartBuilder/Sprint-CB-R-001/SPRINT-PLAN.md) - Order history selectors
- [SU-R-001](./Modules/Substitution/Sprint-SU-R-001/RESEARCH-SUMMARY.md) - Product search selectors
- [SS-R-001](./Modules/SlotScout/Sprint-SS-R-001/README.md) - Delivery slot research

### Architecture & Design
- [CB-A-001](./Modules/CartBuilder/Sprint-CB-A-001/SPRINT-PLAN.md) - CartBuilder types
- [CO-A-001](./Modules/Coordinator/Sprint-CO-A-001/SPRINT-PLAN.md) - Coordinator types

### Implementation
- [CB-I-001](./Modules/CartBuilder/Sprint-CB-I-001/SPRINT-PLAN.md) - CartBuilder tools
- [CO-I-001](./Modules/Coordinator/Sprint-CO-I-001/SPRINT-PLAN.md) - Coordinator implementation

---

## Navigation

| Document | Purpose |
|----------|---------|
| [MASTER-SPRINT.md](./MASTER-SPRINT.md) | Current state, active sprints, recovery entry |
| [SPRINT-PLANNING.md](./SPRINT-PLANNING.md) | Master task list and roadmap |
| This file | Complete sprint lookup |
| [MASTER-LOG.md](./Logs/MASTER-LOG.md) | AI session history |

---

*Last Updated: 2026-01-16 (Sprint-EXT-R-001 added)*
