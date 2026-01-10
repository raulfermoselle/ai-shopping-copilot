# Sprint Index

> **Quick Reference**: Find any sprint by branch, name, or description.

<!-- FRAMEWORK_VERSION: 2.0.0 -->

---

## Sprint Overview

> **v2.0 Format**: Sprints are indexed by branch to support concurrent development.

| Sprint ID | Branch | Created | Status | Merged To |
|-----------|--------|---------|--------|-----------|
| [Sprint-G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) | main | 2026-01-10 | Planned | - |

---

## Active Sprints by Branch

| Branch | Current Sprint | Status |
|--------|----------------|--------|
| main | Sprint-G-001 | Planned |

---

## Quick Search by Topic

### Infrastructure & Setup
- [Sprint-G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) - Project scaffolding, Playwright setup, TypeScript config

### Features
- (Add sprints as they are created)

### Bug Fixes
- (Add sprints as they are created)

### Documentation
- (Add sprints as they are created)

---

## Sprint Categories

### Phase 1: Foundation
Core infrastructure and setup sprints.
- [Sprint-G-001](./Global/Sprint-G-001/SPRINT-PLAN.md) - Project scaffolding, Playwright setup
- Sprint-G-002 (Planned) - Auchan.pt login automation
- Sprint-CB-R-001 (Planned) - Research Auchan.pt order history
- Sprint-CB-A-001 (Planned) - CartBuilder architecture
- Sprint-CB-I-001 (Planned) - CartBuilder implementation
- Sprint-CO-A-001 (Planned) - Coordinator architecture
- Sprint-CO-I-001 (Planned) - Phase 1 Coordinator implementation

### Phase 2: Features
Main functionality implementation.
- See [SPRINT-PLANNING.md](./SPRINT-PLANNING.md) for 12 planned sprints

### Phase 3: Polish
Testing, documentation, deployment.
- See [SPRINT-PLANNING.md](./SPRINT-PLANNING.md) for 8 planned sprints

---

## Sprint Folder Structure (v2.0)

Sprints are organized by branch namespace:

```
Active/
├── {branch-short}/                    # Branch namespace
│   ├── Sprint-{branch}-01-{name}/
│   │   ├── SPRINT-PLAN.md
│   │   └── SPRINT-LOG.md
│   └── Sprint-{branch}-02-{name}/
├── main/                              # Main branch sprints
│   └── Sprint-main-01-{name}/
└── ...
```

### Branch Name Transformation

| Git Branch | Sprint Namespace | Example Sprint |
|------------|------------------|----------------|
| `feat/user-auth` | `user-auth` | Sprint-user-auth-01-login |
| `fix/bug-123` | `bug-123` | Sprint-bug-123-01-fix |
| `main` | `main` | Sprint-main-01-hotfix |

---

## Archived Sprints

Sprints are archived when their branch is merged:

```
Archive/
├── user-auth/                         # Archived when feat/user-auth merged
│   └── Sprint-user-auth-01-login/
└── ...
```

| Sprint ID | Branch | Merged To | Merged Date |
|-----------|--------|-----------|-------------|
| - | - | - | No archived sprints yet |

---

## Navigation

| Document | Purpose |
|----------|---------|
| [MASTER-SPRINT.md](./MASTER-SPRINT.md) | Current state, active sprints, recovery entry |
| [SPRINT-PLANNING.md](./SPRINT-PLANNING.md) | Master task list and roadmap |
| This file | Quick sprint lookup |

---

## Version History

| Version | Change |
|---------|--------|
| 2.0.0 | Branch-based indexing, concurrent sprint support |
| 1.0.0 | Sequential numbering |

---

*Last Updated: 2026-01-10*
