---
description: Create implementation plan from specification (Sprint-Speckit Integration)
---

# /speckit.plan - Implementation Planning

This command generates a detailed implementation plan from a feature specification, integrated with Sprint Management.

## Usage

```
/speckit.plan [feature-id]
```

**Example**:
```
/speckit.plan 001-user-auth
```

If no feature-id provided, uses the most recent specification.

---

## Prerequisites

- Feature specification exists at `Sprints/Specs/[feature-id]/spec.md`
- Requirements checklist passed
- No unresolved `[NEEDS CLARIFICATION]` markers

---

## Workflow

### Phase 0: Research & Clarification

1. **Load Specification**: Read `spec.md` and requirements checklist
2. **Identify Technical Unknowns**: What needs investigation?
3. **Research**: Gather technical context
4. **Document Findings**: Create `research.md`

### Phase 1: Design & Contracts

1. **Data Model**: Create `data-model.md`
   - Entity definitions with fields
   - Relationships and constraints
   - Validation rules
   - State transitions

2. **API Contracts**: Create `contracts/` directory
   - Endpoint definitions
   - Request/response schemas
   - Error responses

3. **Quickstart Guide**: Create `quickstart.md`
   - Implementation guide
   - Key decisions

### Phase 2: Plan Generation

1. **Load Template**: Use `templates/speckit/plan-template.md`
2. **Technical Context**: Document stack, dependencies
3. **Constitution Check**: Validate against project principles
4. **Project Structure**: Define file organization
5. **Sprint Mapping**: Allocate to sprints

---

## Constitution Check

Before proceeding, validate against `memory/constitution.md`:

| Principle | Check |
|-----------|-------|
| Sprint-First | Feature fits within sprint capacity |
| Spec-Driven | Plan derived from specification |
| Test-First | Test strategy included |
| Simplicity | No premature abstractions |
| Library-First | Modular design considered |

**Gate**: If any check fails, document justification before proceeding.

---

## Sprint Integration

### Automatic Sprint Allocation

Based on estimated effort:

| Total Points | Allocation |
|--------------|------------|
| <= 13 points | Single sprint |
| 14-26 points | 2 sprints |
| 27-40 points | 3 sprints |
| > 40 points | Epic decomposition needed |

### Sprint Creation

If sprints don't exist:

1. Check `Sprints/SPRINT-INDEX.md` for next sprint number
2. Create sprint folders via sprint management
3. Link plan to sprint tasks

### Phase Mapping to Sprints

| Phase | Sprint Position |
|-------|-----------------|
| Setup | Sprint N - Start |
| Foundation | Sprint N - Middle |
| US1 Implementation | Sprint N - End |
| US2 Implementation | Sprint N+1 (if multi) |
| Polish | Final sprint |

---

## Output Artifacts

```
Sprints/Specs/[feature-id]/
├── spec.md              # (existing)
├── plan.md              # Implementation plan
├── research.md          # Technical research
├── data-model.md        # Entity definitions
├── quickstart.md        # Implementation guide
├── contracts/
│   └── api.yaml         # API contracts
└── checklists/
    ├── requirements.md  # (existing)
    └── design.md        # Design validation
```

---

## Risk Assessment

For each identified risk:

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [risk] | Low/Med/High | Low/Med/High | [strategy] |

Include risks in sprint planning considerations.

---

## Output Format

```
## Implementation Plan Complete

**Feature**: [feature-id]
**Plan**: `Sprints/Specs/[feature-id]/plan.md`

### Technical Summary
- Language: [language]
- Framework: [framework]
- Database: [database]

### Sprint Allocation
- Sprint [N]: Setup + Foundation + US1
- Sprint [N+1]: US2 + Polish (if applicable)

### Artifacts Created
- [x] plan.md
- [x] research.md
- [x] data-model.md
- [x] contracts/api.yaml
- [x] checklists/design.md

### Constitution Check
- [x] Sprint-First: Fits in [N] sprint(s)
- [x] Test-First: Strategy documented
- [x] Simplicity: No premature abstraction

### Next Steps
1. Review plan for accuracy
2. Run `/speckit.tasks` to generate task list
3. Run `/sprint-new` to create sprint(s)
```

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Spec not found | Run `/speckit.specify` first |
| Checklist incomplete | Complete requirements checklist |
| Clarifications pending | Run `/speckit.clarify` first |
| Constitution violation | Document justification or revise |

---

## Handoff to Tasks

After plan completion, run:
```
/speckit.tasks [feature-id]
```

This generates the detailed task list for sprint execution.
