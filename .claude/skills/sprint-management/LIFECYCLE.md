# Sprint Lifecycle

Complete documentation of the sprint lifecycle in the Sprint Management Framework.

## Lifecycle Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CREATE    │────▶│    START    │────▶│   EXECUTE   │────▶│  COMPLETE   │
│             │     │             │     │             │     │             │
│ /sprint-new │     │/sprint-start│     │  Autonomous │     │/sprint-     │
│             │     │             │     │  Execution  │     │  complete   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  SPRINT-PLAN.md    Context Recovery    SPRINT-LOG.md         Archive
  SPRINT-LOG.md     Load Sprint Plan    Task Updates       Link to Next
  MASTER-SPRINT     Begin First Task    Decisions          Update Index
```

## Phase 1: Create

**Trigger**: User requests new sprint or previous sprint completes

**Actions**:
1. Determine sprint naming (branch + number + name)
2. Create directory structure
3. Generate SPRINT-PLAN.md from template
4. Generate empty SPRINT-LOG.md
5. Update MASTER-SPRINT.md with new active sprint
6. Update SPRINT-INDEX.md
7. Initialize local state
8. Auto-commit if enabled

**Artifacts Created**:
- `Sprints/Active/{branch}/Sprint-{id}/SPRINT-PLAN.md`
- `Sprints/Active/{branch}/Sprint-{id}/SPRINT-LOG.md`

**State Changes**:
- MASTER-SPRINT.md: New entry in Active Sprints
- SPRINT-INDEX.md: New entry
- `.sprint-state.local`: Updated with new sprint

## Phase 2: Start

**Trigger**: User starts work session or resumes after break

**Actions**:
1. Execute context recovery protocol
2. Load active sprint for current branch
3. Parse SPRINT-PLAN.md for task list
4. Parse SPRINT-LOG.md for progress
5. Identify next incomplete task
6. Update local state with session info
7. Begin task execution

**Pre-conditions**:
- Active sprint exists for current branch
- SPRINT-PLAN.md has tasks defined
- Git branch matches expected branch

**Output**:
- Context recovery summary
- Current sprint status
- Next task to execute

## Phase 3: Execute

**Trigger**: Sprint started, tasks pending

**Actions** (per task):
1. Mark task IN_PROGRESS in SPRINT-LOG.md
2. Update `.sprint-state.local` with current task
3. Execute task following description
4. Apply test-first if applicable (write tests → run → implement → run)
5. Document implementation in SPRINT-LOG.md
6. Mark task COMPLETED or BLOCKED
7. Commit progress if significant
8. Move to next task

**Execution Rules**:

| Rule | Description |
|------|-------------|
| Autonomous | No questions, no waiting for approval |
| Documented | All decisions logged in SPRINT-LOG.md |
| Pattern-following | Match existing codebase patterns |
| Deadlock-aware | 3 failures → mark blocked, continue |
| Test-first | Tests before implementation (Article III) |

**Deadlock Handling**:
```
Attempt 1 → Fail → Retry
Attempt 2 → Fail → Retry  
Attempt 3 → Fail → DEADLOCK
  │
  ├── Log in SPRINT-LOG.md (Deadlock Tracking)
  ├── Log in EXCEPTIONS-LOG.md
  ├── Mark task BLOCKED
  └── Continue to next task
```

## Phase 4: Complete

**Trigger**: All tasks completed or blocked, user requests completion

**Actions**:
1. Verify all tasks have final status
2. Generate completion summary
3. Update SPRINT-LOG.md with summary
4. Move sprint folder to Archive
5. Update MASTER-SPRINT.md (move to Recent Completions)
6. Update SPRINT-INDEX.md status
7. Link to next sprint if exists
8. Clear or update local state
9. Auto-commit if enabled

**Completion Summary Includes**:
- Total duration
- Task counts by status
- Key accomplishments
- Blocked items (for carry-forward)
- Lessons learned

## State Transitions

### Task States

```
PENDING ──────▶ IN_PROGRESS ──────▶ COMPLETED
                     │
                     │ (3 failures)
                     ▼
                  BLOCKED
```

### Sprint States

```
ACTIVE ──────▶ COMPLETE
   │
   │ (all tasks blocked)
   ▼
STALLED (requires intervention)
```

## File Update Sequence

### On Sprint Create
1. Create SPRINT-PLAN.md
2. Create SPRINT-LOG.md
3. Update MASTER-SPRINT.md
4. Update SPRINT-INDEX.md
5. Update .sprint-state.local

### On Task Complete
1. Update SPRINT-LOG.md (task entry)
2. Update SPRINT-LOG.md (progress table)
3. Update .sprint-state.local (last_task)
4. Git commit (if significant)

### On Sprint Complete
1. Update SPRINT-LOG.md (completion summary)
2. Move to Archive/
3. Update MASTER-SPRINT.md
4. Update SPRINT-INDEX.md
5. Update .sprint-state.local
6. Git commit

## Branch-Based Concurrency

Multiple developers can work simultaneously:

```
main
  │
  ├── feat/user-auth (Developer A)
  │   └── Sprint-user-auth-01-login
  │
  ├── feat/api-v2 (Developer B)
  │   └── Sprint-api-v2-01-endpoints
  │
  └── fix/bug-123 (Developer C)
      └── Sprint-bug-123-01-fix
```

**Isolation**:
- Each branch has own sprint folder
- Session logs namespaced by branch
- Local state tracks per-branch state
- No merge conflicts on sprint files

## Time Targets

| Operation | Target Time |
|-----------|-------------|
| Sprint Create | < 1 minute |
| Sprint Start (with context recovery) | < 2 minutes |
| Task Execution | Varies by task |
| Sprint Complete | < 1 minute |
| Context Recovery (quick) | < 30 seconds |
| Context Recovery (full) | < 5 minutes |

## Error Recovery

### Sprint Start Fails
- Check branch matches expected
- Verify sprint files exist
- Run context recovery
- Check for file permission issues

### Task Execution Fails
- Log error in SPRINT-LOG.md
- Increment attempt counter
- If < 3 attempts: retry
- If >= 3 attempts: mark blocked, continue

### Sprint Complete Fails
- Check all tasks have status
- Verify archive directory exists
- Check git status for conflicts
- Manual intervention may be needed
