# Context Recovery Steps

Detailed step-by-step protocol for recovering context in Sprint Management projects.

## Step 0: Check Local State (PRIORITY)

**File**: `Sprints/.sprint-state.local`

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

**Actions**:
1. Read the file if it exists
2. Verify branch matches current git branch:
   ```bash
   git branch --show-current
   ```
3. If branch matches: Fast recovery using local state
4. If branch mismatch: Proceed with full recovery for current branch

## Step 1: Project Overview

**File**: `README.md`

**Extract**:
- Project name and description
- Technology stack
- Directory structure
- Key documentation links

## Step 2: Sprint State

**File**: `Sprints/MASTER-SPRINT.md`

**Extract**:
- Active sprints table (find your branch)
- Overall project status
- Recent completions
- Global blockers

**v2.0 Format**:
```markdown
| Branch | Sprint | Status | Started | Last Activity |
|--------|--------|--------|---------|---------------|
| feat/user-auth | Sprint-user-auth-01-login | Active | 2026-01-06 | 2026-01-06 |
```

## Step 3: Recent Activity

**Priority 1 - Branch-specific session logs**:
```
Sprints/Logs/sessions/{DATE}-{BRANCH_SHORT}-*.md
```
Example: `2026-01-06-user-auth-abc123.md`

**Priority 2 - Curated highlights**:
```
Sprints/Logs/MASTER-LOG.md
```

**Look for**:
- Last session summary
- Key decisions made
- Notes for next session
- Files modified

## Step 4: Check Blockers

**File**: `Sprints/Logs/EXCEPTIONS-LOG.md`

**Check for**:
- Open exceptions
- Blocked tasks
- Required human actions
- Deadlock patterns

## Step 5: Active Sprint Plan

**Path pattern**:
```
Sprints/Active/{BRANCH_SHORT}/Sprint-{BRANCH_SHORT}-XX-{NAME}/SPRINT-PLAN.md
```

**Extract**:
- Sprint goals and success criteria
- Task breakdown (max 5-7 tasks)
- Dependencies
- Technical notes

## Step 6: Sprint Progress

**Path pattern**:
```
Sprints/Active/{BRANCH_SHORT}/Sprint-{BRANCH_SHORT}-XX-{NAME}/SPRINT-LOG.md
```

**Check**:
- Completed tasks with timestamps
- In-progress tasks
- Deadlock tracking section
- Autonomous decisions made

## Step 7: Update Local State

Create or update `.sprint-state.local`:

```yaml
branch: {current_branch}
branch_short: {branch_short}
active_sprint: {sprint_name}
sprint_path: {relative_path}
session_id: {new_6_char_id}
deadlock_counter: 0
last_task: {last_incomplete_task}
last_updated: {current_timestamp}
```

## Step 8: Resume Work

Begin execution from the next incomplete task.

---

## Quick Recovery (When Local State Exists)

If `.sprint-state.local` exists and branch matches:

1. Read `.sprint-state.local` → Get active sprint and last task
2. Read active sprint's `SPRINT-LOG.md` → Progress details
3. Resume from `last_task`

**Minimum reads**: 2 files instead of 7+

---

## Branch-Specific Recovery

When switching branches:

```bash
git checkout feat/api-v2
```

Then trigger recovery:

1. Detect branch change (compare to `.sprint-state.local`)
2. Search for sprints in `Active/{BRANCH_SHORT}/`
3. Load the appropriate sprint context
4. Update `.sprint-state.local` for new branch

---

## Recovery Time Targets

| Scenario | Target Time |
|----------|-------------|
| Quick recovery (local state exists) | < 30 seconds |
| Full recovery (new session) | < 5 minutes |
| Branch switch recovery | < 1 minute |
