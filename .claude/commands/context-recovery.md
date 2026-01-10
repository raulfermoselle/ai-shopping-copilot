---
description: Recover context after /clear or new session
---

# Context Recovery Protocol

This command guides the full context recovery process after a session reset or when starting fresh.

**Framework Version:** 2.0.0 (Branch-Based Concurrent Sprints)

## Usage

```
/context-recovery
```

---

## When to Use

Execute this protocol:
- After running `/clear`
- At the start of a new conversation
- When context seems lost or confused
- Before resuming work on a sprint
- When switching between branches

---

## Recovery Checklist (v2.0)

Execute these steps **in order**:

### Step 0: Check Local State (PRIORITY - NEW in v2.0)

**Read**: `Sprints/.sprint-state.local`

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

**Verify current git branch:**
```bash
git branch --show-current
```

**If branch matches local state:**
- Fast recovery: Use local state to jump directly to active sprint
- Read sprint files and resume from `last_task`

**If branch mismatch:**
- Local state is stale (from different branch)
- Proceed with full recovery for current branch
- May need to create new sprint for this branch

**If file doesn't exist:**
- First time on this branch, or v1.x project
- Proceed with standard recovery

### Step 1: Project Overview
**Read**: `README.md`

Purpose: Understand project structure, goals, and conventions.

Look for:
- Project description
- Technology stack
- Directory structure
- Key documentation links

### Step 2: Sprint State
**Read**: `Sprints/MASTER-SPRINT.md`

Purpose: Get current sprint management state.

Extract:
- Active sprints by branch (find YOUR branch)
- Overall status
- Recent completions

**v2.0 Format - Find your branch:**
```markdown
| Branch | Sprint | Status | Started | Last Activity |
|--------|--------|--------|---------|---------------|
| feat/user-auth | Sprint-user-auth-01-login | Active | 2026-01-06 | 2026-01-06 |
```

### Step 3: Recent Activity (Branch-Specific First)

**Priority 1 - Read session logs for your branch:**
```
Sprints/Logs/sessions/*-{BRANCH_SHORT}-*.md
```

Example: `2026-01-06-user-auth-abc123.md`

**Priority 2 - Read curated highlights:**
```
Sprints/Logs/MASTER-LOG.md
```

Look for:
- Last session summary
- Key decisions made
- Any notes for next session

### Step 4: Check Blockers
**Read**: `Sprints/Logs/EXCEPTIONS-LOG.md`

Purpose: Identify any pending issues.

Check for:
- Open exceptions
- Blocked tasks
- Required human actions

### Step 5: Active Sprint Plan
**Read**: Active sprint's `SPRINT-PLAN.md`

Path pattern:
```
Sprints/Active/{BRANCH_SHORT}/Sprint-{BRANCH_SHORT}-XX-{NAME}/SPRINT-PLAN.md
```

Extract:
- Sprint goals
- Task breakdown
- Dependencies
- Technical notes

### Step 6: Sprint Progress
**Read**: Active sprint's `SPRINT-LOG.md`

Path pattern:
```
Sprints/Active/{BRANCH_SHORT}/Sprint-{BRANCH_SHORT}-XX-{NAME}/SPRINT-LOG.md
```

Check:
- Completed tasks
- In-progress tasks
- Deadlock tracking
- Autonomous decisions

### Step 7: Update Local State

Create/update `.sprint-state.local` with recovered context:

```yaml
branch: feat/user-auth
branch_short: user-auth
active_sprint: Sprint-user-auth-01-login
sprint_path: Active/user-auth/Sprint-user-auth-01-login
session_id: {new random 6 chars}
deadlock_counter: 0
last_task: T003
last_updated: {now}
```

### Step 8: Resume Work
**Action**: Begin from next incomplete task.

---

## Recovery Summary Format

After completing recovery, provide summary:

```
## Context Recovery Complete

**Project**: [Project Name]
**Branch**: [Current git branch]
**Active Sprint**: Sprint-{BRANCH_SHORT}-XX - [Name]
**Status**: [Status]

**Progress**:
- Completed: X tasks
- Remaining: Y tasks
- Blocked: Z tasks

**Resume From**: Task TXXX - [Description]

**Key Context**:
- [Important decision or pattern from previous session]
- [Any blockers to be aware of]

**Local State**: Updated ✓

Ready to continue with /sprint-start
```

---

## Quick Recovery (Experienced Users)

If `.sprint-state.local` exists and branch matches:

1. Read `.sprint-state.local` - Get active sprint and last task
2. Read active sprint's `SPRINT-LOG.md` - Progress details
3. Resume from `last_task`

Minimum reads: 2 files instead of 7+

---

## Branch-Specific Recovery

When you switch branches:

```bash
git checkout feat/api-v2
/context-recovery
```

The recovery will:
1. Detect branch change (compare to `.sprint-state.local`)
2. Search for sprints in `Active/api-v2/`
3. Load the appropriate sprint context
4. Update `.sprint-state.local` for new branch

---

## Troubleshooting

### No Active Sprint Found for Branch

1. Check if sprints exist for this branch:
   ```
   Sprints/Active/{BRANCH_SHORT}/
   ```

2. If folder missing:
   - First sprint on this branch
   - Create with `/sprint-new`

3. If folder exists but empty:
   - All sprints completed
   - Create new sprint or merge branch

### Sprint Files Missing

1. Verify sprint folder exists in `Sprints/Active/{BRANCH_SHORT}/`
2. Check SPRINT-INDEX.md for correct path
3. Sprint may have been archived - check `Sprints/Archive/`

### Local State File Missing

1. First session on this machine/branch
2. Running a v1.x project (upgrade with `/sprint-upgrade`)
3. File was deleted - will be recreated on next sprint operation

### Branch Mismatch Warning

If `.sprint-state.local` shows different branch:

```
⚠️ Local state is for branch: feat/user-auth
   Current git branch: feat/api-v2

Options:
1. Switch back: git checkout feat/user-auth
2. Continue on current branch (will search for api-v2 sprints)
3. Create new sprint for current branch: /sprint-new
```

### Deadlock Counter High

- Review EXCEPTIONS-LOG.md for patterns
- Consider whether tasks need to be broken down
- May need human intervention
- Reset with new sprint if unrecoverable

### Context Still Confused

1. Re-read files more carefully
2. Check git log for recent changes
3. Review session logs for this branch
4. Check git status for uncommitted changes

---

## Post-Recovery Actions

After recovery, you can:
- `/sprint-start` - Begin work on active sprint
- `/sprint-status` - Show detailed status
- `/sprint-new` - Create a new sprint
- `/sprint-complete` - Finish current sprint
- `/sprint-upgrade` - Upgrade framework version
