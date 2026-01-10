---
description: Begin work on a sprint with full context recovery
---

# Sprint Start Protocol

This command initiates work on a sprint by executing the context recovery protocol and beginning autonomous execution.

**Framework Version:** 2.0.0 (Branch-Based Concurrent Sprints)

## Usage

```
/sprint-start [sprint-id]
```

If no sprint-id is provided:
1. First check `.sprint-state.local` for branch-specific active sprint
2. Fall back to MASTER-SPRINT.md for the current branch

## Context Recovery Steps (v2.0)

Execute these steps in order:

### Step 0: Check Local State (NEW in v2.0)

**Read**: `Sprints/.sprint-state.local` (if exists)

```yaml
branch: feat/user-auth
branch_short: user-auth
active_sprint: Sprint-user-auth-01-login
sprint_path: Active/user-auth/Sprint-user-auth-01-login
session_id: abc123
deadlock_counter: 0
last_task: T003
last_updated: 2026-01-06T10:30:00Z
```

**Verify branch matches current git branch:**
```bash
git branch --show-current
```

If branch mismatch:
- Warn user
- Offer to switch or create new sprint for current branch

### Step 1: Project Overview
Read `README.md` to understand project structure and goals.

### Step 2: Sprint State
Read `Sprints/MASTER-SPRINT.md` to get:
- Active sprints by branch (find your branch)
- Recent completions
- Any global blockers

### Step 3: Recent Activity
**Branch-specific session logs first:**
```
Sprints/Logs/sessions/{DATE}-{BRANCH_SHORT}-*.md
```

Then check `Sprints/Logs/MASTER-LOG.md` for curated highlights.

### Step 4: Check Blockers
Read `Sprints/Logs/EXCEPTIONS-LOG.md` for:
- Any pending exceptions
- Tasks that are blocked
- Required human actions

### Step 5: Active Sprint Plan
Read the active sprint's `SPRINT-PLAN.md`:
```
Sprints/Active/{BRANCH_SHORT}/Sprint-{BRANCH_SHORT}-XX-{NAME}/SPRINT-PLAN.md
```

Understand:
- Sprint goals and success criteria
- Task breakdown (max 5-7 tasks)
- Dependencies and blockers
- Technical notes

### Step 6: Sprint Progress
Read the active sprint's `SPRINT-LOG.md` to see:
- Completed tasks
- In-progress tasks
- Deadlock tracking
- Autonomous decisions made

### Step 7: Resume Work
Begin execution from the next incomplete task (or from `last_task` in local state).

---

## Local State Management

### Reading Local State

```python
def load_local_state():
    state_file = "Sprints/.sprint-state.local"
    if os.path.exists(state_file):
        with open(state_file) as f:
            return yaml.safe_load(f)
    return None
```

### Updating Local State

After each significant action, update:

```yaml
last_task: T004
last_updated: 2026-01-06T11:45:00Z
deadlock_counter: 0  # or increment on retry
```

### Session ID

Generate a new session ID when starting:
```python
session_id = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=6))
```

This helps track session logs: `2026-01-06-user-auth-abc123.md`

---

## Autonomous Execution Rules

During sprint execution, you MUST:
- Execute tasks without stopping to ask questions
- Make autonomous decisions and document them in SPRINT-LOG.md
- Follow existing patterns in the codebase
- Update SPRINT-LOG.md as tasks complete
- Log uncertainties but continue execution
- Update `.sprint-state.local` with progress

You MUST NOT:
- Use AskUserQuestion tool during execution
- Stop to wait for clarification
- Request approval for implementation choices
- Present options and wait for selection
- End with questions

---

## Task Execution Loop

For each task in the sprint:

1. **Mark IN_PROGRESS**
   - Update task status in SPRINT-LOG.md
   - Update `last_task` in `.sprint-state.local`

2. **Execute Task**
   - Follow the task description
   - Create/modify files as needed
   - Run tests if required

3. **Document Progress**
   - Log implementation details
   - Record files modified
   - Note any decisions made

4. **Mark Status**
   - COMPLETED: Task finished successfully
   - BLOCKED: Cannot proceed (log in EXCEPTIONS-LOG.md)

5. **Check Deadlock**
   - If same task attempted 3+ times without progress
   - Increment `deadlock_counter` in local state
   - Log exception and move to next task

---

## Deadlock Handling

If a task is attempted 3+ times without progress:

1. Update `.sprint-state.local`:
   ```yaml
   deadlock_counter: 3
   ```

2. Log in SPRINT-LOG.md under "Deadlock Tracking"

3. Create entry in EXCEPTIONS-LOG.md

4. Mark task as BLOCKED (not failed)

5. Move to next task

6. Continue execution

Never stop the entire workflow due to a blocked task.

---

## Session Logging (v2.0)

Create a session log file:
```
Sprints/Logs/sessions/{DATE}-{BRANCH_SHORT}-{SESSION_ID}.md
```

**Example:** `2026-01-06-user-auth-abc123.md`

**Contents:**
```markdown
# Session Log: 2026-01-06-user-auth-abc123

**Branch:** feat/user-auth
**Sprint:** Sprint-user-auth-01-login
**Started:** 2026-01-06T10:30:00Z

## Tasks Worked On
- T003: Implement login form (COMPLETED)
- T004: Add validation (IN_PROGRESS)

## Decisions Made
- Used React Hook Form for validation
- ...

## Files Modified
- src/components/LoginForm.tsx
- ...

## Notes for Next Session
- ...
```

---

## Commit Format

When committing progress:

```
Sprint [{BRANCH_SHORT}-{NUMBER}]: {Summary}

Tasks completed:
- [Task 1]
- [Task 2]

Status: [Complete/Partial]
Next: [Next action]
```

**Example:**
```
Sprint [user-auth-01]: Implement login form

Tasks completed:
- T003: Login form component
- T004: Form validation

Status: Partial (3/5 tasks)
Next: T005 - API integration
```
