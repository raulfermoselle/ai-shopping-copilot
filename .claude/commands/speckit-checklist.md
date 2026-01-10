---
description: Generate validation checklists
---

# /speckit-checklist - Checklist Generation

Generates feature-specific validation checklists.

## Usage

```
/speckit-checklist [feature-id] [type]
```

**Types**: `requirements`, `design`, `implementation`, `review`, `all`

## Execution Steps

### 1. Determine Type & Sources

| Type | Source Files |
|------|--------------|
| requirements | spec.md |
| design | plan.md, data-model.md, contracts/ |
| implementation | tasks.md, SPRINT-LOG.md |
| review | All artifacts |

### 2. Extract Items

From spec.md (requirements):
- User story format
- Acceptance criteria presence
- Success metrics

From plan.md (design):
- Technology documentation
- Constitution compliance
- Risk assessment

From tasks.md (implementation):
- Task completion
- Test-first ordering
- Phase completion

### 3. Generate Checklist

Use template: `templates/speckit/checklist-template.md`

Write to: `Sprints/Specs/{feature_id}/checklists/{type}.md`

### 4. Report

Output checklist summary and location.

---

## Output Example

```
## Checklist Generated

**Feature**: 001-user-authentication
**Type**: requirements
**Path**: `Sprints/Specs/001-user-authentication/checklists/requirements.md`

### Summary
| Category | Items |
|----------|-------|
| User Story Quality | 8 |
| Functional Reqs | 12 |
| Success Criteria | 5 |
| **Total** | **25** |

### Next Steps
1. Review and mark items complete
2. Run dependent command when done
```

---

## Sprint Integration

| Sprint Phase | Checklist |
|--------------|-----------|
| Pre-Sprint | requirements |
| Sprint Start | design |
| Execution | implementation |
| Sprint End | review |

---

## Validation Gates

- Before `/speckit-plan`: requirements complete
- Before `/speckit-implement`: design complete
- Before `/sprint-complete`: implementation + review complete
