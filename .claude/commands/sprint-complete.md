---
description: Complete current sprint and transition to next
---

# Sprint Completion Protocol

This command completes the current sprint, captures lessons learned, and prepares for the next sprint.

**Framework Version:** 2.0.0 (Branch-Based Concurrent Sprints)

## Usage

```
/sprint-complete
```

---

## Pre-Completion Checklist

Before completing a sprint, verify:

- [ ] All tasks marked COMPLETED or BLOCKED
- [ ] SPRINT-LOG.md has execution details for all tasks
- [ ] All autonomous decisions documented
- [ ] No uncommitted changes in working directory
- [ ] Tests pass (for implementation sprints)
- [ ] `.sprint-state.local` is up to date

---

## Completion Steps

### Step 1: Verify Current Branch

```bash
git branch --show-current
```

Ensure you're completing the sprint for the correct branch.

### Step 2: Finalize Sprint Log

Update `SPRINT-LOG.md` with:
- Final status for all tasks
- Execution summary (started, completed, status)
- Files modified table
- Commit references

### Step 3: Finalize Session Log

Close the session log in `Logs/sessions/`:

```markdown
## Session Complete

**Ended:** 2026-01-06T15:30:00Z
**Duration:** 5 hours
**Tasks Completed:** 5/5
**Status:** Sprint Complete
```

### Step 4: Evaluate Lessons Learned

In SPRINT-LOG.md "Lessons Learned" section:
1. Document any insights from this sprint
2. Score each against incorporation criteria:
   - Recurrence (has this happened before?)
   - Impact (did it cause delays?)
   - Generalizability (applies beyond this sprint?)
   - Actionability (can be a clear rule?)
3. If 3+ criteria score HIGH, incorporate into policy

### Step 5: AI Discoverability Update Check (Conditional)

**When**: `ai_discoverability.enabled: true` AND `maintenance.on_sprint_complete: true`

Check if AI discoverability artifacts need updating based on sprint changes:

```python
def check_ai_discoverability_updates(config, sprint_log, project_root):
    """Check if AI discoverability artifacts need regeneration."""

    if not config.ai_discoverability.enabled:
        return

    if not config.ai_discoverability.maintenance.on_sprint_complete:
        return

    needs_update = []

    # Parse files modified in this sprint from SPRINT-LOG.md
    modified_files = parse_sprint_log_modified_files(sprint_log)

    # Check for route/page changes -> sitemap update
    page_patterns = ["pages/", "views/", "components/", ".html", ".tsx", ".jsx"]
    if any(any(p in f for p in page_patterns) for f in modified_files):
        needs_update.append("sitemap_xml")
        log("Detected page changes - sitemap.xml needs update")

    # Check for API changes -> OpenAPI update
    api_patterns = ["routes/", "controllers/", "api/", "endpoints/"]
    if any(any(p in f for p in api_patterns) for f in modified_files):
        needs_update.extend(["openapi_spec", "ai_plugin_json"])
        log("Detected API changes - openapi.yaml needs update")

    # Execute updates
    if needs_update:
        for artifact in set(needs_update):
            run_command(f"/ai-discover-generate --artifact {artifact}")
```

### Step 6: Update MASTER-SPRINT.md

Update the "Active Sprints by Branch" table:
- Change status from `Active` to `Completed`
- Update `Last Activity` date

Add to "Recent Completions":
```markdown
| 2026-01-06 | feat/user-auth | Sprint-user-auth-01-login | Login implementation | - |
```

### Step 7: Update SPRINT-INDEX.md

Update the sprint row:
```markdown
| Sprint-user-auth-01-login | feat/user-auth | 2026-01-05 | Completed | - |
```

### Step 8: Update Local State

Update `.sprint-state.local`:
```yaml
active_sprint: null  # or next sprint if created
last_updated: 2026-01-06T15:30:00Z
deadlock_counter: 0  # reset for next sprint
```

### Step 9: Commit Changes

```bash
git add .
git commit -m "Sprint [user-auth-01]: Complete

Tasks completed:
- T001: Setup login component
- T002: Add form validation
- T003: API integration
- T004: Error handling
- T005: Unit tests

Status: Complete (5/5 tasks)
Branch: feat/user-auth

🤖 Generated with Claude Code"

git push
```

### Step 10: Context Reset (Optional)

If starting a new sprint:
- Run `/clear` to reset context
- Run `/sprint-new` for next sprint

If continuing on same branch:
- Keep context
- Proceed with next sprint

---

## Sprint Transition

After completion, identify the next sprint:

1. Check if more work needed on this branch
2. If yes: `/sprint-new` to create next sprint
3. If no: Branch is ready for merge to main

---

## Branch Merge Workflow

When branch work is complete and ready to merge:

### Pre-Merge Checklist
- [ ] All sprints on branch completed
- [ ] SPRINT-INDEX.md rows updated
- [ ] MASTER-SPRINT.md updated
- [ ] No uncommitted changes
- [ ] Tests pass

### Merge Process
```bash
git checkout main
git merge feat/user-auth
```

### Post-Merge Updates

Update SPRINT-INDEX.md:
```markdown
| Sprint-user-auth-01-login | feat/user-auth | 2026-01-05 | Completed | main |
```

Update MASTER-SPRINT.md "Recent Completions":
```markdown
| 2026-01-06 | feat/user-auth | Sprint-user-auth-01-login | Login implementation | main |
```

### Archive Sprint Folder (Optional)

Move completed branch sprints to Archive:
```bash
mv Sprints/Active/user-auth/ Sprints/Archive/user-auth/
```

---

## Completion Message Format

```
## Sprint [{BRANCH_SHORT}-{NUMBER}] Complete

**Branch**: {branch name}
**Summary**: [Brief summary of what was accomplished]

**Tasks Completed**: X/Y
- [Task 1]: [Brief result]
- [Task 2]: [Brief result]

**Lessons Learned**:
- [Lesson 1]

**Next**:
- [ ] Create next sprint: /sprint-new
- [ ] Merge to main: git merge

Committed: [commit hash]
```

---

## Partial Completion

If sprint cannot be fully completed:

1. Mark incomplete tasks as BLOCKED with reason
2. Create exception entries in EXCEPTIONS-LOG.md
3. Update `.sprint-state.local` with current state
4. Commit partial progress with "WIP" prefix

```bash
git commit -m "WIP Sprint [user-auth-01]: Partial progress

Completed:
- T001: Login component
- T002: Validation

Blocked:
- T003: API integration - waiting for backend

See SPRINT-LOG.md for details"
```

---

## Concurrent Completion Notes

When multiple developers complete sprints:

1. **No conflicts on branch-specific files**
   - Each sprint is in its own namespace
   - Session logs are separate files

2. **Minimal conflicts on shared files**
   - SPRINT-INDEX.md: Append-only rows
   - MASTER-SPRINT.md: Update own branch row only

3. **Merge strategy for index files**
   - Use `git merge -X theirs` for append-only files
   - Or manually merge (rows are independent)
