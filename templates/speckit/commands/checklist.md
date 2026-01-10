---
description: Generate validation checklists (Sprint-Speckit Integration)
---

# /speckit.checklist - Checklist Generation

This command generates feature-specific validation checklists from specifications, plans, and tasks.

## Usage

```
/speckit.checklist [feature-id] [type]
```

**Types**: `requirements`, `design`, `implementation`, `review`, `all`

**Examples**:
```
/speckit.checklist 001-user-auth requirements
/speckit.checklist 001-user-auth all
```

---

## Checklist Types

| Type | When to Generate | Purpose |
|------|------------------|---------|
| requirements | After `/speckit.specify` | Validate spec completeness |
| design | After `/speckit.plan` | Validate plan quality |
| implementation | During `/speckit.implement` | Track task completion |
| review | Before `/sprint-complete` | Final validation |

---

## Workflow

### Step 1: Load Source Artifacts

Based on checklist type:

| Type | Sources |
|------|---------|
| requirements | spec.md |
| design | plan.md, data-model.md, contracts/ |
| implementation | tasks.md, SPRINT-LOG.md |
| review | All artifacts |

### Step 2: Extract Checklist Items

From **spec.md**:
- User story format validation
- Acceptance criteria presence
- Success metrics definition
- Edge case coverage

From **plan.md**:
- Technology stack documentation
- Constitution compliance
- Risk assessment
- Sprint mapping

From **tasks.md**:
- Task completion status
- Test-first ordering
- Dependency satisfaction
- Phase completion

### Step 3: Generate Checklist

Use `templates/speckit/checklist-template.md` as base.

Replace sample items with actual items derived from:
- User request context
- Feature specification
- Technical plans
- Implementation tasks

### Step 4: Save Checklist

Output to:
```
Sprints/Specs/[feature-id]/checklists/[type].md
```

---

## Checklist Structure

```markdown
# Checklist: [Type] - [Feature Name]

| Field | Value |
|-------|-------|
| Created | [DATE] |
| Feature | [feature-id] |
| Type | [type] |

---

## [Category 1]

- [ ] CHK001: [Item derived from spec/plan/tasks]
- [ ] CHK002: [Item derived from spec/plan/tasks]

## [Category 2]

- [ ] CHK003: [Item derived from spec/plan/tasks]
...

---

## Summary

| Category | Total | Complete |
|----------|-------|----------|
| [Cat 1] | X | 0 |
| [Cat 2] | Y | 0 |
```

---

## Requirements Checklist Items

Generated from `spec.md`:

### User Story Quality
```
- [ ] CHK001: US1 follows "As a... I want... So that..." format
- [ ] CHK002: US1 has priority assigned (P1/P2/P3)
- [ ] CHK003: US1 has acceptance scenarios
- [ ] CHK004: US1 is independently testable
```

### Functional Requirements
```
- [ ] CHK010: FR001 "[requirement]" is measurable
- [ ] CHK011: FR001 traces to user story
- [ ] CHK012: FR002 "[requirement]" is measurable
```

### Success Criteria
```
- [ ] CHK020: Metric "[name]" has specific target
- [ ] CHK021: Metric "[name]" has measurement method
```

---

## Design Checklist Items

Generated from `plan.md`:

### Technical Context
```
- [ ] CHK030: Technology stack documented
- [ ] CHK031: All dependencies listed with versions
- [ ] CHK032: Project structure defined
```

### Constitution Compliance
```
- [ ] CHK040: Article III (Test-First) compliance documented
- [ ] CHK041: Article VI (Simplicity) - no premature abstraction
- [ ] CHK042: Article VIII (Library-First) - modular design
```

### Data Model
```
- [ ] CHK050: Entity "[name]" fields complete
- [ ] CHK051: Entity "[name]" relationships defined
```

---

## Implementation Checklist Items

Generated from `tasks.md`:

### Phase Completion
```
- [ ] CHK060: Setup phase (T001-T003) complete
- [ ] CHK061: Foundation phase (T004-T007) complete
- [ ] CHK062: US1 phase (T008-T015) complete
```

### Test-First Verification
```
- [ ] CHK070: T008 (tests) completed before T010 (impl)
- [ ] CHK071: All US1 tests pass
```

### Code Quality
```
- [ ] CHK080: Coverage >= 80% for US1
- [ ] CHK081: No console errors/warnings
```

---

## Review Checklist Items

Generated from all artifacts:

### Documentation
```
- [ ] CHK090: README updated with feature
- [ ] CHK091: API documentation complete
- [ ] CHK092: CHANGELOG entry added
```

### Sprint Closure
```
- [ ] CHK100: All acceptance criteria met
- [ ] CHK101: SPRINT-LOG.md complete
- [ ] CHK102: Lessons learned documented
- [ ] CHK103: Next sprint tasks identified
```

---

## Sprint Integration

### Checklist Timing

| Sprint Phase | Checklist |
|--------------|-----------|
| Pre-Sprint | requirements |
| Sprint Start | design |
| Sprint Execution | implementation |
| Sprint End | review |

### Validation Gates

**Before `/speckit.plan`**:
- Requirements checklist MUST be 100% complete

**Before `/speckit.implement`**:
- Design checklist MUST be 100% complete

**Before `/sprint-complete`**:
- Implementation checklist MUST be 100%
- Review checklist MUST be 100%

---

## Output Format

```
## Checklist Generated

**Feature**: [feature-id]
**Type**: [type]
**Path**: `Sprints/Specs/[feature-id]/checklists/[type].md`

### Summary
| Category | Items | Status |
|----------|-------|--------|
| User Story Quality | 8 | Pending |
| Functional Reqs | 12 | Pending |
| Success Criteria | 5 | Pending |
| **Total** | **25** | **0/25** |

### Next Steps
1. Review checklist items
2. Mark items complete as validated
3. Run dependent command when checklist passes
```

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Source not found | Run prerequisite command |
| Invalid type | Show valid types |
| Checklist exists | Offer to regenerate or update |
