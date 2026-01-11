---
description: Complete current sprint and transition to next
---

# Sprint Complete

**Usage**: `/sprint-complete`

Completes the current active sprint, captures lessons learned, and prepares for the next sprint.

## Execution

**Use the `sprint-manager` agent to execute this command.**

The agent will:
1. Verify all tasks are COMPLETED or BLOCKED
2. Finalize SPRINT-LOG.md with completion details
3. Document lessons learned
4. Update MASTER-SPRINT.md (status, metrics, recent completions)
5. Commit the completion
6. Report summary and next sprint recommendation

## Pre-Completion Checklist

The agent verifies:
- [ ] All tasks marked COMPLETED or BLOCKED
- [ ] SPRINT-LOG.md has execution details
- [ ] No uncommitted changes (warns if dirty)
- [ ] Lessons learned documented

## Completion Updates

**SPRINT-LOG.md**:
- Final task statuses
- Completion date
- Files modified table
- Lessons learned section

**MASTER-SPRINT.md**:
- Sprint status → Completed
- Add to Recent Completions table
- Update Active Sprints count
- Update Sprint Queue (next sprint)

## Commit Format

```
docs(sprint-{id}): Complete sprint - {summary}

Tasks completed: X/Y
- Task 1 result
- Task 2 result

Lessons learned:
- Lesson 1

Next: Sprint-{next-id}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Partial Completion

If some tasks are BLOCKED:
- Document blockers in SPRINT-LOG.md
- Create entries in EXCEPTIONS-LOG.md if needed
- Complete with "Partial" status
- Recommend next steps
