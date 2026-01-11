---
description: Show current sprint management status
---

# Sprint Status

**Usage**: `/sprint-status`

Display the current state of sprint management including active sprint, progress, recent completions, and queue.

## Execution

**Use the `sprint-manager` agent to execute this command.**

The agent will read MASTER-SPRINT.md and active sprint files to report:

1. **Active Sprint**: ID, goals, task progress (X/Y completed)
2. **Recent Completions**: Last 3-5 completed sprints
3. **Sprint Queue**: Next sprints in priority order
4. **Blockers**: Any blocked tasks or sprints

## Output Format

```
## Sprint Status

**Active Sprint**: Sprint-{ID}
- Goals: {summary}
- Progress: X/Y tasks completed
- Status: {In Progress / Blocked}

**Recent Completions**:
| Date | Sprint | Summary |
|------|--------|---------|
| ... | ... | ... |

**Queue**:
1. Sprint-{next} - {description}
2. Sprint-{after} - {description}

**Quick Actions**:
- `/sprint-start` - Continue active sprint
- `/sprint-complete` - Complete current sprint
- `/sprint-new` - Create new sprint
```

## Files Read

| File | Information |
|------|-------------|
| `Sprints/MASTER-SPRINT.md` | Global state, queue, completions |
| Active sprint's `SPRINT-PLAN.md` | Goals, tasks |
| Active sprint's `SPRINT-LOG.md` | Progress, status |
