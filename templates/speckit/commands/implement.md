---
description: Execute tasks from tasks.md during sprint (Sprint-Speckit Integration)
---

# /speckit.implement - Task Execution

This command orchestrates implementation by executing tasks from `tasks.md` within the sprint context.

## Usage

```
/speckit.implement [feature-id]
```

**Example**:
```
/speckit.implement 001-user-auth
```

---

## Prerequisites

- Tasks exist at `Sprints/Specs/[feature-id]/tasks.md`
- Active sprint created via `/sprint-new`
- Sprint started via `/sprint-start`

---

## Workflow

### Phase 1: Pre-Implementation

1. **Load Context**
   - Read `tasks.md`
   - Read `plan.md`
   - Read active `SPRINT-PLAN.md`
   - Read `SPRINT-LOG.md`

2. **Validate Checklists**
   - Requirements checklist: MUST be complete
   - Design checklist: MUST be complete
   - If incomplete: STOP and prompt user

3. **Verify Environment**
   - Check technology stack from plan
   - Verify dependencies installed
   - Create/update ignore files

### Phase 2: Task Extraction

1. Parse `tasks.md` for all tasks
2. Identify current phase
3. Extract:
   - Pending tasks
   - Parallel tasks `[P]`
   - Sequential tasks
   - Dependencies

### Phase 3: Execution Loop

For each phase in order:

```
WHILE phase has pending tasks:
    1. Get next executable task(s)
    2. For parallel tasks: execute concurrently
    3. For sequential tasks: execute in order
    4. Update task status in tasks.md
    5. Log progress in SPRINT-LOG.md
    6. Check for deadlock (3 failures)
    7. If deadlock: mark BLOCKED, continue
```

### Phase 4: Test-First Enforcement

For implementation tasks:

1. **Locate tests**: Find test tasks for this story
2. **Verify tests exist**: Tests must be written first
3. **Run tests**: Confirm they FAIL (red phase)
4. **Implement**: Write code to pass tests
5. **Verify green**: All tests must pass
6. **Refactor**: Clean up if needed

### Phase 5: Progress Tracking

After each task:

1. Mark `[x]` in tasks.md
2. Update SPRINT-LOG.md with:
   - Task completed
   - Files modified
   - Decisions made
3. Commit if significant progress

### Phase 6: Completion

When all tasks done:

1. Run final validation
2. Update checklists
3. Prepare sprint completion report

---

## Sprint Integration

### SPRINT-LOG.md Updates

```markdown
### Task T001: [Task Name]

**Status**: COMPLETED
**Timestamp**: YYYY-MM-DD HH:MM

**Implementation**:
- Created `src/feature/component.ts:1-50`
- Modified `tests/unit/component.test.ts:25-40`

**Notes**:
- Used [pattern] for [reason]
- Decision: [what was decided]
```

### SPRINT-PLAN.md Sync

Task status mirrors between:
- `Sprints/Specs/[feature-id]/tasks.md`
- `Sprints/Active/Sprint-XX/SPRINT-PLAN.md`

---

## Autonomous Execution Rules

During implementation, follow Constitution Article IV:

**MUST**:
- Execute without stopping for questions
- Document decisions in SPRINT-LOG.md
- Follow existing codebase patterns
- Log uncertainties and continue

**MUST NOT**:
- Ask clarifying questions
- Wait for approval
- Present options and wait
- Stop on non-critical errors

---

## Deadlock Handling

If task fails 3 consecutive times:

1. Log in SPRINT-LOG.md:
   ```markdown
   ### Deadlock: Task T005

   **Attempts**: 3
   **Last Error**: [error message]
   **Status**: BLOCKED
   **Resolution Needed**: [what's required]
   ```

2. Create EXCEPTIONS-LOG.md entry:
   ```markdown
   | DL001 | T005 | Task deadlock | [timestamp] | Pending |
   ```

3. Mark task `[B]` (blocked) in tasks.md
4. Continue to next task
5. Do NOT stop execution

---

## Parallel Execution

Tasks marked `[P]` can execute concurrently:

```
Phase: Foundation
├── [P] T004: Create data models      ← parallel
├── [P] T005: Setup API routes        ← parallel
├── [P] T006: Configure test fixtures ← parallel
└── T007: Verify foundation           ← sequential (depends on above)
```

Execution order:
1. Start T004, T005, T006 concurrently
2. Wait for all to complete
3. Execute T007

---

## Output Format

### During Execution

```
## Executing Sprint [N] - [Feature Name]

### Current Progress
| Phase | Complete | Total | Status |
|-------|----------|-------|--------|
| Setup | 3 | 3 | DONE |
| Foundation | 2 | 4 | IN PROGRESS |
| US1 | 0 | 8 | PENDING |

### Active Task
T006: Configure test fixtures | tests/fixtures/

### Recent Completions
- T004: Create data models [DONE]
- T005: Setup API routes [DONE]
```

### Completion Report

```
## Implementation Complete

**Feature**: [feature-id]
**Sprint**: [sprint-id]
**Status**: COMPLETE / PARTIAL

### Task Summary
| Phase | Complete | Blocked | Total |
|-------|----------|---------|-------|
| Setup | 3 | 0 | 3 |
| Foundation | 4 | 0 | 4 |
| US1 | 7 | 1 | 8 |
| **Total** | **14** | **1** | **15** |

### Blocked Tasks
- T012: [reason] - Needs [resolution]

### Files Modified
- src/feature/component.ts (created)
- tests/unit/component.test.ts (created)
- package.json (modified)

### Next Steps
1. Review blocked tasks
2. Run `/speckit.analyze` for consistency check
3. Complete sprint via `/sprint-complete`
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Tests not found | Create test file first |
| Tests pass before impl | Verify test coverage |
| Build fails | Fix and retry (up to 3) |
| Dependency missing | Install and retry |
| Deadlock | Mark blocked, continue |

---

## Integration Points

### Before Implementation
- `/speckit.specify` - Create spec
- `/speckit.plan` - Create plan
- `/speckit.tasks` - Generate tasks
- `/sprint-new` - Create sprint
- `/sprint-start` - Begin sprint

### During Implementation
- `/speckit.implement` - Execute tasks (this command)

### After Implementation
- `/speckit.analyze` - Consistency check
- `/sprint-complete` - Close sprint
