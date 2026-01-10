---
description: Generate task breakdown from implementation plan (Sprint-Speckit Integration)
---

# /speckit.tasks - Task Generation

This command generates a structured, executable task list from an implementation plan, ready for sprint integration.

## Usage

```
/speckit.tasks [feature-id]
```

**Example**:
```
/speckit.tasks 001-user-auth
```

---

## Prerequisites

- Implementation plan exists at `Sprints/Specs/[feature-id]/plan.md`
- Design checklist passed
- Data model and contracts defined

---

## Workflow

### Step 1: Load Design Artifacts

Read from `Sprints/Specs/[feature-id]/`:
- `plan.md` (required)
- `spec.md` (required)
- `data-model.md` (optional)
- `contracts/` (optional)
- `research.md` (optional)

### Step 2: Extract Components

From plan.md:
- Technology stack
- Project structure
- Phase breakdown

From spec.md:
- User stories with priorities
- Acceptance criteria

From data-model.md:
- Entities to create
- Relationships to implement

From contracts/:
- Endpoints to build
- Request/response handling

### Step 3: Generate Tasks

Use `templates/speckit/tasks-template.md` to create structured tasks:

#### Task Format
```
- [ ] [TaskID] [P] [Story] Description | file/path
```

- `[TaskID]`: T001, T002, etc.
- `[P]`: Present only if task can run in parallel
- `[Story]`: User story reference (US1, US2, etc.)
- Description with explicit file path

#### Phase Organization

1. **Setup**: Project initialization (T001-Txxx)
2. **Foundation**: Core infrastructure (Txxx-Txxx)
3. **US1 Implementation**: P1 user story (Txxx-Txxx)
4. **US2 Implementation**: P2 user story (if applicable)
5. **Polish**: Documentation, cleanup (Txxx-Txxx)

### Step 4: Test-First Ordering

For each user story phase:
1. Write tests FIRST (must fail before implementation)
2. Implement to make tests pass
3. Verify all tests green

### Step 5: Dependency Mapping

Generate dependency graph showing:
- Sequential dependencies (must wait)
- Parallel opportunities (can run together)
- Critical path identification

### Step 6: Sprint Integration

Map tasks to sprint structure:

```
Sprint [N] - SPRINT-PLAN.md
├── Phase: Setup (T001-T003)
├── Phase: Foundation (T004-T007)
└── Phase: US1 (T008-T015)

Sprint [N+1] - SPRINT-PLAN.md (if needed)
├── Phase: US2 (T016-T022)
└── Phase: Polish (T023-T027)
```

---

## Sprint Task Mapping

### Automatic SPRINT-PLAN.md Update

Tasks are formatted for direct copy to sprint plan:

```markdown
## Task Breakdown

| ID | Task | Priority | Status | Source |
|----|------|----------|--------|--------|
| T001 | Initialize project | HIGH | PENDING | speckit:T001 |
| T002 | Configure environment | HIGH | PENDING | speckit:T002 |
```

### Traceability

Each sprint task links back to speckit task:
- `Source: speckit:T001` indicates origin
- Enables analysis and reporting
- Supports constitution compliance check

---

## Execution Strategies

### Option A: MVP-First (Recommended)

```
1. Setup → Foundation → US1 → Deploy
2. Validate MVP
3. US2 → Polish → Final Deploy
```

Best for: Risk reduction, early feedback

### Option B: Full Feature

```
1. Setup → Foundation
2. US1 + US2 (parallel if independent)
3. Polish → Deploy
```

Best for: Well-defined requirements, time pressure

### Option C: Incremental

```
1. Setup → Foundation
2. US1 → Validate → US2 → Validate → Polish
```

Best for: Uncertain requirements, learning-focused

---

## Output Format

```
## Task Generation Complete

**Feature**: [feature-id]
**Tasks**: `Sprints/Specs/[feature-id]/tasks.md`

### Task Summary
| Phase | Count | Parallelizable |
|-------|-------|----------------|
| Setup | 3 | 2 |
| Foundation | 4 | 3 |
| US1 | 8 | 4 |
| US2 | 7 | 4 |
| Polish | 5 | 3 |
| **Total** | **27** | **16** |

### Sprint Allocation
- Sprint [N]: T001-T015 (Setup + Foundation + US1)
- Sprint [N+1]: T016-T027 (US2 + Polish)

### Execution Recommendation
MVP-First approach recommended:
1. Complete Sprint [N] with US1
2. Deploy and validate
3. Continue to Sprint [N+1]

### Next Steps
1. Review task breakdown
2. Run `/sprint-new [N]` to create sprint
3. Copy tasks to SPRINT-PLAN.md
4. Run `/sprint-start` to begin execution
```

---

## Integration with Sprint Commands

After task generation:

### Create Sprint
```
/sprint-new [number] [name]
```

### Start Sprint
```
/sprint-start [sprint-id]
```

### Task Execution
Tasks execute during sprint following:
- Constitution principles
- Autonomous execution rules
- Deadlock handling protocol

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Plan not found | Run `/speckit.plan` first |
| Design checklist incomplete | Complete design checklist |
| No user stories | Update spec with stories |
| Exceeds sprint capacity | Split into multiple sprints |

---

## Task Validation

Before completion, validate:
- [ ] All user stories have tasks
- [ ] Tests precede implementation
- [ ] Dependencies are acyclic
- [ ] Parallel tasks are independent
- [ ] Sprint capacity not exceeded
