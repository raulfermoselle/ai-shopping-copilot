# AI Context Management Policy

<!-- LOCK_STATUS: MICHELIN -->
<!-- LOCK_REASON: Core context management - human oversight required -->

## Overview

This policy defines how AI assistants should manage context during sprint execution, including recovery procedures, context limits, and handoff protocols.

---

## Context Recovery Protocol

### After /clear Command - Canonical Checklist

Execute these steps in order after any context reset:

```
1. Check .sprint-state.local         # Branch-specific state (if exists)
2. Read README.md                    # Project overview
3. Read MASTER-SPRINT.md             # Current state
4. Read Logs/MASTER-LOG.md           # Recent session notes
5. Read Logs/EXCEPTIONS-LOG.md       # Pending issues
6. Identify active sprint for your branch
   - If .sprint-state.local exists: use active_sprint field
   - Otherwise: find your branch in MASTER-SPRINT.md table
7. Read active sprint's SPRINT-PLAN.md
8. Read active sprint's SPRINT-LOG.md
9. Resume from last completed task (check .sprint-state.local.last_task)
```

### Concurrent Mode Recovery

When `concurrency.enabled: true`:

1. **Priority Order**: `.sprint-state.local` takes precedence over MASTER-SPRINT.md
2. **Branch Detection**: Automatically detect current Git branch
3. **Namespace Isolation**: Only load sprints from your branch's namespace
4. **Session Logs**: Check `Logs/sessions/` for recent session history

### Recovery Time Target
- Complete recovery checklist within 5 minutes
- Begin task execution immediately after recovery

---

## Context Limits

### Sprint Size Limits (AI Context Aware)

Due to AI context limitations, sprints must be:
- **Maximum 5-7 tasks** per sprint
- **Each task should be completable in one context session**
- **Complex tasks must be broken into sub-sprints**

### Context Usage Best Practices

1. **Front-load reading**: Read all necessary files early in session
2. **Minimize re-reads**: Reference line numbers, not full file contents
3. **Batch writes**: Group related file writes together
4. **Use summaries**: Summarize long outputs instead of full dumps
5. **Track usage**: Monitor context consumption during sprint

---

## Session Management

### Starting a Session

1. Execute context recovery protocol
2. Verify current sprint status
3. Check for any blocked tasks
4. Begin from next incomplete task

### During a Session

1. Update SPRINT-LOG.md as tasks complete
2. Document decisions made
3. Track deadlock counter
4. Monitor context usage

### Ending a Session

#### Normal Completion (Sprint Done)
1. Update SPRINT-LOG.md with final status
2. Update MASTER-SPRINT.md
3. Commit changes
4. Run `/clear`
5. Start next sprint

#### Context Exhaustion (Mid-Sprint)
1. Document progress in SPRINT-LOG.md
2. Note the last completed task
3. Update MASTER-LOG.md with session notes
4. Commit partial progress
5. Run `/clear`
6. Resume from recovery protocol

---

## Handoff Protocol

### Information to Preserve

When context resets, the next session needs:
- **Current task**: Which task was being worked on
- **Progress**: What was completed
- **Decisions**: Key decisions made this session
- **Blockers**: Any issues encountered
- **Files modified**: List of changed files

### Where to Record

| Information | Location |
|-------------|----------|
| Task progress | SPRINT-LOG.md |
| Session summary | MASTER-LOG.md |
| Blockers | EXCEPTIONS-LOG.md |
| Decisions | SPRINT-LOG.md (Autonomous Decisions) |

---

## Context Estimation

### Before Starting a Sprint

Estimate context usage:
- Count files to read
- Count files to create/modify
- Estimate task complexity
- Plan for buffer (20%)

### Warning Signs of Context Exhaustion

- Responses becoming slower
- Forgetting earlier context
- Repeating questions
- Truncated outputs

### Response to Warning Signs

1. Pause current task
2. Document progress immediately
3. Commit any changes
4. Plan for context reset

---

## Multi-Session Sprint Management

### For Large Sprints

If a sprint spans multiple sessions:

1. **Session 1**: Complete tasks T001-T003
   - Update SPRINT-LOG.md
   - Commit progress
   - Note stopping point

2. **Session 2**: Recovery + Continue
   - Execute recovery protocol
   - Read SPRINT-LOG.md for progress
   - Continue from T004

3. **Final Session**: Complete sprint
   - Finish remaining tasks
   - Execute completion protocol

---

## Related Policies

- [POLICY-Vibe-Sprint.md](./POLICY-Vibe-Sprint.md) - Sprint execution rules
- [POLICY-Global-Scheduler.md](./POLICY-Global-Scheduler.md) - Scheduler workflow

---

*Version 2.0 - Part of Sprint Management Framework*
