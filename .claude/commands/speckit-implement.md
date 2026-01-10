---
description: Execute tasks from tasks.md during sprint
---

# /speckit-implement - Task Execution

Executes tasks from tasks.md within the active sprint context.

## Usage

```
/speckit-implement [feature-id]
```

## Prerequisites

- Tasks exist: `Sprints/Specs/{feature-id}/tasks.md`
- Sprint created via `/sprint-new`
- Sprint started via `/sprint-start`

## Execution Steps

### 1. Load Context

```python
# Load speckit artifacts
tasks = read_file(f"Sprints/Specs/{feature_id}/tasks.md")
plan = read_file(f"Sprints/Specs/{feature_id}/plan.md")

# Load sprint context
sprint_plan = read_file("Sprints/Active/Sprint-XX/SPRINT-PLAN.md")
sprint_log = read_file("Sprints/Active/Sprint-XX/SPRINT-LOG.md")
```

### 2. Validate Checklists

```python
req_checklist = f"Sprints/Specs/{feature_id}/checklists/requirements.md"
design_checklist = f"Sprints/Specs/{feature_id}/checklists/design.md"

if not checklist_complete(req_checklist):
    error("Requirements checklist incomplete")

if not checklist_complete(design_checklist):
    error("Design checklist incomplete")
```

### 3. Verify Environment

- Check technology stack from plan
- Verify dependencies installed
- Create/update ignore files if needed

### 4. Task Extraction

Parse tasks.md:
- Identify current phase
- Extract pending tasks
- Identify parallel tasks `[P]`
- Map dependencies

### 5. Execution Loop

```python
for phase in phases:
    while phase.has_pending_tasks():
        # Get executable tasks
        parallel_tasks = [t for t in phase.pending if t.is_parallel and t.deps_met]
        sequential_tasks = [t for t in phase.pending if not t.is_parallel and t.deps_met]

        # Execute parallel tasks concurrently
        if parallel_tasks:
            execute_parallel(parallel_tasks)

        # Execute sequential tasks in order
        for task in sequential_tasks:
            execute_task(task)

            # Update progress
            mark_complete(task, tasks_file)
            log_progress(task, sprint_log)

            # Check deadlock
            if task.attempts >= 3:
                mark_blocked(task)
                log_exception(task)
                continue
```

### 6. Test-First Enforcement

For each user story phase:

```python
# Find test tasks for this story
test_tasks = [t for t in story_tasks if "Write tests" in t.description]

# Verify tests exist and fail
for test_task in test_tasks:
    execute_task(test_task)
    run_tests()  # Must FAIL (red phase)

# Then execute implementation
for impl_task in impl_tasks:
    execute_task(impl_task)
    run_tests()  # Must PASS (green phase)
```

### 7. Progress Tracking

After each task:

1. Mark `[x]` in tasks.md
2. Update SPRINT-LOG.md:
   ```markdown
   ### Task T001: Initialize project

   **Status**: COMPLETED
   **Timestamp**: 2024-01-15 14:30

   **Implementation**:
   - Created `src/` directory structure
   - Added `package.json`

   **Files Modified**:
   - src/ (created)
   - package.json (created)
   ```
3. Commit if significant progress

### 8. Autonomous Execution

Follow Constitution Article IV:

**MUST**:
- Execute without questions
- Document decisions in SPRINT-LOG.md
- Follow existing patterns
- Log uncertainties and continue

**MUST NOT**:
- Ask clarifying questions
- Wait for approval
- Stop on non-critical errors

### 9. Deadlock Handling

If task fails 3 times:

1. Log in SPRINT-LOG.md as deadlock
2. Create EXCEPTIONS-LOG.md entry
3. Mark task `[B]` (blocked)
4. Continue to next task
5. Do NOT stop execution

### 10. Completion

When all tasks done:
- Run final validation
- Update implementation checklist
- Prepare completion report

---

## Output Example

### During Execution

```
## Executing Sprint 12 - User Authentication

### Current Progress
| Phase | Complete | Total | Status |
|-------|----------|-------|--------|
| Setup | 3 | 3 | DONE |
| Foundation | 2 | 4 | IN PROGRESS |
| US1 | 0 | 8 | PENDING |

### Active Task
T006: Configure API routes | src/routes/

### Recent Completions
- T004: Create data models [DONE]
- T005: Setup database [DONE]
```

### Completion Report

```
## Implementation Complete

**Feature**: 001-user-authentication
**Sprint**: 12
**Status**: COMPLETE

### Task Summary
| Phase | Complete | Blocked |
|-------|----------|---------|
| Setup | 3 | 0 |
| Foundation | 4 | 0 |
| US1 | 7 | 1 |
| **Total** | **14** | **1** |

### Blocked Tasks
- T012: OAuth integration - Needs API credentials

### Files Modified
- src/models/user.ts (created)
- src/routes/auth.ts (created)
- tests/unit/auth.test.ts (created)
- package.json (modified)

### Next Steps
1. Resolve blocked tasks (T012)
2. Run `/speckit-analyze 001-user-authentication`
3. Run `/sprint-complete` if ready
```

---

## Integration Points

- **Before**: `/speckit-tasks`, `/sprint-new`, `/sprint-start`
- **During**: Autonomous execution
- **After**: `/speckit-analyze`, `/sprint-complete`

---

## Error Handling

| Error | Action |
|-------|--------|
| Tests not found | Create test file first |
| Build fails | Fix and retry (max 3) |
| Deadlock | Mark blocked, continue |
| Missing dep | Install and retry |
