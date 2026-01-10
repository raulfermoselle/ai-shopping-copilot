---
description: Manage project constitution
---

# /speckit-constitution - Constitution Management

Creates or amends the project constitution.

## Usage

```
/speckit-constitution [action]
```

**Actions**:
- `init` - Create initial constitution
- `amend "description"` - Modify existing
- `check [feature-id]` - Validate against constitution
- `show` - Display current

## Constitution Location

```
memory/constitution.md
```

## Default Articles

| # | Article | Key Rule |
|---|---------|----------|
| I | Sprint-First | All work in sprints |
| II | Spec-Driven | Specs before code |
| III | Test-First | Tests before impl (NON-NEGOTIABLE) |
| IV | Autonomous | No interruptions |
| V | Context Recovery | Full recovery from docs |
| VI | Simplicity | No premature abstraction |
| VII | Integration-First | Real dependencies |
| VIII | Library-First | Modular design |
| IX | Documentation | Docs with code |
| X | Deadlock | Progress over perfection |

---

## Actions

### Init

```
/speckit-constitution init
```

Creates `memory/constitution.md` with:
- 10 core articles
- Governance rules
- Version 1.0.0

### Amend

```
/speckit-constitution amend "Add Article XI: API Versioning"
```

Updates constitution with:
- New/modified article
- Version bump (MAJOR/MINOR/PATCH)
- Amendment history

### Check

```
/speckit-constitution check 001-user-authentication
```

Validates feature against each article:

```markdown
| Article | Status | Notes |
|---------|--------|-------|
| I | PASS | Sprint allocated |
| II | PASS | Spec exists |
| III | VIOLATION | Tests after impl |
| ... | ... | ... |
```

### Show

```
/speckit-constitution show
```

Displays current constitution summary.

---

## Version Bumping

| Change | Bump |
|--------|------|
| Incompatible principle | MAJOR |
| New article | MINOR |
| Clarification | PATCH |

---

## Integration Points

- Used by `/speckit-plan` for compliance
- Used by `/speckit-analyze` for validation
- Used by `/sprint-start` for checks
