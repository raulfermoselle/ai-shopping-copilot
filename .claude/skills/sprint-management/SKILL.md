---
name: sprint-management
description: |
  Manage AI-assisted development sprints. Automatically triggers when:
  - User mentions "sprint", "start sprint", "new sprint", "complete sprint"
  - Discussing task execution or progress tracking
  - Working on structured development workflows
  - Resuming work after a break or /clear
  - User asks about sprint status or progress
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Sprint Management Skill

This skill manages the complete sprint lifecycle for AI-assisted development using the Sprint Management Framework.

## When This Skill Activates

This skill automatically triggers when you:
- Start working on a project with `Sprints/` directory
- Mention sprint-related terms (start, complete, new, status)
- Need to track task progress
- Resume work after context reset
- Ask about "what's next" or "current tasks"

## Core Capabilities

### Sprint Lifecycle

| Action | Trigger Phrases | Description |
|--------|-----------------|-------------|
| **Start Sprint** | "start sprint", "resume work", "begin sprint" | Context recovery + begin execution |
| **New Sprint** | "create sprint", "new sprint", "add sprint" | Initialize new sprint structure |
| **Sprint Status** | "sprint status", "progress", "what's next" | Show current state and next task |
| **Complete Sprint** | "finish sprint", "complete sprint", "done" | Finalize, archive, link to next |

### Autonomous Execution

When executing sprint tasks, this skill delegates to the `sprint-executor` agent for:
- Isolated context (verbose output stays in agent)
- Autonomous task-by-task execution
- Deadlock handling (3 failures → mark blocked, continue)
- Progress logging in SPRINT-LOG.md

## Quick Reference

### Start Sprint
1. Run context recovery (delegates to context-recovery skill)
2. Load active sprint's SPRINT-PLAN.md
3. Identify next incomplete task
4. Begin autonomous execution

### Create New Sprint
1. Determine sprint type (implementation, research, bugfix, etc.)
2. Generate sprint folder structure
3. Create SPRINT-PLAN.md from template
4. Create SPRINT-LOG.md
5. Update MASTER-SPRINT.md
6. Update SPRINT-INDEX.md

### Check Status
1. Read `.sprint-state.local` for quick state
2. Parse SPRINT-LOG.md for progress
3. Count tasks by status
4. Report next task and blockers

### Complete Sprint
1. Verify all tasks completed or blocked
2. Update SPRINT-LOG.md with completion summary
3. Archive sprint (move to Archive/)
4. Update MASTER-SPRINT.md
5. Link to next sprint if exists

## Supporting Files

- [WORKFLOWS.md](WORKFLOWS.md) - Detailed execution protocols
- [TEMPLATES.md](TEMPLATES.md) - Sprint templates and structures
- [LIFECYCLE.md](LIFECYCLE.md) - Complete lifecycle documentation

## Integration

- **Uses**: context-recovery skill for session recovery
- **Delegates to**: sprint-executor agent for task execution
- **Delegates to**: test-runner agent for test verification
- **Framework Version**: 2.0.0+ (Branch-Based Concurrent Sprints)

## Constitution Compliance

This skill enforces the Sprint Management Constitution:
- **Article I**: All work within sprint context
- **Article III**: Test-first development (NON-NEGOTIABLE)
- **Article IV**: Autonomous execution without interruption
- **Article X**: Deadlock resolution (3 failures → blocked, continue)
