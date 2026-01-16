---
name: context-recovery
description: |
  Recover full context after session reset or /clear. Automatically triggers when:
  - Starting a new conversation in a Sprint Management project
  - User mentions "context", "recover", "resume", "where was I"
  - Claude detects confusion about project state
  - After executing /clear command
  - User asks "what's the current state?" or similar questions
allowed-tools: Read, Glob, Grep, Bash
context: fork
agent: context-analyzer
---

# Context Recovery Skill

Rapid context recovery for seamless session continuity in Sprint Management projects.

## When This Skill Activates

This skill automatically triggers when:
- New conversation starts in a project with `Sprints/` directory
- After `/clear` command execution
- User asks "where was I?", "what's the current state?", "resume work"
- Claude seems confused about project context
- User mentions "context recovery" or "recover context"

## Recovery Priority (v2.0 Branch-Based)

Recovery follows this priority order for speed:

### Priority 1: Local State (Fastest - < 30 seconds)
Read `Sprints/.sprint-state.local` for:
- Current branch and active sprint
- Last task worked on
- Session ID for log continuity
- Deadlock counter state

### Priority 2: Branch State
Read `Sprints/MASTER-SPRINT.md` for:
- Active sprints by branch (find current branch)
- Recent completions
- Global blockers

### Priority 3: Session Logs
Read recent session logs from:
```
Sprints/Logs/sessions/{DATE}-{BRANCH_SHORT}-*.md
```

### Priority 4: Full Recovery (< 5 minutes)
Complete file scan when local state unavailable.

## Quick Recovery Commands

| Situation | Action |
|-----------|--------|
| Resume work | Read local state → active sprint → continue |
| After /clear | Full context recovery protocol |
| Branch switch | Detect mismatch → load new branch context |
| New session | Check local state → verify branch → resume |

## Delegation

This skill delegates read-only analysis to the `context-analyzer` agent for:
- Isolated context (keeps main conversation clean)
- Fast execution (uses Haiku model)
- Safe operation (read-only tools only)

## Output Format

After recovery, provide structured summary:

```
## Context Recovery Complete

**Project**: [Name from README]
**Branch**: [Current git branch]
**Active Sprint**: Sprint-{ID} - [Name]
**Status**: [Active/Blocked/Complete]

**Progress**:
- Completed: X tasks
- Remaining: Y tasks
- Blocked: Z tasks

**Resume From**: Task TXXX - [Description]

**Key Context**:
- [Important decision from previous session]
- [Any blockers to be aware of]

Ready to continue.
```

## Supporting Files

- [RECOVERY-STEPS.md](RECOVERY-STEPS.md) - Detailed step-by-step protocol
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Error resolution guide

## Integration

- **Triggers**: Automatic on context keywords
- **Delegates to**: context-analyzer agent
- **Works with**: sprint-management skill
- **Framework Version**: 2.0.0+ (Branch-Based)
