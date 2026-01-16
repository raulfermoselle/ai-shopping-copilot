# Context Recovery Troubleshooting

Guide for resolving common issues during context recovery.

## No Active Sprint Found for Branch

**Symptoms**: Recovery cannot find an active sprint for the current branch.

**Solutions**:

1. Check if sprints exist for this branch:
   ```
   Sprints/Active/{BRANCH_SHORT}/
   ```

2. If folder missing:
   - This is the first sprint on this branch
   - Create with `/sprint-new` or use sprint-management skill

3. If folder exists but empty:
   - All sprints have been completed
   - Create new sprint or consider merging the branch

---

## Sprint Files Missing

**Symptoms**: SPRINT-PLAN.md or SPRINT-LOG.md not found.

**Solutions**:

1. Verify sprint folder exists in `Sprints/Active/{BRANCH_SHORT}/`
2. Check `SPRINT-INDEX.md` for correct path
3. Sprint may have been archived - check `Sprints/Archive/`
4. If files are truly missing, recreate from template

---

## Local State File Missing

**Symptoms**: `Sprints/.sprint-state.local` doesn't exist.

**Causes**:
- First session on this machine/branch
- Running a v1.x project (upgrade with `/sprint-upgrade`)
- File was accidentally deleted

**Solutions**:
- File will be recreated during next sprint operation
- Proceed with full recovery protocol
- Local state is convenience, not required

---

## Branch Mismatch Warning

**Symptoms**: Local state shows different branch than current git branch.

**Message**:
```
Warning: Local state is for branch: feat/user-auth
Current git branch: feat/api-v2
```

**Options**:
1. Switch back to the saved branch:
   ```bash
   git checkout feat/user-auth
   ```
2. Continue on current branch (will search for api-v2 sprints)
3. Create new sprint for current branch

---

## Deadlock Counter High

**Symptoms**: `deadlock_counter` in local state is 3 or higher.

**Causes**:
- Task has been attempted multiple times without success
- Missing dependencies or prerequisites
- Task specification unclear

**Solutions**:
1. Review `EXCEPTIONS-LOG.md` for patterns
2. Consider whether task needs to be broken down
3. May need human intervention
4. Reset counter if issue is resolved:
   ```yaml
   deadlock_counter: 0
   ```

---

## Context Still Confused After Recovery

**Symptoms**: Claude still seems to lack important context.

**Solutions**:

1. Re-read files more carefully
2. Check git log for recent changes:
   ```bash
   git log --oneline -10
   ```
3. Review session logs for this branch
4. Check git status for uncommitted changes:
   ```bash
   git status
   ```
5. Look for notes in SPRINT-LOG.md "Notes for Next Session" section

---

## MASTER-SPRINT.md Out of Sync

**Symptoms**: Active sprints table doesn't match actual state.

**Solutions**:

1. Run sprint status check to verify actual state
2. Update MASTER-SPRINT.md manually if needed
3. Check if recent sprint operations failed mid-way
4. Verify git status for uncommitted changes

---

## Session Logs Not Found

**Symptoms**: No session logs in `Sprints/Logs/sessions/`

**Causes**:
- First session (no prior logs)
- Logs directory missing
- Branch naming inconsistency

**Solutions**:
1. Create the sessions directory if missing
2. Check for logs with different naming patterns
3. Proceed without session context (use SPRINT-LOG.md instead)

---

## Permission Errors

**Symptoms**: Cannot read or write sprint files.

**Solutions**:
1. Check file permissions
2. Verify you have write access to the repository
3. Check if files are locked by another process
4. On Windows, check for antivirus interference

---

## Recovery Taking Too Long

**Symptoms**: Recovery exceeds 5 minute target.

**Causes**:
- Large number of files to scan
- Network storage delays
- Too many session logs

**Solutions**:
1. Use local state for quick recovery when possible
2. Archive old session logs periodically
3. Keep sprint structure organized
4. Ensure `.sprint-state.local` is being updated

---

## Post-Recovery Actions

After successful recovery, you can:
- `/sprint-start` - Begin work on active sprint
- `/sprint-status` - Show detailed status
- `/sprint-new` - Create a new sprint
- `/sprint-complete` - Finish current sprint
- `/sprint-upgrade` - Upgrade framework version
